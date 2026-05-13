# Studio Copy Generator - Deployment Ready

## ✅ Endpoint Implemented

**Route:** `POST /api/studio/generate-copy`

**Middlewares:** `authMiddleware`, `tenantMiddleware`

## ✅ Request Body Validation

Schema validado com Zod:
```json
{
  "type": "headline|descricao|cta|completo",
  "produto": "string (min 3, max 200)",
  "publico": "string (min 5, max 200)",
  "objetivo": "string (min 5, max 200)",
  "tom": "formal|casual|urgente|emocional",
  "quantidadeVariacoes": "number (3-5, default 3)"
}
```

## ✅ Character Limits per Type

- `headline`: 40 chars
- `descricao`: 125 chars
- `cta`: 20 chars
- `completo`: 300 chars (soft limit)

## ✅ Scoring Algorithm (0-10)

- **3 pts base**
- **+3 pts** if text ≤ character limit
- **+2 pts** if contains CTA words (compre, acesse, saiba, clique, garanta)
- **+2 pts** if no forbidden words (grátis excessivo, garantido 100%, melhor do mundo)

## ✅ Response Structure

Success (HTTP 200):
```json
{
  "variacoes": [
    {
      "texto": "string",
      "caracteres": "number",
      "pontuacao": "number (0-10)"
    }
  ]
}
```

## ✅ Fallback Behavior

When `ANTHROPIC_API_KEY` is missing or `META_USE_MOCK=true`:
- Returns 3-5 mock variations (respecting `quantidadeVariacoes`)
- Each variation has proper `texto`, `caracteres`, `pontuacao`
- **No error thrown** - graceful degradation

## ✅ ESM Compatibility

- `src/lib/claude.ts`: Uses native Node 18 `fetch`, handles missing API key gracefully
- `src/routes/studio.routes.ts`: All imports end with `.js` (ESM format)
- No `node-fetch` dependency
- No uncaught exceptions on import

## ✅ Test Coverage

All 8 validation tests pass:
- ✓ Returns 3 variations when API unavailable
- ✓ Respects 3-5 variation limits
- ✓ Each variation has required fields
- ✓ Character count = string length
- ✓ Pontuacao is 0-10
- ✓ Validates required fields
- ✓ Supports all 4 tones
- ✓ Supports all 4 types

## 🚀 Deployment Checklist

- [x] Endpoint route implemented: `POST /api/studio/generate-copy`
- [x] Auth + tenant middlewares applied
- [x] Zod validation for request body
- [x] Character limits per type
- [x] Scoring function (0-10)
- [x] Claude API integration
- [x] Fallback for missing API key
- [x] ESM compatibility (Node 18+)
- [x] No uncaught exceptions
- [x] Comprehensive tests
- [ ] Set `ANTHROPIC_API_KEY` in Railway env vars (optional)
- [ ] Configure `META_USE_MOCK=true` if needed in dev

## Environment Variables

**Required (for real API):**
- `ANTHROPIC_API_KEY` - Anthropic API key

**Optional:**
- `META_USE_MOCK=true` - Force fallback responses (for testing)

## Example cURL Request

```bash
curl -X POST 'https://your-railway-url/api/studio/generate-copy' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "headline",
    "produto": "Produto XYZ",
    "publico": "pequenas empresas",
    "objetivo": "aumentar vendas",
    "tom": "casual",
    "quantidadeVariacoes": 3
  }'
```

## Error Handling

- **400 Bad Request**: Validation errors (invalid type, missing fields, etc.)
- **500 Server Error**: Unexpected errors (caught and logged)
- **200 OK**: Even if API unavailable (returns mock data)

---

**Status:** ✅ Production Ready
**Last Updated:** 2026-05-12
