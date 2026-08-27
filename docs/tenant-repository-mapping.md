# Mapeamento — Camada de Repository (TenantRepository)

> **Branch:** `feat/tenant-repository-layer`
> **Objetivo:** Centralizar todas as chamadas de acesso ao banco em uma única classe `TenantRepository`.
> **Escopo:** `apps/api/src/*`
> **Data:** 2026-08-27

O acesso ao banco hoje é todo via **Drizzle ORM**, atravessando um singleton `db` exportado por `@fury/db`
(`apps/api/src/lib/db.ts` apenas re-exporta o pacote). Cada chamada será movida para um método do
`TenantRepository`, cujo construtor já carrega `tenantId` (e `db`, por default):

```ts
constructor(private tenantId: string, private db: Database = db) {}
```

**Marcação `GLOBAL`** = consulta que **não é** escopada por tenant (superadmin, catálogo de planos,
jobs de workflow, listagem de tenants de workers em lote, seeds, `request_logs`, LP pública).
Esses métodos provavelmente precisarão ser **estáticos** ou viver em um repo global.

---

## Volume

- **~300 operações** mapeadas, **~40 tabelas**, ~10 domínios.
- **~196** são tenant-scoped (cabem no construtor com `tenantId`).
- **~100 GLOBAL** (superadmin, planos/invoices, workflowJobs, tenant-listing de batch workers, seeds, request_logs, LP).
- Já existe `ICampaignRepository`/`DefaultCampaignRepository` (domínio de campanhas) que será absorvido ou coexistirá.

---

## 1. Automação

| serviço | local | descrição | novo método |
|---|---|---|---|
| automation | `controllers/automation.controller.ts:41` | busca regra p/ upsert por nome | `findAutomationRuleByName` |
| automation | `controllers/automation.controller.ts:49` | upsert de regra (update) | `updateAutomationRule` |
| automation | `controllers/automation.controller.ts:71` | cria regra | `createAutomationRule` |
| automation | `controllers/automation.controller.ts:139` | valida regra antes de deletar | `findAutomationRuleById` |
| automation | `controllers/automation.controller.ts:154` | deleta regra | `deleteAutomationRule` |
| automation | `controllers/automation.controller.ts:184` | lista smart takedowns (furyInsights) | `listTakedowns` |
| automation | `services/automation/automation.service.ts:18` | cria regra | `createAutomationRule` |
| automation | `services/automation/automation.service.ts:36` | lista regras do tenant | `listAutomationRules` |

## 2. Budget / Otimização

| serviço | local | descrição | novo método |
|---|---|---|---|
| budget | `controllers/budget.controller.ts:60` | persiste otimização gerada | `insertBudgetOptimization` |
| budget | `workers/budget-optimizer.worker.ts:73` | persiste resultado de otimização | `createBudgetOptimization` |
| budget | `services/campaigns/budget-optimizer.service.ts:215` | campanhas do tenant p/ otimizar | `listCampaigns` |

## 3. Campanhas

Parcialmente já abstraído em `lib/providers/default-campaign.repository.ts` (via `ICampaignRepository`).

