# [N5] Legenda automática — correção de homologação

Base: hmg. A PR #350 foi integrada; esta correção preserva seu contrato e estende vídeo. ADR-0001 consultado; ADR-0002 ausente. Ferramentas MCP do grafo indisponíveis nesta sessão.

## Contrato e aceitação

- Botão `Gerar legenda automática`, habilitado com tema ou mídia, inclusive Reels/Stories. Sugestão transitória, editável; não publica, salva nem agenda.
- POST autenticado `/planner/posts/suggest-caption`: JSON estrito `{context?,imageUrl?,videoUrl?}`, contexto aparado 1–5000 caracteres; pelo menos um contexto, no máximo uma URL. Resposta Planner existente `{caption,imageUsed}`.
- URLs HTTPS sem credenciais/porta alternativa; origem R2 configurada ou hosts de imagem permitidos em campanhas. Toda mídia exige lookup pelo StudioRepository tenant-scoped. Sem posse: fallback textual quando há tema, senão 404 genérico. Vídeo somente R2, leitura pelo SDK S3 por chave validada, sem fetch da URL do usuário nem redirects.
- Imagens próprias: primeira imagem de carrossel, incluindo mídia de edição e stories. Gemini Flash Lite primeiro, Flash como fallback; uma tentativa por modelo, JSON com legenda não vazia até 5000, sem truncar. Contexto explícito do tenant na chamada de IA.
- Vídeo próprio: máximo 50 MiB/120 segundos; validação nativa existente, áudio mono PCM 16 kHz encapsulado WAV; transcrição Whisper no adaptador existente, depois legenda social a partir da fala + tema. Sem fala e sem tema: 422 com orientação; com tema gera pelo tema. Falha de transcrição: 503 específico e seguro. Não gera legendas embutidas/SRT.
- Carrossel envia apenas a primeira mídia na geração; demais mídias são enviadas no fluxo final. Upload antecipado reutilizado por arquivo na geração, repetição e envio final; atualizar biblioteca. Informar que permanece na biblioteca se cancelar. Invalidar mídia preparada na troca.
- Bloquear texto/envio durante geração; permitir fechar/trocar mídia mas ignorar resultado obsoleto e não reaproveitar upload de mídia antiga. Erros client-safe específicos para mídia ausente, sem fala, limites, upload e indisponibilidade; nunca erro bruto de provedor.
- Preservar edição manual, data/hora, tipo, modos e retry. Nova legenda limpa retry como edição manual. Stories preservam publicação sem legenda na Meta.

## Execução TDD

1. Reproduzir RED em serviço/rota/RTL para imagem em edição, vídeo sem tema, isolamento, origem e mensagens.
2. Implementar resolução/autorização, contexto do tenant e modelos; extensão videoAudio reaproveitando sandbox nativo; adapter injetado de leitura S3 + normalização + Whisper. Timeout real em chamadas e corpo, sem logs de conteúdo.
3. Corrigir seleção de mídia no diálogo, upload cacheado por File, estados e descarte de requisições obsoletas; renomear controle.
4. GREEN em Vitest API/web e regressões publicação/upload; builds/typechecks; navegador no checkout correto com API simulada quando credenciais reais não estiverem disponíveis, documentando limite.
5. Revisar diff, commit/push isolados; PR para hmg com título do ticket; acompanhar CI e comparar base atual antes de encerrar. Não fazer merge/deploy.

## Rollback

Reverter somente esta PR. Nenhuma tabela/migration/quota/job novo. Assets enviados antecipadamente permanecem na biblioteca.

## Evidências locais (2026-11-16)

- RED: serviço inicial 5 falhas comportamentais; RTL 4 falhas; timeout/leak de log 2 falhas confirmadas antes das respectivas correções. Teste do adapter de vídeo inicialmente falhou por módulo inexistente.
- API: `cd apps/api && npx vitest run src/__tests__/planner-caption-suggestion.service.test.ts src/__tests__/planner-caption-http.bdd.test.ts src/__tests__/planner-caption-openrouter.bdd.test.ts src/__tests__/planner-caption-storage.bdd.test.ts src/__tests__/planner-video-audio.bdd.test.ts src/__tests__/planner-suggest-caption.bdd.test.ts src/__tests__/planner-publish-now.bdd.test.ts src/__tests__/planner-create-post.test.ts src/__tests__/chat-transcription.bdd.test.ts src/__tests__/openrouter-credits.test.ts` — 85 testes aprovados; teste adicional de contexto explícito de chave aprovado depois (serviço: 16 testes).
- Frontend: `cd apps/web && npx vitest run src/pages/planejador` — 86 testes, 10 arquivos aprovados.
- Build: `npm run build --prefix packages/shared`, `npm run build --prefix packages/db`, `npm run build --prefix apps/api`, `cd apps/web && npm run build` aprovados. Primeiro typecheck com artefatos compartilhados antigos falhou; recompilar dependências do worktree isolado resolveu.
- Chromium: `cd apps/web && npx playwright test --config playwright.caption.config.ts` — 2 cenários aprovados, claro/escuro. Checkout servido por Vite em 5198, sessão/API/provedor simulados. Imagem → gerar → editar → agendar; vídeo sem tema → erro seguro de ausência de fala → edição manual. Sem pageerrors. Screenshots em `/tmp/fury-caption-e2e/caption-{light,dark}.png` (artefatos locais, não versionados).
- FFmpeg/ffprobe reais: vídeo com áudio, vídeo sem áudio, arquivo inválido. Provedor e SDK de storage simulados nos testes; não foi executada transcrição remota nem publicação real Meta. Sem alteração de banco de negócio.
- Diff revisado, sem migrations; WIP original preservado. CI remoto e estado final da PR registrados na descrição da PR após execução.

- Revisão de carrossel: teste RED confirmou upload indevido de duas imagens para uma sugestão; GREEN envia apenas a primeira, reutilizando-a no envio final. 86 testes de frontend aprovados após ajuste.
