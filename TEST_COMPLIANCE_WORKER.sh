#!/bin/bash

# ============================================================================
# COMPLIANCE WORKER TEST SUITE
# ============================================================================
# Este script fornece comandos para testar o compliance-check worker
# ============================================================================

echo "🧪 COMPLIANCE WORKER TEST GUIDE"
echo ""

# ===========================================================================
# 1. TESTES UNITÁRIOS COM VITEST
# ===========================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  EXECUTAR TESTES VITEST"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Comando:"
echo "  npm run test -- compliance-check.test.ts"
echo ""
echo "Ou com watch mode:"
echo "  npm run test:watch -- compliance-check.test.ts"
echo ""

# ===========================================================================
# 2. SETUP INICIAL
# ===========================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  SETUP: INICIAR DEPENDÊNCIAS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Comandos necessários:"
echo ""
echo "A. Compilar packages:"
echo "   npm run build --workspace=packages/db"
echo "   npm run build --workspace=packages/shared"
echo ""
echo "B. Rodar migrações:"
echo "   npm run db:migrate"
echo ""
echo "C. Iniciar Docker (Redis + Postgres):"
echo "   sudo docker-compose -f infra/docker-compose.yml up -d"
echo ""
echo "D. Rodar servidor:"
echo "   npm run --workspace @fury/api dev"
echo ""
echo "E. Em outro terminal, rodar testes:"
echo "   npm test"
echo ""

# ===========================================================================
# 3. TESTES COM CURL (Integração)
# ===========================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣  TESTES COM CURL (API REST)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 3.1 Registro
echo "PASSO 1: Registrar usuário"
echo "────────────────────────────────────────────────────────────────────"
cat << 'EOF'
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "compliance-test@example.com",
    "password": "SecurePass123!",
    "companyName": "Compliance Test Company"
  }'

# Resposta esperada: { data: { tokens: { accessToken: "..." }, user: { id, tenantId } } }
# Copie o accessToken e tenantId para os próximos testes
EOF
echo ""
echo ""

# 3.2 Criar asset
echo "PASSO 2: Criar um creative asset para teste"
echo "────────────────────────────────────────────────────────────────────"
cat << 'EOF'
# IMPORTANTE: Substitua <ACCESS_TOKEN> e <TENANT_ID> pelos valores do PASSO 1

curl -X POST http://localhost:3000/api/studio/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -d '{
    "tenantId": "<TENANT_ID>",
    "briefing": "Produto revolucionário com desconto de 50% - PROMOÇÃO LIMITADA",
    "format": "feed",
    "style": "fotografico",
    "adAccountId": "test-account-123",
    "publicBaseUrl": "http://localhost:3000"
  }'

# Resposta esperada: 
# {
#   "success": true,
#   "data": {
#     "creativeAssetId": "uuid-123...",
#     "imageUrl": "http://localhost:3000/studio-assets/...",
#     "status": "pending_compliance"
#   }
# }

# O asset será automaticamente enfileirado para compliance check!
EOF
echo ""
echo ""

# 3.3 Verificar status
echo "PASSO 3: Verificar status do compliance check"
echo "────────────────────────────────────────────────────────────────────"
cat << 'EOF'
# Query o banco para ver se foi processado (em poucos segundos)
# Use qualquer ferramenta SQL (psql, pgAdmin, etc):

# SELECT id, compliance_status, compliance_notes 
# FROM creative_assets 
# WHERE id = '<creativeAssetId>'
# LIMIT 1;

# Ou via API (se implementada):
curl -X GET http://localhost:3000/api/studio/assets/<creativeAssetId> \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
EOF
echo ""
echo ""

# ===========================================================================
# 4. VALIDAÇÕES ESPERADAS
# ===========================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4️⃣  VALIDAÇÕES ESPERADAS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
cat << 'EOF'
✅ Critério 1: compliance_status atualizado
   ESPERADO: Campo muda de 'pending_compliance' para 'approved' ou 'rejected'
   COMO VERIFICAR: SELECT compliance_status FROM creative_assets WHERE id = '...'

✅ Critério 2: compliance_notes preenchido com motivos
   ESPERADO: Contém detalhes como "Texto excessivo detectado", "Confiança: X%"
   COMO VERIFICAR: SELECT compliance_notes FROM creative_assets WHERE id = '...'

✅ Critério 3: Worker processa automaticamente
   ESPERADO: Status muda em até 5-10 segundos após criar asset
   COMO VERIFICAR: Monitorar logs do servidor ([COMPLIANCE] 🔍 ...)

✅ Critério 4: Fallback funciona
   ESPERADO: Se sem ANTHROPIC_API_KEY, asset é marcado 'approved' com [FALLBACK]
   COMO VERIFICAR: Remove ANTHROPIC_API_KEY e testa novamente

✅ Critério 5: Produção (Node 22 + Railway)
   ESPERADO: Funciona com NODE_VERSION=22 e ESM imports
   COMO VERIFICAR: Deploy no Railway e monitorar logs
EOF
echo ""
echo ""

# ===========================================================================
# 5. LOGS E DEBUG
# ===========================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5️⃣  LOGS E DEBUG"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
cat << 'EOF'
Busque estes padrões nos logs do servidor:

✅ Sucesso:
   [COMPLIANCE] 🔍 Iniciando análise do asset: ...
   [COMPLIANCE] ✅ Imagem baixada com sucesso
   [COMPLIANCE] 📤 Enviando para Claude Vision...
   [COMPLIANCE] ✅ Resultado para ...: APPROVED (Confiança: X%)

⚠️  Fallback (esperado sem ANTHROPIC_API_KEY):
   [COMPLIANCE] ⚠️  ANTHROPIC_API_KEY não configurada, usando fallback
   [COMPLIANCE] 🔄 Fallback aplicado: approved | Motivo: ...

❌ Erros (investigar):
   [COMPLIANCE ERROR] Job falhou: ...
   [COMPLIANCE] ❌ Erro ao baixar imagem: ...
EOF
echo ""
echo ""

# ===========================================================================
# 6. CHECKLIST FINAL
# ===========================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "6️⃣  CHECKLIST FINAL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "□ Compilação sem erros"
echo "□ Redis conectado (visível em logs: ✅ Redis connected)"
echo "□ Worker iniciado (visível em logs: ✅ Compliance check worker started)"
echo "□ Asset criado com status 'pending_compliance'"
echo "□ Status muda para 'approved' ou 'rejected' em 5-10s"
echo "□ Campo compliance_notes preenchido com motivos"
echo "□ Fallback funciona quando sem API Key"
echo "□ Testes vitest passam"
echo "□ Pronto para produção!"
echo ""
