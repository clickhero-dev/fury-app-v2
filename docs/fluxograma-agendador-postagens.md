# Fluxograma — Agendador de Postagens (publish-due)

> Fonte: código real (`apps/api`). Última revisão: 2026-09, branch `chore/calendario-planejamento`.
> Responsável por publicar automaticamente os posts aprovados do calendário quando chega a hora agendada.

## Visão geral

- **Scheduler**: enfileira 1 "tick" por minuto no BullMQ (`* * * * *`), fila `publish-due` — `apps/api/src/lib/publish-due-manager.ts:11`
- **Worker**: processa o tick com **concurrency 1** (um tick por vez), itera **todos os tenants** e chama `publishDuePosts(tenantId)` — falha de um tenant não derruba os demais (try/catch por tenant) — `apps/api/src/workers/publish-due.worker.ts:12`
- **Service**: `publishDuePosts` no `PlannerService` resolve a conta Instagram, lista os posts vencidos e publica um a um — `apps/api/src/services/planner/planner.service.ts:565`

## Fluxograma

```mermaid
flowchart TD
    subgraph TRIG["Gatilhos"]
        T1["Scheduler BullMQ<br/>tick a cada 1 min<br/>publish-due-manager.ts"]
        T2["POST /planner/cron/publish-due<br/>cron externo, sem auth<br/>planner.routes.ts:43"]
        T3["POST /planner/posts/publish-due<br/>usuário autenticado<br/>planner.routes.ts:40"]
    end

    T1 --> W["Worker BullMQ<br/>concurrency 1<br/>publish-due.worker.ts"]
    T2 --> C{"Auth?"}
    T3 --> C
    C -- "cron (sem tenant)" --> C1["Itera TODOS os tenants<br/>planner.controller.ts:221"]
    C -- "tenant logado" --> C2["Somente o próprio tenant<br/>superadmin: todos"]
    C1 --> W2
    C2 --> W2["publishDuePosts(tenantId)<br/>planner.service.ts:565"]

    W --> LOOP{"Para cada tenant<br/>try/catch individual"}
    LOOP --> W2
    LOOP -- "tenant falhou" --> NEXT["Loga erro e segue<br/>pro próximo tenant"]

    W2 --> RES["resolveInstagramAccount<br/>planner.service.ts:480"]
    RES --> R1{"Conexão Meta existe<br/>e tem accessToken?"}
    R1 -- "não" --> NULL["null — NÃO publica<br/>published: 0<br/>reason: no_instagram_account"]
    R1 -- "sim" --> R2{"selectedInstagramUserId<br/>vinculado?"}
    R2 -- "não vinculado" --> NULL
    R2 -- "sim" --> R3["Descriptografa token<br/>GET /me/accounts"]
    R3 --> R4{"Perfil vinculado presente<br/>com instagramUserId?"}
    R4 -- "não (revogado /<br/>página sem IG)" --> NULL
    R4 -- "sim" --> DUE

    DUE["listDuePosts — SQL<br/>planner.repository.ts:213"]
    DUE --> D1{"Posts elegíveis?"}
    D1 -- "0" --> END0["Fim — published: 0<br/>reason: no_due_posts"]
    D1 -- "N posts" --> PLOOP

    subgraph PLOOP["Loop por post"]
        P1{"postType é<br/>image ou reel?"} -- "não (outros tipos)" --> SKIP["Pula o post<br/>sem marcar nada"]
        P1 -- "sim" --> PUB["publishSinglePost<br/>planner.service.ts:529"]
        PUB --> P2{"imageUrl<br/>existe?"}
        P2 -- "não" --> ERR["throw — conta<br/>como tentativa falha"]
        P2 -- "sim" --> P3["createInstagramMedia<br/>imageUrl ou videoUrl + caption"]
        P3 --> P4{"É reel?"}
        P4 -- "sim" --> P5["Poll status do container<br/>3x (3s/6s/12s)<br/>até FINISHED"]
        P5 -- "não FINISHED<br/>após 3 polls" --> ERR
        P5 -- "FINISHED" --> P6
        P4 -- "não (image)" --> P6["publishInstagramMedia<br/>→ mediaId"]
        P6 --> OK["markPostPublished<br/>status: published<br/>platformPostId: mediaId<br/>attempts, limpa erro/retry"]
        ERR --> FAIL
        PUB -- "qualquer exceção<br/>do Graph API" --> FAIL{"attempts >= 3?"}
        FAIL -- "não" --> RETRY["setPostRetry<br/>nextRetryAt = agora + backoff<br/>[1, 5, 15] min<br/>status continua approved"]
        FAIL -- "sim" --> DEAD["markPostFailed<br/>status: failed<br/>lastPublishError<br/>sem mais retry"]
        RETRY --> VOLTA["Volta a ser elegível<br/>quando nextRetryAt vencer"]
    end

    PLOOP --> MAIS{"Mais posts<br/>na lista?"}
    MAIS -- "sim" --> PLOOP
    MAIS -- "não" --> ENDOK["Retorna { published, posts,<br/>pageName, instagramUsername }<br/>Worker loga se published > 0"]

    NULL --> ENDOK
    SKIP --> MAIS
    DEAD --> MAIS
    OK --> MAIS
    VOLTA -.->|"tick futuro"| DUE
```