| serviço | local | descrição | novo método |
|---|---|---|---|
| campaigns | `lib/providers/default-campaign.repository.ts:21` | conexão Meta do tenant | `findMetaConnection` |
| campaigns | `lib/providers/default-campaign.repository.ts:29` | campanha por id | `findCampaignById` |
| campaigns | `lib/providers/default-campaign.repository.ts:36` | campanha por tenant+id | `findCampaignByTenantAndId` |
| campaigns | `lib/providers/default-campaign.repository.ts:43` | campanha por metaCampaignId | `findCampaignByMetaId` |
| campaigns | `lib/providers/default-campaign.repository.ts:60` | lista campanhas (paginação) | `listCampaigns` |
| campaigns | `lib/providers/default-campaign.repository.ts:67` | conta campanhas (total) | `countCampaigns` |
| campaigns | `lib/providers/default-campaign.repository.ts:78` | cria campanha | `createCampaign` |
| campaigns | `lib/providers/default-campaign.repository.ts:83` | atualiza campanha | `updateCampaign` |
| campaigns | `lib/providers/default-campaign.repository.ts:88` | exclui campanha | `deleteCampaign` |
| campaigns | `lib/providers/default-campaign.repository.ts:92` | creative asset do tenant por id | `findCreativeAsset` |
| campaigns | `lib/providers/default-campaign.repository.ts:103` | takedowns recentes | `findRecentTakedowns` |
| campaigns | `lib/providers/default-campaign.repository.ts:116` | regras de automação ativas | `findActiveAutomationRules` |
| campaigns | `lib/providers/default-campaign.repository.ts:124` | insere insight | `insertFuryInsight` |
| campaigns | `services/campaigns/campaigns.service.ts:825` | slug do tenant (LP WhatsApp) | `findTenant` |
| campaigns | `services/campaigns/goal.service.ts:25` | metas do cliente p/ métricas | `findClientGoals` |
| campaigns | `services/campaigns/campaigns.service.ts:440` | insere insight de campanha | `createInsight` |
| campaigns | `controllers/campaigns.controller.ts:893` | brand kit p/ copy assistido | `findBrandKit` |
| campaigns | `controllers/campaigns.controller.ts:894` | tenant p/ contexto de negócio | `getTenant` |

## 4. Superadmin (tudo GLOBAL)

| serviço | local | descrição | novo método |
|---|---|---|---|
| superadmin | `controllers/superadmin.controller.ts:134` | lista todos tenants | `listTenants` |
| superadmin | `controllers/superadmin.controller.ts:140` | conta usuários por tenant | `countUsersByTenant` |
| superadmin | `controllers/superadmin.controller.ts:145/188/443` | busca assinatura do tenant | `findLatestSubscription` |
| superadmin | `controllers/superadmin.controller.ts:152/469/507/787/813/838` | busca plano | `findPlanById` |
| superadmin | `controllers/superadmin.controller.ts:177/246` | tenant por id | `getTenantById` |
| superadmin | `controllers/superadmin.controller.ts:183` | lista usuários do tenant | `listUsersByTenant` |
| superadmin | `controllers/superadmin.controller.ts:200` | config fury do tenant | `findFuryConfigByTenant` |
| superadmin | `controllers/superadmin.controller.ts:204` | brand kit do tenant | `findBrandKit` |
| superadmin | `controllers/superadmin.controller.ts:208` | clientGoals do tenant | `findClientGoal` |
| superadmin | `controllers/superadmin.controller.ts:252` | deleta tenant | `deleteTenant` |
| superadmin | `controllers/superadmin.controller.ts:274/321/365` | email duplicado | `findByEmail` |
| superadmin | `controllers/superadmin.controller.ts:281` | cria usuário | `createUser` |
| superadmin | `controllers/superadmin.controller.ts:316` | slug duplicado | `findBySlug` |
| superadmin | `controllers/superadmin.controller.ts:330/334` | setup tenant (tx) | `setupTenant` |
| superadmin | `controllers/superadmin.controller.ts:382/415` | usuário por id | `getUserById` |
| superadmin | `controllers/superadmin.controller.ts:396` | atualiza usuário | `updateUser` |
| superadmin | `controllers/superadmin.controller.ts:421` | deleta usuário | `deleteUser` |
| superadmin | `controllers/superadmin.controller.ts:454` | primeiro plano default | `getFirstPlan` |
| superadmin | `controllers/superadmin.controller.ts:473` | cria assinatura | `createSubscription` |
| superadmin | `controllers/superadmin.controller.ts:514` | atualiza assinatura | `updateSubscription` |
| superadmin | `controllers/superadmin.controller.ts:553` | atualiza config fury | `updateFuryConfig` |
| superadmin | `controllers/superadmin.controller.ts:558` | cria config fury | `createFuryConfig` |
| superadmin | `controllers/superadmin.controller.ts:599/613/618` | CRUD brand kit | `findBrandKit` / `updateBrandKit` / `createBrandKit` |
| superadmin | `controllers/superadmin.controller.ts:645/659/664` | CRUD clientGoals | `findClientGoal` / `updateClientGoal` / `createClientGoal` |
| superadmin | `controllers/superadmin.controller.ts:691/704` | owner / audienceDefaults | `findOwnerUser` / `updateUserAudienceDefaults` |
| superadmin | `controllers/superadmin.controller.ts:710` | businessContext do tenant | `updateTenantBusinessContext` |
| superadmin | `controllers/superadmin.controller.ts:734` | lista planos | `listPlans` |
| superadmin | `controllers/superadmin.controller.ts:739/820` | conta assinantes por plano | `countSubscriptionsByPlan` |
| superadmin | `controllers/superadmin.controller.ts:771` | cria plano | `createPlan` |
| superadmin | `controllers/superadmin.controller.ts:793` | atualiza plano | `updatePlan` |
| superadmin | `controllers/superadmin.controller.ts:844` | migra assinantes | `migratePlanSubscriptions` |
| superadmin | `controllers/superadmin.controller.ts:850` | deleta plano | `deletePlan` |
| superadmin | `controllers/superadmin.controller.ts:883/892` | listagem paginada + busca usuários | `countUsersPaged` / `listUsersPaged` |
| superadmin | `controllers/superadmin.controller.ts:929` | campanhas do tenant | `findCampaignsByTenant` |
| superadmin | `controllers/superadmin.controller.ts:934` | creative assets do tenant | `findCreativeAssetsByTenant` |

