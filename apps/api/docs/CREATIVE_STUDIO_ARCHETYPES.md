# Estúdio de Criação — 5 Arquétipos Visuais

Substituem os 4 layouts antigos (`product_hero`, `text_focus`, `offer_highlight`,
`testimonial_style`), removidos em 15/06/2026. Cada arquétipo é um renderer
dedicado em `@napi-rs/canvas` (canvas 1080×1080, Meta Ads 1:1).

> Linguagem de produto: a UI nunca exibe os nomes técnicos. O dicionário central
> de rótulos amigáveis vive em `apps/web/src/lib/layout-labels.ts`.

## Os 5 arquétipos

| Técnico | Nome (UI) | Funil | Quando usar |
|---|---|---|---|
| `editorial_headline` | Manchete editorial | TOFU | Gerar curiosidade/autoridade — ensinar ou alertar sobre um tema, sem venda direta. Foto de cena + faixa preta com manchete. |
| `offer_burst` | Oferta de alto impacto | BOFU | Oferta forte (desconto, brinde, preço) que precisa de atenção imediata. Fundo na cor da marca + badge de oferta + sunburst. |
| `split_diagonal_product` | Vitrine de produto | BOFU | Produto (físico/digital) com mockup, benefícios e preço. Split diagonal + selo de preço. |
| `photo_immersive` | Foto imersiva | MOFU | Negócio local: foto bonita full-bleed que faz querer conhecer. Gradiente de leitura adaptativo + chip de logo. |
| `split_horizontal_photo` | Apresentação institucional | MOFU | Apresentação sóbria do negócio (foto + identidade). Tom `institutional` (sereno) ou `energetic` (agressivo). |

## Campos obrigatórios por arquétipo

| Arquétipo | Texto obrigatório | Imagem | Logo |
|---|---|---|---|
| editorial_headline | `headline`, `subheadline` | `background_image_url` | — |
| offer_burst | `headline`, `offer_text` | `hero_image_url` (opcional) | — |
| split_diagonal_product | `headline`, `benefits` (2-4), `cta` | `product_image_url` | — |
| photo_immersive | `qualifier`, `headline`, `cta` | `background_image_url` | **obrigatório** |
| split_horizontal_photo | `qualifier`, `headline`, `cta` | `background_image_url` | **obrigatório** |

Limites de caracteres e campos opcionais (`subtitle`, `subtitle_highlight`,
`price_text`, `tone`, `cta_icon`, overrides de cor) estão no contrato
`apps/api/src/services/creative-data.ts` e validados no Zod de
`apps/api/src/routes/studio.routes.ts`.

## Fluxo

```
Briefing (produto, promessa, oferta, público, imagem)
        │
        ▼
Layout Selector Agent  ── DeepSeek (temp 0.3), regras de asset, fallback offer_burst
  apps/api/src/services/layout-selector.service.ts
  POST /api/studio/select-layout → { layout, label, funnel_stage, justification, suggested_fields }
        │
        ▼
Edição dos campos + preview fiel  ── POST /api/studio/preview-png (render sem salvar)
  apps/web/src/pages/estudio/components/CreativeFieldsForm.tsx
        │
        ▼
Renderer do arquétipo  ── convertHTMLToPNG()
  apps/api/src/services/html-to-png.service.ts
        │
        ▼
PNG 1080×1080  ── POST /api/studio/creative/generate (skipCopy=true → render = preview)
```

## Garantias do renderer

- **Fontes**: Open Sans (OFL) bundlado em `apps/api/assets/fonts/` (Regular 400,
  Bold 700, ExtraBold 800), registrado sob o alias `AppFont`. Determinístico
  entre macOS e Linux/Railway; cobertura total de acentos PT-BR.
- **Contraste**: `ensureReadable()` (WCAG) ajusta a cor de qualquer texto antes
  de desenhar; guards agnósticos de marca.
- **Assets ausentes**: `throw` explícito (sem fallback silencioso); a UI mostra
  badge "Modelo descontinuado" para layouts legados.

## Validação

`apps/api/scripts/render-samples.ts` gera os 5 arquétipos (+ ambos os tons do
`split_horizontal_photo`) em `apps/api/_samples/<timestamp>/` para **validação
visual obrigatória antes de cada commit** (tsc/guards não pegam acento que não
renderizou, logo cobrindo produto ou texto ilegível sobre foto).

## Referências de design

Os blueprints originais da sessão de design (5 arquivos `.md`) não estão
versionados neste repositório. A fonte de verdade da implementação é:
- Contrato: `apps/api/src/services/creative-data.ts`
- Seleção: `apps/api/src/services/layout-selector.service.ts`
- Renderização: `apps/api/src/services/html-to-png.service.ts`
- Rótulos de UI: `apps/web/src/lib/layout-labels.ts`