## Regras de elegibilidade (`listDuePosts`)

Query SQL em `apps/api/src/repository/planner.repository.ts:213` — um post só entra na lista se **todas**:

| Condição | Campo |
|---|---|
| Do tenant | `tenantId` |
| Tem agendamento | `scheduledAt IS NOT NULL` |
| Hora chegou | `scheduledAt <= now` |
| Aprovado | `status = 'approved'` |
| Retry vencido ou nunca tentou | `nextRetryAt IS NULL OR nextRetryAt <= now` |

Filtro extra **fora do SQL**: só `postType = 'image' | 'reel'` são publicáveis (checado no loop do service) — outros tipos são pulados sem alterar status.

## Retry e backoff

| Tentativa (attempts) | Se falhar | Próxima tentativa |
|---|---|---|
| 1 | `setPostRetry` | +1 min |
| 2 | `setPostRetry` | +5 min |
| 3 | `markPostFailed` — estado final | sem retry |

- `attempts` incrementa a cada tentativa (`publishAttempts`).
- Enquanto espera retry, o post **continua `approved`** — volta a ser elegível sozinho no tick seguinte ao vencer `nextRetryAt`.
- Exaustão = `status: 'failed'` + `lastPublishError` com a mensagem da Graph API.
- Sucesso = `status: 'published'` + `platformPostId` (id do media no Instagram) + `publishedAt`.

## Falha segura — conta do Instagram (`resolveInstagramAccount`)

Fonte de verdade: `meta_connections.selected_instagram_user_id`, gravado **server-side** no save-selection. Qualquer dessas condições ⇒ **não publica nada do tenant** (retorna `null`, `published: 0`):

1. Sem conexão Meta ou sem `accessToken`.
2. Sem `selectedInstagramUserId` (perfil nunca vinculado) — publica em NINGUÉM, nem em outra conta disponível.
3. Perfil vinculado não aparece em `/me/accounts` com Instagram (revogado, página sem IG).

> Histórico: o antigo fallback `pagesWithIg[0]` ("primeira página com IG") publicava em conta errada (bug velora_studio → jeanvdentz, 2026-09). Foi removido de propósito — sem vínculo explícito = não executa.

## Arquivos envolvidos

| Arquivo | Papel |
|---|---|
| `apps/api/src/lib/publish-due-manager.ts` | Sobe scheduler + worker; agenda o tick `* * * * *` |
| `apps/api/src/lib/queue.ts` | Nome/fila BullMQ `publish-due` |
| `apps/api/src/workers/publish-due.worker.ts` | Tick → itera tenants → `publishDuePosts` |
| `apps/api/src/services/planner/planner.service.ts` | `publishDuePosts` (:565), `resolveInstagramAccount` (:480), `publishSinglePost` (:529) |
| `apps/api/src/repository/planner.repository.ts` | `listDuePosts` (:213), `markPostPublished` (:225), `markPostFailed` (:240), `setPostRetry` (:253) |
| `apps/api/src/controllers/planner.controller.ts` | Trigger manual/cron `handlePublishDue` (:218) |
| `apps/api/src/routes/planner.routes.ts` | Rotas `:40` (auth) e `:43` (cron sem auth) |

## Observações operacionais

- **Concurrency 1**: ticks não concorrem entre si; um tick longo atrasa o seguinte (não há sobreposição de execução do mesmo tenant).
- **Cron sem auth** (`/cron/publish-due`): protegido pela infraestrutura (API key no gateway), não por middleware de tenant — publica TODOS os tenants.
- **Logs**: `[publish-due]` (worker), `[publishDuePosts]` (service), `[resolveInstagram]` (vínculo/segurança). Publicação em conta errada aparecia só como divergência nos logs `[resolveInstagram]` — hoje bloqueada pelo vínculo explícito.
- Post sem `imageUrl` no momento do publish: lança erro e entra no fluxo normal de retry/falha.