## 5. Billing / Planos / Assinaturas

| serviço | local | descrição | novo método |
|---|---|---|---|
| billing | `routes/billing.routes.ts:25` | catálogo planos ativos (público) | `listActivePlans GLOBAL` |
| billing | `routes/billing.routes.ts:57` | assinatura por asaasSubscriptionId | `findSubscriptionByAsaasId` |
| billing | `routes/billing.routes.ts:63` | invoice por asaasPaymentId | `findInvoiceByPaymentId` |
| billing | `routes/billing.routes.ts:71` | cria invoice | `createInvoice` |
| billing | `routes/billing.routes.ts:80` | marca invoice paga | `markInvoicePaid` |
| billing | `routes/billing.routes.ts:85` | marca invoice vencida | `markInvoiceOverdue` |
| billing | `routes/billing.routes.ts:95` | ativa assinatura | `activateSubscription` |
| billing | `routes/billing.routes.ts:100` | assinatura past_due | `markSubscriptionPastDue` |
| billing | `routes/billing.routes.ts:137/235` | plano da assinatura | `findPlanById` |
| billing | `routes/billing.routes.ts:143/219` | assinatura do tenant | `findSubscriptionByTenant` |
| billing | `routes/billing.routes.ts:195` | cria assinatura trial | `createSubscription` |
| billing | `routes/billing.routes.ts:241/264` | invoices do tenant/assinatura | `findRecentInvoicesBySubscription` / `findInvoicesByTenant` |
| billing | `routes/billing.routes.ts:297` | assinatura ativa p/ cancelar | `findActiveSubscription` |
| billing | `routes/billing.routes.ts:309` | cancela assinatura | `cancelSubscription` |
| billing | `services/studio/creative-quota.service.ts:23/44/103/113` | assinatura p/ cota | `findSubscription` |
| billing | `services/studio/creative-quota.service.ts:26` | consome cota de criativos (atômico) | `consumeCreativeQuota` |
| billing | `services/studio/creative-quota.service.ts:46` | estorna cota de criativos | `refundCreativeQuota` |
| billing | `services/studio/creative-quota.service.ts:72` | consome cota de modificações | `consumeModificationQuota` |
| billing | `services/studio/creative-quota.service.ts:92` | estorna cota de modificações | `refundModificationQuota` |
| billing | `services/studio/creative-quota.service.ts:105/115` | plano da assinatura | `getPlanById GLOBAL` |
| billing | `middleware/checkPlanFeature.ts:22` | assinatura ativa | `findSubscription` |
| billing | `middleware/checkPlanFeature.ts:30` | plano da assinatura | `findPlanById GLOBAL` |
| billing | `middleware/checkSubscriptionActive.ts:23` | assinatura p/ validação | `findSubscription` |

