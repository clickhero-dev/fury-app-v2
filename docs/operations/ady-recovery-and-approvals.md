# Ady — continuidade, revisões e rollout

## O que é durável

- `0080`: snapshot causal do contexto e consultas confirmadas.
- `0081`: estado de recuperação por mensagem original, prazo, tentativas e
  reservas globais de requisições/tokens.
- `0082`: revisão congelada das propostas e claim durável de cada efeito.
- `chat_approvals.result`: evidência autoritativa gravada pela API antes de
  responder sucesso. Uma resposta perdida no Python não implica repetir a ação.

As tabelas privadas são isoladas pelo proprietário da conversa. Jobs/claims não
guardam delegação, senha ou prompt. Exclusão da conversa remove seus registros.
Dados brutos do histórico continuam sujeitos à política privada já existente.

## Recuperação automática

A API inicia `chat-turn-recovery.worker.ts` no bootstrap quando o chat está
configurado. O scan a cada cinco segundos é apenas o mecanismo de despertar;
**PostgreSQL é a fila e a fonte da verdade**, não o timer do processo.

O worker:

1. Reconcilia conclusões e leases expirados em lotes limitados.
2. Revalida identidade atual e assinatura, sem herdar permissões de um token velho.
3. Emite delegação curta, sem `humanIntent`.
4. Solicita retry do turno original e consome o stream sem armazenar/logar payload.
5. Após queda, outro processo encontra o mesmo trabalho no próximo scan.

Limites padrão por mensagem original: duas retomadas, dez minutos, dezoito envios
HTTP e 180.000 tokens **reservados conservativamente**, incluindo fallback e
resumos. Isso não é cobrança real em dólares. Cada envio é admitido no banco antes
de chamar o provedor; crash não devolve uma reserva potencialmente consumida.

Falhas de autenticação, entrada, ferramenta e orçamento não entram em loop de
recuperação. Consulta em cache exige revalidar acesso na API. Retomada é somente
leitura: explica e reaproveita propostas/planos existentes, sem reenviar efeitos.
Planos aprovados continuam por seu executor persistido, com gates próprios.

Novo pedido impede recuperação automática obsoleta. Cancelamento revoga próximas
etapas/lease; geração externa já iniciada pode não ser cancelável. Não anunciar
que uma publicação foi desfeita só porque o run foi interrompido.

## Estados públicos e controle

`GET /conversations/{id}` retorna em `response_runs[].recovery`:

```json
{
  "status": "queued",
  "nextAttemptAt": "2026-11-17T20:00:05Z",
  "attempts": 1,
  "maxAttempts": 2,
  "deadlineAt": "2026-11-17T20:10:00Z",
  "policyVersion": "proactive-v1"
}
```

Estados: `running`, `queued`, `completed`, `stopped`, `cancelled`, `exhausted`.
A interface consulta andamento mesmo sem um stream aberto; não reenvia mensagens
por conta própria. `POST /conversations/{id}/runs/{runId}/cancel` exige intenção
humana assinada. O status persistido é a evidência final, não um timeout do browser.

## Revisão e autorização em lote

1. `POST /conversations/{id}/approvals/review`, body `{approvalIds:[...]}` (1–10).
2. O servidor devolve `reviewToken`, `version`, `digest`, `approvalIds`,
   `expiresAt` e `items`.
3. Exibir parâmetros, efeitos e consumo. Geração de imagem/vídeo informa uma
   unidade correspondente; saldo e custo monetário desconhecidos são marcados
   como desconhecidos, nunca estimados pelo LLM.
4. `POST /conversations/{id}/approvals/confirm-batch` envia os quatro primeiros
   campos exatamente como revisados.
5. Resposta: `{items:[{id,status,result}],partialFailure}`. Distinguir `completed`,
   `processing`, `failed` e `unknown`; HTTP 200 do lote não significa sucesso de
   todos os itens.

