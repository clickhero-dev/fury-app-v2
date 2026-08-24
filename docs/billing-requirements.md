# Requisitos de Billing / Cobranças — Ady (Fury App v2)

> Documento gerado a partir da conversa com o usuário para definir escopo da feature de billing.
> Task ClickUp: https://app.clickup.com/t/90171071096/86e2vvvnd

---

## Perguntas do Usuário (Requisitos Obrigatórios)

| # | Pergunta | Status | Observação |
|---|----------|--------|------------|
| 1 | **Os planos já existem?** | ❓ Precisa confirmar | Ver schema `plans` table — já tem estrutura (name, priceCents, interval, features, limits, isActive) |
| 2 | **A cobrança será por recorrência?** | ❓ Precisa confirmar | Atualmente usa Asaas subscriptions (MONTHLY/YEARLY) |
| 3 | **Como funciona a política de cancelamento?** | ❓ Precisa definir | Hoje: `DELETE /subscription` cancela no Asaas + marca `cancelled` no DB |
| 4 | **Como funciona a política de reembolso?** | ❓ Precisa definir | Não implementado atualmente |
| 5 | **Quais são os meios de pagamentos aceitos?** | ❓ Precisa confirmar | Asaas suporta: BOLETO, PIX, CREDIT_CARD (já no schema `subscribeSchema`) |
| 6 | **Em quantas vezes dá para parcelar?** | ❓ Precisa definir | Asaas parcelamento só no CREDIT_CARD — precisa regra de negócio |
| 7 | **Se a cobrança falhar por falta de crédito no cartão, em quanto tempo deve ser feita a recobrança?** | ❓ Precisa definir | Asaas tem retentativa automática? Precisa configurar webhook `OVERDUE` |
| 8 | **Quantas vezes deve ser feita a recobrança?** | ❓ Precisa definir | Ex: 3 tentativas em 7 dias? |
| 9 | **Se todas as recobranças falharem, o plano vai ser cancelado?** | ❓ Precisa definir | Hoje: webhook `OVERDUE` marca `past_due` — não cancela automaticamente |
| 10 | **Se a pessoa tiver um plano, e fizer o upgrade, como deve ser feita a cobrança? Proporcional?** | ❓ Precisa definir | **Ponto crítico** — prorata? Cobrar diferença imediata? Próximo ciclo? |
| 11 | **No caso do white label, como deve ser feito o split?** | ❓ Precisa definir | Split de receita entre Ady e parceiro white-label |
| 12 | **O que é o split?** | ❓ Precisa educar/definir | Definição técnica: divisão automática do valor da transação entre contas |

---

## Perguntas Complementares (Exceções / Edge Cases / Pontos Não Mapeados)

### Ciclo de Vida da Assinatura

| # | Pergunta | Contexto |
|---|----------|----------|
| 13 | **Trial gratuito?** Quantos dias? Renova automático para pago? | Hoje: 7 dias trial hardcoded no `subscribe` route |
| 14 | **Downgrade de plano** — como tratar? Proporcional? Crédito para próximo ciclo? | Não implementado |
| 15 | **Mudança de ciclo** (mensal ↔ anual) — recalcula valor? Quando aplica? | Não implementado |
| 16 | **Pausar assinatura** — é permitido? Por quanto tempo? Mantém acesso? | Não implementado |
| 17 | **Reativar assinatura cancelada** — usa mesmo plano/preço ou preço atual? | Hoje: bloqueia nova assinatura se houver `cancelled`/`inactive`/`past_due` |

### Pagamentos e Inadimplência

| # | Pergunta | Contexto |
|---|----------|----------|
| 18 | **Boleto vencido** — permite pagamento após vencimento? Com juros/multa? | Asaas cobra juros/multa configurável |
| 19 | **PIX expirado** (15-30 min) — gera novo automaticamente? Notifica usuário? | Não implementado |
| 20 | **Cartão expirado/recusado** — notifica para atualizar? Tenta outro cartão salvo? | Asaas tem "cartão salvo" (tokenizado) |
| 21 | **Chargeback / contestação** — fluxo de disputa? Bloqueia acesso imediato? | Webhook Asaas `CHARGEBACK_REQUESTED` / `CHARGEBACK_DISPUTE` |
| 22 | **Estorno parcial** — permitido? Em que casos? | Não implementado |
| 23 | **Pagamento manual** (superadmin lança pagamento avulso) — como registrar? | Útil para acordos comerciais, migrações |