## 6. Brand Kit

| serviço | local | descrição | novo método |
|---|---|---|---|
| brand-kit | `routes/brand-kit.routes.ts:59/153/201` | busca brand kit | `findBrandKit` |
| brand-kit | `routes/brand-kit.routes.ts:101` | upsert brand kit (onConflict) | `upsertBrandKit` |
| brand-kit | `routes/brand-kit.routes.ts:177` | upsert fotos (onConflict) | `upsertBrandKitPhotos` |
| brand-kit | `routes/brand-kit.routes.ts:208` | remove foto (photoUrls) | `updateBrandKitPhotos` |

## 7. Fury (config + performance)

| serviço | local | descrição | novo método |
|---|---|---|---|
| fury | `routes/fury.routes.ts:53/76` | busca config fury do tenant | `findFuryConfigByTenant` |
| fury | `routes/fury.routes.ts:57/84` | cria config fury default | `createFuryConfig` |
| fury | `routes/fury.routes.ts:82` | atualiza config fury | `updateFuryConfig` |
| fury | `routes/fury.routes.ts:112/224` | lista performance rules | `listPerformanceRules` |
| fury | `routes/fury.routes.ts:127` | cria performance rule | `createPerformanceRule` |
| fury | `routes/fury.routes.ts:152/181` | performance rule por id | `findPerformanceRuleById` |
| fury | `routes/fury.routes.ts:166` | atualiza performance rule | `updatePerformanceRule` |
| fury | `routes/fury.routes.ts:186` | deleta performance rule | `deletePerformanceRule` |
| fury | `routes/fury.routes.ts:203` | lista performance scores | `listPerformanceScores` |
| fury | `routes/fury.routes.ts:233` | lista rule executions | `listRuleExecutions` |
| fury | `services/llms/fury-engine.service.ts:288` | regras de performance ativas | `listPerformanceRules` |
| fury | `services/llms/fury-engine.service.ts:303` | registra execução de regra | `createRuleExecution` |
| fury | `services/llms/fury-engine.service.ts:323` | config de score do tenant | `getScoreConfig` |
| fury | `services/llms/fury-engine.service.ts:339` | salva performance score | `createPerformanceScore` |
| fury | `workers/rule-engine.worker.ts:70` | registra insight por regra | `createInsight` |
| fury | `workers/rule-engine.worker.ts:89` | regras ativas do tenant | `findActiveRules` |
| fury | `workers/rule-engine.worker.ts:102` | campanhas do tenant | `findCampaignsByTenant` |
| fury | `workers/rule-engine.worker.ts:166` | lista todos tenants | `listTenants GLOBAL` |

## 8. Studio / Creative Assets

