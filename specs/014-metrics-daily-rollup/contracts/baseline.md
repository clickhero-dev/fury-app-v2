# Contracts: 014 — contratos HTTP preservados (baseline)

Nenhum contrato muda. Esta fase só **fixa o baseline** que os testes de paridade (converge) vão revalidar.

## Endpoints afetados (resposta idêntica, fonte muda para metrics_daily)

| Endpoint | Envelope hoje | Fonte depois |
|---|---|---|
| `GET /metrics/summary?startDate&endDate` | `{ success, data: { summary: { spend, roas, cpa, conversions } } }` | SQL sobre metrics_daily |
| `GET /metrics/daily?startDate&endDate` | `{ success, data: DailyMetric[] }` (`{ date, spend, conversions, roas, clicks, impressions }`) | `GROUP BY date` |
| `GET /metrics/campaigns?limit&page&status&startDate&endDate` | `{ success, data: { campaigns: [{ id, name, status, metrics { spend, clicks, impressions, conversions, roas, cpa } }], pagination } }` | `GROUP BY campaign_meta_id` + status live |
| `GET /metrics/campaigns/:id/insights` e `/adsets` | idem atual | pré-processado |
| `GET /campaigns/:id/insights?date_range=last_7d\|30d\|90d\|custom` | `{ success, data: { campaign, timeseries: DailyInsight[], creatives } }` | timeseries do pré-processado; `campaign`+`creatives` live como hoje |
| `GET /goals/progress` | `{ data: GoalsProgressData }` (sparks, ideal_line, projeção) | reusa summary/daily pré-processados |

## Erros preservados

- `401 META_NOT_CONNECTED` (conta não conectada) — mesmo código/mensagem.
- `500 META_API_ERROR` — só quando on-demand falha; leitura local não derruba endpoint por erro Meta.

## Novo comportamento observável

- Header/latência: endpoints passam a responder <100ms (sem header novo; medir p95 no OTel existente).
- Nenhum endpoint novo exposto pelo job (workers não expõem HTTP; disparo manual em dev via função exportada no módulo do worker).

## Frontend

- `useCampaigns`: remove `refetchInterval: 30_000`; demais hooks intocados.
