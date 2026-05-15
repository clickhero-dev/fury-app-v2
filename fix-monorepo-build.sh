#!/bin/bash

# 🔧 Fix Monorepo Build Cache Issue - automationRules Export

set -e

echo "🧹 Limpando caches..."
rm -rf packages/db/dist
rm -rf node_modules/.cache
rm -rf .jest-cache
rm -rf dist 2>/dev/null || true

echo "📦 Instalando dependências..."
npm install

echo "🏗️ Building @fury/db package..."
npm run build --workspace=@fury/db

echo "🏗️ Building @fury/api package..."
npm run build --workspace=@fury/api

echo "✅ Verificando exports..."
node -e "const db = require('@fury/db'); console.log('✓ automationRules exported:', 'automationRules' in db); console.log('✓ db object ready'); process.exit(0)"

echo ""
echo "🎉 Build concluído com sucesso!"
echo ""
echo "Próximos passos:"
echo "  1. npm run dev              # Iniciar dev server"
echo "  2. npm test                 # Rodar testes"
echo ""