| serviço | local | descrição | novo método |
|---|---|---|---|
| studio | `services/studio/studio.service.ts:51/293` | cria asset | `createAsset` |
| studio | `services/studio/studio.service.ts:76/317/484` | deleta asset | `deleteAsset` |
| studio | `services/studio/studio.service.ts:257` | post pt/ idempotência | `findPostByPlanDateType` |
| studio | `services/studio/studio.service.ts:268` | asset por url+tenant | `findAssetByUrl` |
| studio | `services/studio/studio.service.ts:325` | cria post no calendário | `createPost` |
| studio | `services/studio/studio.service.ts:384/476` | asset por id(+tenant) | `findAssetById` |
| studio | `services/studio/studio.service.ts:396` | conexão Meta do tenant | `findMetaConnection` |
| studio | `services/studio/studio.service.ts:467` | grava metaAssetId / aprova | `patchAsset` |
| studio | `services/studio/studio.service.ts:559/564` | conta / lista assets | `countAssets` / `listAssets` |
| studio | `services/studio/studio.service.ts:579` | assets raiz p/ modificações | `listAssetsByIds` |
| studio | `routes/studio.routes.ts:306` | tenant p/ contexto | `findTenantById` |
| studio | `routes/studio.routes.ts:307/322` | goal + brand kit p/ contexto | `findClientGoal` / `findBrandKit` |
| studio | `routes/studio.routes.ts:432` | salva asset gerado | `createCreativeAsset` |
| studio | `routes/studio.routes.ts:533` | asset original p/ regenerate | `findCreativeAssetById` |
| studio | `routes/studio.routes.ts:663` | cria asset regenerado | `createCreativeAsset` |
| studio | `services/studio/studio-render.service.ts:112` | persiste asset renderizado | `createAsset` |
| studio | `services/studio/studio-copy.service.ts:80/132` | salva variação de copy | `createAsset` |
| studio | `services/studio/studio-image.service.ts:214` | brand kit (logo) | `findBrandKit` |
| studio | `services/studio/studio-image.service.ts:238` | persiste imagem | `createAsset` |
| studio | `services/studio/studio-image.service.ts:294/323` | asset por id+tenant | `findAssetById` |
| studio | `services/studio/studio-image.service.ts:335` | conexão Meta p/ publicar | `findMetaConnection` |
| studio | `services/studio/studio-image.service.ts:374/413` | grava metaAssetId | `patchAsset` |
| studio | `services/studio/creative-quota.service.ts:57/69/90/128` | asset raiz p/ cota | `findAssetById` |
| studio | `workers/compliance-check.worker.ts:31` | asset por id p/ análise | `findCreativeAsset` |
| studio | `workers/compliance-check.worker.ts:203` | grava status/notas compliance | `updateCreativeAssetCompliance` |
| studio | `routes/openrouter.routes.ts:75` | tenant p/ contexto de marca | `findTenantById` |
| studio | `routes/openrouter.routes.ts:76` | brand kit p/ contexto | `findBrandKit` |
| studio | `routes/openrouter.routes.ts:222/276/380/411/502` | cria asset gerado/regenerado | `createCreativeAsset` |
| studio | `routes/openrouter.routes.ts:322/461/501` | asset original p/ op | `findCreativeAssetById` |

## 9. Planner / Calendário

| serviço | local | descrição | novo método |
|---|---|---|---|
| planner | `services/planner/planner.service.ts:29/30` | limpa posts/planos (job stale) | `deleteAllPosts` / `deleteAllPlans` |
| planner | `services/planner/planner.service.ts:86/135` | plano por id+tenant | `findPlanById` |
| planner | `services/planner/planner.service.ts:93` | plano mais recente | `getLatestPlan` |
| planner | `services/planner/planner.service.ts:101/453` | conexão Meta ativa | `findMetaConnection` |
| planner | `services/planner/planner.service.ts:107` | metas do cliente | `findClientGoals` |
| planner | `services/planner/planner.service.ts:110` | brand kit | `findBrandKit` |
| planner | `services/planner/planner.service.ts:123` | confirma plano | `confirmPlan` |
| planner | `services/planner/planner.service.ts:128` | aprova posts do plano | `approvePostsByPlan` |
| planner | `services/planner/planner.service.ts:141` | revalida plano | `revalidatePlan` |
| planner | `services/planner/planner.service.ts:149/371` | post por id+tenant | `findPostById` |
| planner | `services/planner/planner.service.ts:179/206` | edita post | `patchPost` |
| planner | `services/planner/planner.service.ts:234` | posts por range de datas | `listPostsByDateRange` |
| planner | `services/planner/planner.service.ts:267` | agenda posts em lote | `bulkSchedulePosts` |
| planner | `services/planner/planner.service.ts:287` | rejeita posts em lote | `bulkRejectPosts` |
| planner | `services/planner/planner.service.ts:345` | cria post manual | `createPost` |
| planner | `services/planner/planner.service.ts:398` | move post por dayIndex | `movePostToDay` |
| planner | `services/planner/planner.service.ts:432` | move post por data | `movePostToDate` |
| planner | `services/planner/planner.service.ts:546` | posts vencidos | `listDuePosts` |
| planner | `services/planner/planner.service.ts:581/599` | marca post publicado/falhou | `markPostPublished` / `markPostFailed` |
| planner | `services/planner/planner.service.ts:612` | agenda retry | `setPostRetry` |
| planner | `services/planner/planner-context.service.ts:11` | busca tenant | `findTenant` |
| planner | `services/planner/planner-context.service.ts:12` | brand kit | `findBrandKit` |
| planner | `services/planner/planner-context.service.ts:13` | metas do cliente | `findClientGoals` |
| planner | `services/planner/planner-context.service.ts:14` | perfil de negócio | `findBusinessProfile` |
| planner | `services/planner/planner-context.service.ts:17` | usuário do tenant | `findUserByTenant` |
| planner | `services/planner/planner-studio.service.ts:22` | conta posts do plano | `countPostsByPlan` |
| planner | `services/planner/planner-studio.service.ts:87` | lista posts do plano | `listPostsByPlan` |
| planner | `planner-workflow-runner.ts:55` | cria plano mensal | `createPlan` |
| planner | `planner-workflow-runner.ts:72` | conta posts criados | `countPlannerPosts` |
| planner | `planner-workflow-runner.ts:99` | plano por id | `findPlanById` |
| planner | `controllers/planner.controller.ts:225` | (cron) lista todos tenants | `listTenants GLOBAL` |

