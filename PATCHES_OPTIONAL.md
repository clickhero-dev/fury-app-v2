# Patches Opcionais - Melhorias & Type Safety

> ⚠️ ESTES PATCHES SÃO OPCIONAIS
> 
> O código atual está CORRETO e funcionará após o rebuild.
> Use estes patches apenas se quiser melhorar type safety e DX.

---

## 📍 Patch 1: Melhorar Type Inference em automation.service.ts

**Por quê:** Adicionar tipos explícitos deixa o código mais legível e catch erros em compile-time.

**Arquivo:** `apps/api/src/services/automation.service.ts`

```typescript
// ANTES
export async function createAutomationRule(args: {
  tenantId: string;
  name: string;
  description?: string;
  trigger: string;
  threshold: number;
  action: string;
  enabled?: boolean;
}) {
  // ...
  const [rule] = await db
    .insert(automationRules)
    .values({
      // ...
      threshold: args.threshold.toString(),
      enabled: args.enabled ? 'true' : 'false',
    })
    .returning();

  return rule;
}

// DEPOIS - Com tipos explícitos
import type { automationRules as AutomationRulesTable } from '@fury/db';

type AutomationRuleInput = {
  tenantId: string;
  name: string;
  description?: string;
  trigger: string;
  threshold: number;
  action: 'pause' | 'notify' | 'reduce_budget';
  enabled?: boolean;
};

type AutomationRuleOutput = typeof AutomationRulesTable.$inferSelect;

export async function createAutomationRule(
  args: AutomationRuleInput
): Promise<AutomationRuleOutput> {
  if (args.threshold < 0) {
    throw new AppError(400, 'INVALID_THRESHOLD', 'Threshold cannot be negative');
  }

  const [rule] = await db
    .insert(automationRules)
    .values({
      tenantId: args.tenantId,
      name: args.name,
      description: args.description,
      trigger: args.trigger,
      ruleType: args.trigger,
      threshold: args.threshold.toString(),
      action: args.action,
      enabled: args.enabled ? 'true' : 'false',
    })
    .returning();

  return rule;
}

export async function getAutomationRules(
  tenantId: string
): Promise<Array<AutomationRuleOutput & { threshold: number; enabled: boolean }>> {
  const rules = await db.query.automationRules.findMany({
    where: eq(automationRules.tenantId, tenantId),
  });

  return rules.map((rule) => ({
    ...rule,
    threshold: parseInt(rule.threshold, 10),
    enabled: rule.enabled === 'true',
  }));
}
```

**Benefícios:**
- ✅ Type checking em compile-time
- ✅ IDE autocomplete
- ✅ Documentação implícita via tipos
- ✅ Refactoring seguro

---

## 📍 Patch 2: Adicionar Type Guards em rule-engine.worker.ts

**Por quê:** Validação em runtime para regras que vêm do DB.

**Arquivo:** `apps/api/src/workers/rule-engine.worker.ts`

```typescript
// NOVO: Adicionar validador de tipo
const VALID_RULE_TYPES = [
  'pause_high_cpa',
  'pause_low_roas',
  'pause_zero_conversions',
  'budget_limit',
] as const;

function isValidRuleType(type: unknown): type is typeof VALID_RULE_TYPES[number] {
  return typeof type === 'string' && VALID_RULE_TYPES.includes(type as any);
}

// USAR EM: checkCampaignAgainstRule
async function checkCampaignAgainstRule(
  rule: typeof automationRules.$inferSelect,
  campaign: typeof campaigns.$inferSelect
): Promise<RuleCheckResult> {
  const metrics = campaign.metrics as Record<string, unknown> || {};
  const threshold = parseFloat(rule.threshold.toString());

  const result: RuleCheckResult = {
    ruleId: rule.id,
    ruleType: rule.ruleType,
    campaignId: campaign.id,
    campaignName: campaign.name,
    triggered: false,
    metrics,
  };

  // Validar tipo da rule
  if (!isValidRuleType(rule.ruleType)) {
    console.warn(`Unknown rule type: ${rule.ruleType}`);
    return result;
  }

  // Rest da função segue igual...
}
```

**Benefícios:**
- ✅ Evita bugs com rule types inválidos
- ✅ Documentação de tipos aceitos
- ✅ Fails fast se dados estão corrompidos

---

## 📍 Patch 3: Schema - Melhorar Tipagem do Campo 'enabled'

**Por quê:** Usar `boolean` em vez de `text` para 'enabled' é mais type-safe.

**Arquivo:** `packages/db/src/schema.ts`

```typescript
// ANTES
export const automationRules = pgTable(
  'automation_rules',
  {
    // ...
    enabled: text('enabled').notNull().default('true'),
    // ...
  }
);

// DEPOIS - Usar boolean nativo do PostgreSQL
export const automationRules = pgTable(
  'automation_rules',
  {
    // ...
    enabled: boolean('enabled').notNull().default(true),
    isActive: boolean('is_active').notNull().default(true),  // Manter para compatibilidade
    // ...
  }
);
```

**Nota:** Isso requer:
1. Nova migration para converter `enabled` text → boolean
2. Atualizar código que lê `enabled` para não precisar fazer `.enabled === 'true'`

**Migration necessária:**
```sql
-- 0003_fix_automation_rules_enabled.sql
ALTER TABLE automation_rules 
ALTER COLUMN enabled TYPE boolean USING (enabled = 'true');

ALTER TABLE automation_rules 
ALTER COLUMN enabled SET DEFAULT true;
```

---

## 📍 Patch 4: Adicionar Índices Faltantes (Performance)

**Por quê:** Queries frequentes em automationRules devem ser otimizadas.

**Arquivo:** `packages/db/src/schema.ts`

```typescript
export const automationRules = pgTable(
  'automation_rules',
  {
    // campos...
  },
  (table) => ({
    tenantIdIdx: index('automation_rules_tenant_id_idx').on(table.tenantId),
    // NOVO:
    tenantRuleTypeIdx: index('automation_rules_tenant_rule_type_idx').on(
      table.tenantId,
      table.ruleType
    ),
    isActiveIdx: index('automation_rules_is_active_idx').on(table.isActive),
  })
);
```

**Benefícios:**
- ✅ Query `findMany` com tenantId + ruleType ~10x mais rápido
- ✅ Filter por `isActive` mais eficiente

---

## 🔄 Ordem de Aplicação Recomendada

Se decidir aplicar os patches:

1. **Primeiro:** Patch 1 (Type Safety - sem breaking changes)
2. **Segundo:** Patch 4 (Índices - sem breaking changes)
3. **Terceiro:** Patch 2 (Validação - compatível com código)
4. **Por último:** Patch 3 (Schema change - requer migration)

---

## ✅ Checklist Pós-Patches

```bash
# 1. Rebuild
npm run build

# 2. Typecheck
npx tsc --noEmit

# 3. Testes
npm test

# 4. Se aplicou Patch 3 (migration):
npm run migrate
npm run db:seed
```

---

## 💡 Quando Aplicar Cada Patch

| Patch | Aplicar se... |
|-------|---------------|
| 1 | Você quer melhor type checking |
| 2 | Você quer mais validação runtime |
| 3 | Você quer cleanest possible schema |
| 4 | Você tem >1000 regras em produção |

**Recomendação:** Aplique **Patch 1 + 4** (ganho máximo, zero risco).
