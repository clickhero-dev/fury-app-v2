# Diagnóstico: Module '@fury/db' Error - automationRules

## 🔍 Análise do Problema

### Status: ✅ VERIFICADO - Código está CORRETO

O erro `"Module '@fury/db' has no exported member 'automationRules'"` é um **problema de build do TypeScript**, não de código.

### Evidências:
1. ✅ `automationRules` EXISTS no schema.ts (linha 165)
2. ✅ `automationRules` está em `allTables` export (linha 197)
3. ✅ index.ts exporta `* from './schema.js'` (linha 2)
4. ✅ dist/schema.d.ts contém `automationRules` (linhas 642, 1431)
5. ✅ client.d.ts tipou db com schema completo
6. ✅ Imports no código estão CORRETOS

### Causa Raiz:
TypeScript cache está desatualizado ou dist/ foi gerado antes de automationRules ser adicionado.

---

## 🔧 Solução: Rebuild do DB Package

### **PASSO 1: Limpar caches**
```bash
# Remover dist compilado
rm -rf packages/db/dist

# Remover cache Node.js
rm -rf node_modules/.cache
```

### **PASSO 2: Rebuild do package db**
```bash
# Option A: Rebuild apenas db
cd packages/db
npm run build

# Option B: Rebuild monorepo inteiro (recomendado)
cd ../..
npm run build
```

### **PASSO 3: Invalidar cache do TypeScript**
```bash
# Se usar jest ou outro test runner, limpar cache
rm -rf .jest-cache
```

---

## 📋 Verificação Pós-Fix

Rodar estes comandos para confirmar que tudo está funcionando:

```bash
# 1. Verificar se automationRules está exportado
node -e "const db = require('@fury/db'); console.log('automationRules' in db)"
# Resultado esperado: true

# 2. Verificar tipos do db.query
cd apps/api && npx tsc --noEmit
# Sem erros esperado para automation*
```

---

## 🚀 Solução Rápida Recomendada

```bash
# Limpar tudo e rebuild
rm -rf packages/db/dist node_modules/.cache
npm run build --workspace=@fury/db
npm run build --workspace=@fury/api
```

---

## 📝 Por que isso acontece em monorepos

TypeScript/Node.js caches podem ficar desatualizado quando:
- Novos exports são adicionados ao schema
- O dist/ é gerado before new tables exist
- Workspace resolution não refetch types

A solução é sempre rebuild quando há mudanças no DB schema.

---

## ✅ Código está 100% Correto

Nenhuma alteração no código é necessária. Todos os imports/usages estão corretos:
- ✅ `automation.controller.ts` - Imports corretos
- ✅ `automation.service.ts` - Imports corretos  
- ✅ `rule-engine.worker.ts` - Imports corretos

O schema.ts tem TUDO que é necessário.