## 10. Meta (conexões)

| serviço | local | descrição | novo método |
|---|---|---|---|
| meta | `services/meta/meta.service.ts:213/292/313/333/541/607/638/654` | conexão Meta do tenant | `findMetaConnection` |
| meta | `services/meta/meta.service.ts:228/277/352/668` | atualiza conexão/adAccounts | `patchMetaConnection` |
| meta | `services/meta/meta.service.ts:244` | cria conexão Meta | `createMetaConnection` |
| meta | `services/meta/meta.service.ts:646` | deleta conexão Meta | `deleteMetaConnection` |
| meta | `services/meta/instagram.service.ts:64/117` | conexão p/ dashboard/ranking | `findMetaConnection` |
| meta | `lib/providers/db-metrics.provider.ts:39/76/243/382/463` | conexão p/ métricas | `findMetaConnection` |
| meta | `lib/sync-jobs.ts:52` | conexão por metaUserId | `findMetaConnection` |
| meta | `lib/sync-jobs.ts:71` | atualiza adAccounts | `updateMetaConnectionAdAccounts` |

## 11. Google (GBP)

| serviço | local | descrição | novo método |
|---|---|---|---|
| google | `services/google/google.service.ts:348/378/401/417/617/961/1013/1212/1250/1265/1334` | conexão Google | `getGoogleConnection` |
| google | `services/google/google.service.ts:353/443/476` | atualiza tokens/conta | `patchGoogleConnection` |
| google | `services/google/google.service.ts:364` | cria conexão Google | `createGoogleConnection` |
| google | `services/google/google.service.ts:411` | deleta conexão Google | `deleteGoogleConnection` |
| google | `services/google/google.service.ts:557/653/739/814` | perfil de negócio | `findBusinessProfile` |
| google | `services/google/google.service.ts:744` | atualiza settings de negócio | `patchBusinessProfile` |
| google | `services/google/google.service.ts:751` | cria settings de negócio | `upsertBusinessProfile` |
| google | `services/google/google.service.ts:560/656/818` | busca tenant | `findTenant` |
| google | `services/google/google.service.ts:886` | cria espelho de perfil GBP | `createBusinessProfile` |
| google | `services/google/google.service.ts:911/1039/1292/1357/1428` | cria sync log | `createSyncLog` |
| google | `services/google/google.service.ts:933` | perfil GBP por id+tenant | `getBusinessProfile` |
| google | `services/google/google.service.ts:1029/1226/1283/1304/1348/1420/1456` | atualiza perfil GBP | `patchBusinessProfile` |
| google | `services/google/google.service.ts:1380` | logs de sync do perfil | `listSyncLogs` |
| google | `workers/google-sync.worker.ts:27` | perfis com sync pendente | `findPendingSyncProfiles GLOBAL` |
| google | `workers/google-sync.worker.ts:35` | conexão Google do perfil | `findGoogleConnection` |
| google | `workers/google-sync.worker.ts:50/77` | marca perfil verificado/não | `updateProfileVerified` / `updateProfileUnverified` |
| google | `workers/google-sync.worker.ts:60/89` | log sync | `createSyncLog` |