Mudança de seleção, parâmetros, versão ou validade exige nova revisão. O digest
é recalculado sobre o snapshot autoritativo. A transação confirma **todos os
claims antes de qualquer I/O externo**. Não há rollback fictício de ações que
já aconteceram. Repetir uma confirmação devolve estado já conhecido, não reenvia.

`humanIntent:true` é concedido somente pelo proxy autenticado em rotas de
confirmação/revisão/controle humano. Não vem do body e não pode ser herdado de
delegação do modelo. O caminho de ferramenta continua exigindo aprovação
compatível com usuário, tenant, método, path e parâmetros.

A confirmação individual usa o mesmo journal. Recusas conhecidas retornam código
e texto fixos; conflito de recurso exige revisão. Resultado incerto não vira
sucesso nem habilita um botão de reexecução cega.

## Journal de resultados e incerteza

A API congela uma cópia JSON limitada/sanitizada da resposta e grava conclusão +
resultado juntos antes de enviar sucesso. Deadline da gravação: cinco segundos.
Se o banco não confirmar, o cliente recebe resultado indeterminado; a gravação
pode concluir depois, sem repetir o efeito externo.

Código reservado compartilhado: `CHAT_OUTCOME_UNCONFIRMED`. Texto traduzido não
é identidade de estado. Placeholders legados conhecidos são compatíveis, mas
uma resposta real existente nunca é substituída por outra. Conclusão tardia do
Node prevalece sobre timeout do Python.

Nenhum journal local garante exatamente uma execução dentro de um provedor que
não oferece idempotência transacional. Se o efeito ocorreu, mas o processo morreu
antes de obter qualquer referência, manter `unknown`, consultar o recurso ou
encaminhar revisão operacional — **não inferir falha e reenviar**.

## Encadeamento tipado de resultados

Campos permitidos podem apontar para tarefa anterior com dependência direta:

```json
{"$result":{"task":"legenda","field":"text"}}
```

- `text`: saída de `draft_text`, usada em prompt/legenda.
- `assetUrl`: saída de imagem/vídeo, usada em `image_url`.
- Fonte anterior na lista e em `dependsOn`; sem eval, templates, índices ou
  caminhos arbitrários.
- Mídia é resolvida pelo ID em repositório do tenant atual. URLs colocadas em
  `result.data` não são confiáveis.
- Revalidar tipo, propriedade, exclusão, tamanho e horário antes de propor.
- Aprovar o plano não autoriza gastar/publicar. A proposta concreta ainda precisa
  de revisão/confirmacão.

Textos de planos usam uma chamada por tentativa persistida (máximo duas), com
fallback homologado na segunda. Não multiplicar retries em SDK, adapter e worker.
O contexto é envelope JSON limitado com omissões explícitas; os resultados
originais permanecem persistidos.

## Checklist de homologação

1. Aplicar migrations `0080`, `0081`, `0082` antes de subir API/chat.
2. Configurar `CHAT_SERVICE_URL`, `ADY_API_URL`, banco e segredo de delegação
   correspondente entre serviços; não expor FastAPI diretamente.
3. Confirmar bootstrap/shutdown do worker e acesso da API ao chat.
4. Testar interrupção antes/depois de consulta, durante stream e entre conclusão
   da mensagem e atualização do estado de recuperação.
5. Repetir confirmação e perder resposta após efeito; verificar exatamente um
   dispatch e resultado persistido.
6. Revogar acesso, expirar assinatura, mudar conteúdo e cancelar em concorrência;
   nenhuma etapa futura pode herdar autorização antiga.
7. Homologar modelos pelo gate editorial e configurar fallback opt-in.
8. Fazer rollout controlado e acompanhar recuperação, `unknown`, prazo esgotado,
   latência, custo observado e perguntas obrigatórias.

Não trocar modelo nem desativar gates para fazer os testes passarem. Homologação
com empresários e custo real exige coleta e autorização próprias; testes com
HTTP/provedor simulado não substituem essa evidência.
