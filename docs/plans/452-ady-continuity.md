# #452 — continuidade de turnos Ady

## Diagnóstico e limites
Base: hmg. Sem acesso a traces de produção; a causa do relato permanece hipótese.
O transporte aceita EOF sem término, aceita finish_reason=error e não retenta ConnectError.
Retry atual é limitado a três tentativas, mas ignora Retry-After e não tem jitter.
MODEL_CHATBOT determina o modelo OpenRouter. “Evo” não está identificado no código;
não presumir equivalência nem fixar política específica. ADR-0002 não existe nesta base.
Contrato consultado: https://github.com/OpenRouterTeam/docs/blob/main/api_reference/errors-and-debugging.mdx

## Specs e aceitação
1. Requisições HTTP ao modelo: até três tentativas, somente antes de saída/efeito observado no turno; nunca reexecutar o agente ou ferramentas. Timeout/conexão, 429 e 5xx são transitórios. 400/401/403/402/contexto não são retentados.
2. Backoff exponencial com jitter e Retry-After (segundos ou HTTP-date). Espera maior que orçamento acumulado de espera de 20 segundos (200 segundos por sequência HTTP) encerra como falha recuperável, sem retry prematuro.
3. Stream precisa terminar com finish_reason válido ou DONE. EOF truncado e finish_reason=error falham sanitizados; conteúdo parcial não vira resposta concluída. Não repetir após conteúdo/tool.
4. Prazo total de execução do agente/ferramentas de 240 segundos; deadline cai no tratamento existente de erro, libera heartbeat e permite retry somente leitura. Persistência e fencing tenant/user/run existentes permanecem obrigatórios.
5. Logs do transporte distinguem initial_failure/retry/recovered/final_failure com tentativa, status e UUID local de requisição; nunca corpo, credencial ou mensagem.
6. Testes com MockTransport e streams sintéticos cobrem sucesso, falhas transitórias/permanentes, limite, Retry-After, truncamento, erro SSE, cancelamento e bloqueio após saída. Suítes existentes cobrem fencing, multi-turn e retomada sem duplicação.

## Passos
- [x] Verificar PRs existentes e isolar checkout hmg.
- [x] Ler transporte, orquestração, streaming, testes e ADR disponível.
- [x] Escrever regressões e confirmar Red (7 falhas comportamentais).
- [x] Implementar política mínima, validação de término e deadline.
- [ ] Confirmar Green e executar suíte chat com provedores mockados.
- [ ] Revisar diff, atualizar hmg, abrir PR e acompanhar CI.

Nenhuma publicação, geração paga, campanha real, merge ou deploy autorizado/executado.

## Evidências
- 49 testes de política/streaming e Agno real com MockTransport verdes.
- Dois testes HTTP + PostgreSQL reais comprovam erro SSE, run failed e retry com mesma mensagem, sem aprovação/ação duplicada, usando provedor simulado.
- Vitest: `npx vitest run apps/api/src/__tests__/sse.test.ts` — 8 verdes.
- Execuções locais iniciais identificaram dependências Node/configuração de banco ausentes; ambiente isolado recebeu dependências frozen e migrations antes do reteste.
- Logs de produção não disponíveis; validar correlação de um incidente real após implantação autorizada. Sem confirmação de qual serviço/provedor o nome “Evo” designa.
