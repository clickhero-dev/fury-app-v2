# Tasks — Criação de vídeo (MPT)

## Fase 1 — Backend
- [x] Tabela `studio_music_tracks` (schema + migration 0047 + migrate.ts)
- [x] Cliente HTTP do MPT (`lib/moneyprinter-client.ts`)
- [x] `StudioVideoService`: opções, upload de música, criar job, status, jobs ativos
- [x] Controller + rotas `/studio/video/*` + DI
- [x] Worker `studio-video` (fila, retry, retomada, salvar asset) + start/stop no index
- [x] Testes unitários do service/worker (mocks do MPT)

Aceite: `POST /studio/video/jobs` → job sai de pending → done com `assetId`;
vídeo aparece em `GET /studio/assets` como `type: video`.

## Fase 2 — Frontend
- [x] Tipos + hook `useStudioVideo`
- [x] `VideoCreateForm` (mockup tela 1)
- [x] `VideoProgress` (mockup tela 2)
- [x] `EstudioHome`: alternância, filtro Vídeos, cards de vídeo/gerando
- [x] `CreativeResult`: modo vídeo (mockup tela 3)

Aceite: fluxo completo no navegador com o MPT local, imagem sem regressão.

## Fase 3 — Verificação
- [x] Testes back/front, typecheck (`tsconfig.app.json`), build
- [ ] Geração real ponta a ponta
- [x] Revisão de segurança (upload + rotas novas)

## Achados
- Segurança (sem crítico/alto): corrigidos M1 (limite de jobs com advisory lock), M2 (extensão de áudio com MIME fixo),
  M3 (teto de 30 músicas/tenant), B1 (erro do MPT não vaza), B2 (path estrito + teto de 200 MB), B3 (multer → 400),
  B4 (job sem heartbeat há 10 min não conta nem aparece).
- MPT não serve as músicas embutidas por HTTP → prévia via `MPT_SONGS_DIR` (cópia de resource/songs do container).
- Prévia de voz: 3 amostras estáticas geradas pelo próprio MPT em `apps/web/public/audio/voices/`.
- Suíte da API: 55 falhas pré-existentes (mesmas no HEAD com o mesmo `.env`), nenhuma ligada a esta feature.