### White Label / Split de Receita

| # | Pergunta | Contexto |
|---|----------|----------|
| 24 | **Split fixo (%) ou por faixa de valor?** | Ex: 80/20 até R$ 10k, 70/30 acima |
| 25 | **Split por plano** (planos diferentes = splits diferentes)? | |
| 26 | **Split por tenant** (parceiros diferentes = splits diferentes)? | |
| 27 | **Quando o split é liquidado?** No recebimento (PIX/boleto compensado) ou no faturamento? | Asaas Split: `split` na criação do pagamento/subscription |
| 28 | **Mínimo para repasse** (ex: só repassa se > R$ 50)? | |
| 29 | **Relatório de split para parceiro** — frequência? Formato (CSV, API, dashboard)? | |
| 30 | **Impostos no split** — quem paga ISS/PIS/COFINS? Retém na fonte? | Jurídico/contábil |

### Upgrade / Downgrade / Cross-grade

| # | Pergunta | Contexto |
|---|----------|----------|
| 31 | **Upgrade imediato** — cobra diferença pro-rata agora + novo valor no próximo ciclo? | Padrão SaaS: prorata do tempo restante |
| 32 | **Downgrade** — devolve diferença como crédito? Ou só aplica no próximo ciclo? | |
| 33 | **Cross-grade** (mesmo preço, features diferentes) — cobra algo? | |
| 34 | **Limite de upgrades/downgrades por mês**? | Evita abuse |
| 35 | **Upgrade durante trial** — encerra trial e cobra já? Ou mantém trial? | |

### Integração Asaas — Configurações Faltantes