## 12. Auth

| serviço | local | descrição | novo método |
|---|---|---|---|
| auth | `services/core/auth.service.ts:37/356/380` | valida slug / busca por email | `findTenantBySlug GLOBAL` / `findUserByEmail GLOBAL` |
| auth | `services/core/auth.service.ts:102/166` | email já registrado | `findUserByEmail GLOBAL` |
| auth | `services/core/auth.service.ts:119/174` | cria tenant (tx) | `createTenant` |
| auth | `services/core/auth.service.ts:128/176` | grava codigo do tenant (tx) | `patchTenant` |
| auth | `services/core/auth.service.ts:130/178` | cria usuário owner (tx) | `createUser` |
| auth | `services/core/auth.service.ts:220/258/277/340/418/434` | usuário por id | `findUserById` |
| auth | `services/core/auth.service.ts:266` | tenant do usuário | `findTenant` |
| auth | `services/core/auth.service.ts:291/324/364/400/452` | atualiza usuário | `patchUser` |
| auth | `services/core/auth.service.ts:295/299` | atualiza tenant | `patchTenant` |
| auth | `services/core/social-auth.service.ts:43` | valida slug único | `findTenantBySlug GLOBAL` |
| auth | `services/core/social-auth.service.ts:145` | usuário por googleId | `findUserByGoogleId GLOBAL` |
| auth | `services/core/social-auth.service.ts:158` | usuário por email | `findUserByEmail GLOBAL` |
| auth | `services/core/social-auth.service.ts:161` | vincula googleId | `patchUser` |
| auth | `lib/seed-superadmin.ts:26` | garante role superadmin (enum) | `ensureSuperadminRole GLOBAL` |
| auth | `lib/seed-superadmin.ts:61` | usuário existente | `findUserByEmail GLOBAL` |
| auth | `lib/seed-superadmin.ts:72` | corrige hash de senha | `updateUserPasswordHash GLOBAL` |
| auth | `lib/seed-superadmin.ts:77` | tenant por slug | `findTenantBySlug GLOBAL` |
| auth | `lib/seed-superadmin.ts:83/104` | preenche codigo | `updateTenantCodigo GLOBAL` |
| auth | `lib/seed-superadmin.ts:91` | cria tenant (upsert) | `createTenant GLOBAL` |
| auth | `lib/seed-superadmin.ts:108` | cria usuário seed | `createUser GLOBAL` |

## 13. Forms

| serviço | local | descrição | novo método |
|---|---|---|---|
| forms | `services/forms/forms.service.ts:12` | inicia submission | `createFormSubmission` |
| forms | `services/forms/forms.service.ts:30/61/92` | submission por id+tenant | `getFormSubmission` |
| forms | `services/forms/forms.service.ts:41` | marca COMPLETED | `completeFormSubmission` |
| forms | `services/forms/forms.service.ts:72` | marca ERROR | `errorFormSubmission` |
| forms | `services/forms/forms.service.ts:103` | marca ABANDONED | `abandonedFormSubmission` |

## 14. State Machine / workflowJobs (GLOBAL)

