# Chatbot: bloqueios de implantação e gate CI

Issue: #422 (`fix(chatbot): corrigir bloqueios de integração e adicionar gate CI dedicado`).

## Relato
A evolução do assistente tem testes locais verdes, mas a revisão identificou diferenças entre source local e implantação, além de um contrato inconsistente de exclusão de anexos entre serviços.

## Causas encontradas
1. O Dockerfile Python copia módulos explicitamente, mas não incluía `model_request_budget.py`, importado por `app.py`.
2. A exclusão Python mantém o row lock da conversa durante a limpeza privada; o Node tentava readquirir esse lock em outra transação e removia os metadados que deveriam permanecer sob coordenação do dono da exclusão.
3. O CI genérico não habilitava variáveis de integração específicas dos novos domínios nem selecionava todos os E2Es do assistente.
4. O source estava em branch de uma PR antiga já mergeada e defasado da hmg. Worktree dedicado integra feature e WIP relacionado sem mover o checkout compartilhado.

## Resolução e estado
- Integração em `feat/422-chatbot-ready`, baseada na hmg `46afe276`: conflitos de DI, repository de Studio e registro de migrations resolvidos mantendo também dashboard demo, avaliação de assets e migrations de trial recentes.
- Corrigidos e validados: imagem Python com módulo de orçamento; cleanup delegado sem relock/metadados; cleanup humano draft-only; regressão Python→HTTP Node→PostgreSQL; scheduler de recuperação de vídeos BullMQ com concorrência global; guard DB antes de conexão e teardown de containers por ID.
- Novo workflow `Chatbot / real DB, E2E and image`, com dependências nativas explícitas (FFmpeg/Poppler/util-linux), sem skips silenciosos e com evidências publicadas.
- Gate completo no checkout integrado: **623 Python**, **305 API em 47 arquivos**, **51 E2E mock + 1 E2E real**, todos sem falhas ou skips. Smoke da imagem real passou; web teve 237 testes e build/TypeScript verdes. Contrato do gate teve 11 testes verdes. API TypeScript e lint dos fontes alterados passaram.
- Primeira rodada E2E teve 50 passados/1 falha antes da renderização por `ERR_NETWORK_CHANGED` em módulos locais; trace preservado fora do repo. Gate completo serial seguinte passou sem alterar as asserções.
- Commit/push da branch autorizados pelo usuário; merge e PR não autorizados nesta etapa.
- Configuração EasyPanel de homologação e produção solicitada para depois das validações; exige acesso autenticado e fonte deployável verificada. Nenhum segredo deve ser documentado aqui.

## Critérios de aceite
- Import/startup da imagem real testado.
- Exclusão Python→Node com PostgreSQL descartável conclui sem dupla aquisição de lock; falhas mantêm dados; identidades estrangeiras são recusadas.
- CI dedicado executa testes do chatbot, integrações e E2Es com recursos isolados e sem provedores reais.
- Builds, regressões e revisão independente no checkout integrado; contagens registradas após execução.
- SHA do commit remoto confirmado após push; checks remotos avaliados sem confundir com validação local.

## Follow-up: compatibilidade FFmpeg 8 no CI remoto

O primeiro job remoto (`42881962342`, SHA `982f297e`) passou no Python, mas revelou dois casos válidos WebM/Opus recusados na validação nativa. O runner usou Ubuntu 26.04 com FFmpeg `7:8.0.1-3ubuntu2`, diferente do FFmpeg 9 local.

Reprodução com os pacotes exatos confirmou o parser Opus interpretando o flush EOF vazio como pacote inválido, embora a decodificação produzisse todo o PCM e exit 0. O upstream FFmpeg corrige essa condição no commit `618fc15e65f57c9ce25d4562f4b516129815608c`.

O ajuste aplica `+noparse+nofillin` somente ao framing redundante de WebM e mantém demuxing/decodificação reais com `-err_detect explode`, `-xerror`, rejeição de stderr, protocolos restritos e todos os limites. Pacotes corrompidos e truncados continuam recusados. Foram adicionadas seis regressões: 23 testes nativos passaram em FFmpeg 6, 8 e 9; o parent executou 43 testes de mídia/transcrição/rotas, typecheck e lint verdes. O novo check remoto deve ser conferido no SHA do follow-up antes de declarar CI aprovado.

## Limites
Mocks de modelo/mídia e storage simulados não certificam OpenRouter/Meta/R2 reais. Homologação e produção devem manter variáveis/segredos próprios e serviço de chat interno, sem exposição pública direta.
