# Spec — Estúdio: Criação de vídeo com MoneyPrinterTurbo

Mockup aprovado: https://claude.ai/artifact/MhjSf91bZJFYXM4PPmmPNy (4 telas).

## Objetivo

Reativar a criação de vídeo na Criação Rápida usando o MoneyPrinterTurbo (MPT),
de forma assíncrona: API cria job → fila Redis (BullMQ) → worker → MPT; o front
consulta o status com porcentagem até o vídeo cair na biblioteca.

## Fora de escopo (decidido com o usuário)

- Observabilidade no superadmin.
- Controle de duração, seletor de formato (fixo 9:16), legenda palavra por palavra.
- Cota: vídeo NÃO desconta da cota de criativos (cota própria virá depois).
- Publicar vídeo no Meta / usar em campanha ("em breve" na UI).
- Opções pagas do MPT (vozes -V2, música por IA, fontes de vídeo por IA, cross-post).

## Requisitos

- RF-01 Alternância Imagem | Vídeo na Criação Rápida; Imagem continua idêntica.
- RF-02 Formulário de vídeo: tema (10–1000 chars), voz pt-BR (Antonio, Francisca,
  Thalita) com prévia, velocidade da fala (0,8–1,2), música de fundo (sem /
  aleatória / predefinida / personalizada) + volume, legenda liga/desliga +
  posição (em cima / meio / embaixo), transição entre cenas.
- RF-03 Música predefinida = 29 embutidas do MPT, exibidas como "Música 01..29",
  com player de prévia.
- RF-04 Música personalizada: upload (MP3/WAV/M4A, ≤30 MB) vinculado ao tenant;
  cada tenant só vê e usa as próprias.
- RF-05 "Aleatória": sorteio feito pela nossa API entre embutidas + músicas do
  tenant, enviado ao MPT como `bgm_file` (nunca o `random` do MPT).
- RF-06 Fixos no backend: `video_aspect 9:16`, `video_language pt-BR`,
  `video_source pixabay`, `match_materials_to_script true`,
  `font_name BeVietnamPro-Bold.ttf`, `subtitle_display_mode sentence`,
  `subtitle_animation none`, `video_count 1`.
- RF-07 Job assíncrono registrado em `workflow_jobs` (`workflow = 'studio-video'`),
  com progresso 0–100 e etapa nomeada (roteiro, narração, cenas, montagem, salvando).
- RF-08 Worker re-tenta a tarefa no MPT (até 3 envios) quando ela falha ou some;
  retomada após restart reaproveita a tarefa MPT já criada.
- RF-09 Ao concluir: baixa o MP4, guarda (R2, ou disco local sem R2) e cria
  `creative_assets` tipo `video` com metadados (tema, roteiro, duração, voz, música).
- RF-10 Tela de progresso com %, etapa, tempo decorrido e aviso de que pode sair.
- RF-11 Biblioteca: filtro "Vídeos" volta; card de vídeo com badge de duração;
  card "Gerando vídeo · N%" para jobs ativos.
- RF-12 Detalhes de vídeo: player, roteiro, Baixar vídeo, Salvar; sem pincel/
  "Aplicar ajustes"; Publicar/Usar em campanha desativados "em breve".

## Segurança

- Sem cota → limite de 2 jobs de vídeo ativos por tenant (409).
- Status de job e upload de música sempre checados pelo tenant do token.
- Prévia de música embutida: rota pública com whitelist `output\d{3}.mp3`
  (evita path traversal); músicas do tenant são servidas pela URL própria.
- Chave do MPT (`MONEYPRINTER_API_KEY`) só no backend.

## Config (apps/api/.env)

```
MONEYPRINTER_API_URL=http://127.0.0.1:8080
MONEYPRINTER_API_KEY=
MPT_SONGS_DIR=   # pasta com as músicas embutidas do MPT (prévia)
```