| # | Pergunta | Contexto |
|---|----------|----------|
| 36 | **Asaas: Juros/multa por atraso** — % ao mês? Valor fixo? | Config no Asaas ou no nosso lado? |
| 37 | **Asaas: Dias de carência** antes de marcar overdue? | |
| 38 | **Asaas: Retentativa automática** — habilitar? Quantas vezes? Intervalo? | |
| 38 | **Asaas: Notificações automáticas** (email/SMS) — Ativar? Templates customizados? | |
| 40 | **Asaas: Webhooks necessários** — quais eventos assinar? `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `SUBSCRIPTION_CANCELLED`, `CHARGEBACK_*` | |

### Multi-tenancy / Superadmin

| # | Pergunta | Contexto |
|---|----------|----------|
| 41 | **Superadmin pode criar assinatura "cortesia" (isNonExpirable)** — já existe no schema | Hoje: campo `isNonExpirable` no `subscriptions` — usado? |
| 42 | **Planos customizados por tenant** (preço negociado) — como versionar? | Clonar plano global? Ou campo `customPriceCents` na subscription? |
| 43 | **Tenant pode ter múltiplas assinaturas simultâneas?** (ex: plano base + add-ons) | Schema hoje: 1 subscription por tenant (unique? não, mas lógica bloqueia) |

### Compliance / Fiscal / LGPD

| # | Pergunta | Contexto |
|---|----------|----------|
| 44 | **Nota fiscal** — emissão automática? Integração com NFSe (cidade)? | Asaas emite NFS-e? |
| 45 | **Retenção de impostos** (ISS, IRRF, PIS/COFINS/CSLL) — como tratar no split? | |
| 46 | **LGPD** — dados de pagamento (CPF, cartão) — retenção? Exclusão sob solicitação? | Asaas tokeniza cartão; nós guardamos CPF/CNPJ no customer |
| 47 | **Auditoria** — log de todas alterações de plano/preço/status? | Hoje: `updatedAt` apenas |

### UX / Comunicação

| # | Pergunta | Contexto |
|---|----------|----------|
| 48 | **Emails transacionais** — quais? (boas-vindas, fatura, vencimento, cancelamento, upgrade, falha pagamento) | Templates? SendGrid/Resend? |
| 49 | **Portal do cliente** (self-service) — trocar cartão, ver faturas, cancelar, upgrade/downgrade? | Asaas tem portal white-label? Ou construímos? |
| 50 | **Notificação in-app** — banner "assinatura vencida", "pagamento falhou", "trial acabando"? | |

### Relatórios / Métricas

| # | Pergunta | Contexto |
|---|----------|----------|
| 51 | **MRR/ARR** — cálculo em tempo real? Snapshot diário? | |
| 52 | **Churn rate** — voluntário vs involuntário (falha pagamento)? | |
| 53 | **LTV / CAC** — tracking por canal de aquisição? | |
| 54 | **Aging de recebíveis** — faturas em atraso por faixa (0-30, 30-60, 60-90, 90+)? | |

### Migração / Legado

| # | Pergunta | Contexto |
|---|----------|----------|
| 55 | **Clientes legados** (já pagando fora do Asaas) — como migrar? | Importar customers + subscriptions? |
| 56 | **Preços grandfathered** — manter preço antigo para clientes atuais? | Campo `priceLockedAt` / `legacyPriceCents`? |

---

## Decisões Técnicas Já Implementadas (Referência)

| Item | Atual | Arquivo |
|------|-------|---------|
| Gateway de pagamento | **Asaas** (sandbox/production via `ASAAS_ENV`) | `asaas.service.ts` |
| Planos | Tabela `plans` (global, não por tenant) | `schema.ts:401-410` |
| Assinaturas | Tabela `subscriptions` (1 por tenant) | `schema.ts:413-437` |
| Faturas | Tabela `invoices` (1 por pagamento Asaas) | `schema.ts:440-461` |
| Webhook Asaas | `POST /api/billing/webhook` (valida `asaas-access-token`) | `billing.routes.ts:39-112` |
| Trial | 7 dias hardcoded | `billing.routes.ts:192-193` |
| Meios de pagamento | BOLETO, PIX, CREDIT_CARD | `billing.routes.ts:122` |
| Cancelamento | `DELETE /subscription` → cancela Asaas + `status: cancelled` | `billing.routes.ts:293-318` |
| Status subscription | `trial`, `active`, `past_due`, `cancelled`, `inactive` | `schema.ts:43-49` |
| Split white-label | **NÃO IMPLEMENTADO** | — |
| Prorata upgrade/downgrade | **NÃO IMPLEMENTADO** | — |
| Retentativa falha pagamento | **NÃO IMPLEMENTADO** (só marca `past_due`) | `billing.routes.ts:99-103` |

---

## Próximos Passos Sugeridos

1. **Responder às perguntas 1-12** (obrigatórias do usuário)
2. **Priorizar perguntas 13-23** (ciclo de vida + inadimplência — core do billing)
3. **Definir white-label/split** (perguntas 24-30) — se for MVP, pode deixar para fase 2
4. **Validar configurações Asaas** (perguntas 36-40) — técnico, pode ser defaults
5. **Definir UX/comunicação** (perguntas 48-50) — impacto direto no frontend

---

## Template de Resposta (para preencher)

```markdown
## Respostas do Stakeholder

### Obrigatórias
1. Planos já existem? **SIM/NÃO** — Detalhes: _____
2. Cobrança por recorrência? **SIM/NÃO** — Detalhes: _____
3. Política de cancelamento: _____
4. Política de reembolso: _____
5. Meios de pagamento: [ ] BOLETO [ ] PIX [ ] CREDIT_CARD [ ] OUTRO: _____
6. Parcelamento: _____
7. Recobrança após falha (tempo): _____
8. Recobrança (quantas vezes): _____
9. Cancela após falhas? **SIM/NÃO** — Detalhes: _____
10. Upgrade (proporcional?): _____
11. White-label split: _____
12. Definição de split: _____

### Complementares (prioridade alta)
13. Trial: _____
14. Downgrade: _____
15. Mudança ciclo: _____
16. Pausar: _____
17. Reativar: _____
18. Boleto vencido: _____
19. PIX expirado: _____
20. Cartão recusado: _____
21. Chargeback: _____
22. Estorno parcial: _____
23. Pagamento manual: _____
... (continuar conforme necessário)
```

---

*Documento vivo — atualizar conforme decisões forem tomadas.*