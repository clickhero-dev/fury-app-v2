# QA — [N3] Contraste do aceite de cookies (1dfch0amr19)

## Escopo

Validação E2E do botão **Aceitar todos** do banner de cookies no tema claro.

## Problemas encontrados e resolvidos

1. O runner E2E dependia de artefatos internos (`@fury/db/dist`) e de segredos de teste
   para iniciar a API. Os pacotes foram construídos e a execução usou somente valores de
   teste para os segredos obrigatórios.
2. O Playwright reutilizava um Vite já aberto na porta padrão, podendo testar outra branch.
   A configuração já aceita portas por ambiente; a execução usou portas exclusivas.
3. O comando do Vite no `playwright.config.ts` encaminhava os argumentos como `vite --
   --host`, ignorando a porta solicitada. Foi trocado por `pnpm exec vite --host ...`.
4. O teste inicial limpava o cookie em todo reload por usar `addInitScript` sem guarda.
   A limpeza agora ocorre apenas na primeira navegação da sessão.

## Cobertura adicionada

`apps/web/e2e/cookie-consent-contrast.spec.ts` verifica no Chromium:

- tema claro e presença do banner;
- cor efetiva de fundo `rgb(23, 112, 138)` e texto branco;
- contraste WCAG AA de texto normal (>= 4,5:1);
- foco no botão;
- persistência do consentimento e ausência do banner após reload.

## Evidências

```text
E2E: 1 passed (Chromium)
Unit/integration: 14 passed (2 arquivos)
```

O merge local da branch contra `origin/hmg` não apresentou conflitos. A PR permanece
mergeável; a instabilidade observada era do status de checks, não de conflito de Git.

## Check remoto histórico

O workflow remoto `QA - jornada real` do commit anterior falhou depois de 20 minutos
esperando o botão **Gerar Conversas** contra o ambiente HMG. O log mostra login bem-sucedido
e não envolve o banner de cookies nem os arquivos deste card. O teste específico deste card
foi executado localmente contra o bundle produzido pela branch e passou.