| serviço | local | descrição | novo método |
|---|---|---|---|
| stateMachine | `services/stateMachine/postgres-checkpoint-store.ts:45` | cria job | `createWorkflowJob` |
| stateMachine | `services/stateMachine/postgres-checkpoint-store.ts:55` | job por id | `getWorkflowJob GLOBAL` |
| stateMachine | `services/stateMachine/postgres-checkpoint-store.ts:70` | salva estado | `patchWorkflowJob GLOBAL` |
| stateMachine | `services/stateMachine/postgres-checkpoint-store.ts:99` | jobs recuperáveis | `listRecoverableWorkflowJobs GLOBAL` |
| stateMachine | `services/stateMachine/postgres-checkpoint-store.ts:108` | job ativo por lockKey | `findActiveWorkflowJobByLockKey GLOBAL` |
| stateMachine | `services/stateMachine/postgres-checkpoint-store.ts:120` | job por planId | `findWorkflowJobByPlanId GLOBAL` |
| stateMachine | `services/stateMachine/postgres-checkpoint-store.ts:129` | renova lock | `renewWorkflowJobLock GLOBAL` |

## 15. Infra / Landing / Observabilidade

| serviço | local | descrição | novo método |
|---|---|---|---|
| api | `index.ts:71` | tenant por id (LP) | `findTenantById GLOBAL` |
| api | `index.ts:74` | tenant por slug/codigo (LP) | `findBySlugOrCodigo GLOBAL` |
| api | `index.ts:91/150` | brand kit p/ LP/endpoint público | `findBrandKit` |
| api | `index.ts:149` | tenant p/ brand-kit público | `findTenantById GLOBAL` |
| api | `middleware/request-logger.ts:56` | inserção em lote de logs | `createRequestLogs GLOBAL` |
| api | `workflows/api-startup.workflow.ts:24` | health check conexão | `checkDbConnection GLOBAL` |
| api | `routes/observability.routes.ts:169/186` | KPIs raw SQL | `executeKpiQuery GLOBAL` |
| seed | `scripts/seed-plans.ts:6` | planos padrão | `seedPlans GLOBAL` |

---

## Avaliação de riscos da refatoração

| # | Risco | Gravidade | Detalhe / mitigação |
|---|---|---|---|
| 1 | **God-object / classe monocromática** | Média | ~300 métodos. Objetivo declarado (ponto de partida p/ refinamento). Mitigação: convenção de nomes por domínio + comentários de seção. |
| 2 | **Workers em lote multi-tenant não se encaixam no construtor com `tenantId`** | **Alta** | `publish-due`, `rule-engine`, `fury-engine`, `google-sync` iteram `tenants.findMany()` e operam cruzando tenants. Mitigação: repo global/estático ou instanciar por iteração. |
| 3 | **Queries GLOBAL não são tenant-scoped** | Média | Superadmin, catálogo de `plans`, `invoices`, `request_logs`, `furyConfig`, seeds, `workflowJobs`. Marcar métodos `GLOBAL` (estáticos) ou separar. |
| 4 | **Conflito com repos/providers existentes** | Média | `ICampaignRepository`, `DefaultCampaignRepository`, `MockCampaignRepository`, `db-metrics`/`db-campaign` providers. Decidir: absorver ou coexistir. |
| 5 | **Tipagem forte do Drizzle** | Média | `db.query.<tabela>` tem tipos inferidos. Usar `type Database = typeof db`; casts `as X` existentes. |
| 6 | **`db.transaction` / `execute` (SQL cru)** | Baixa | Poucos usos (2 tx, 3 execute) — precisam de métodos dedicados fora do padrão find/insert/update. |
| 7 | **Dois caminhos de import** (`@fury/db` vs `../../lib/db.js`) | Baixa | Apontam pro mesmo objeto; padronizar import único na migração. |
| 8 | **Regressão silenciosa / forte acoplamento** | **Alta** | Mais ampla refatoração do código. Mitigação: suíte vitest (isolada) por domínio a cada onda + TDD do AGENTS.md. |
| 9 | **TDD obrigatório (AGENTS.md)** | **Alta** | Cada método precisa de teste (mock `@fury/db`) + integração. Exigência do repo. |

### Recomendação
Rodar a refatoração em **ondas por domínio** (ex.: studio → planner → meta → ...), cada onda com testes
verdes, mesmo mantendo a meta de centralizar tudo numa única classe — migrar em fatias reduz o risco de regressão.