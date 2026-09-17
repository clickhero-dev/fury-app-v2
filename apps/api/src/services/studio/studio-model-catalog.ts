/**
 * Catálogo de modelos de geração (imagem/vídeo) do Estúdio — fonte de
 * verdade única para o seletor do front, validação e UI.
 *
 * Regras de produto (decididas 2026-09):
 * - 7 modelos de IMAGEM no total: 3 da família FLUX 2 + 4 de outras
 *   famílias (para testar modelos diferentes do OpenRouter). Microsoft
 *   MAI foi REMOVIDO por custo (não aprovado); GPT Image 1 e Recraft
 *   v4.1 Pro foram RETIRADOS do catálogo (decisão de produto).
 * - Custo exibido ao usuário é SEMPRE o custo real devolvido pelo
 *   OpenRouter (usage.cost) — sem preço/s estimativa aqui.
 * - Modelo novo = adicionar 1 entrada AQUI + 1 id no zod enum do
 *   controller (aberto por teste de paridade em openrouter.controller).
 * - IDs FLUX 2 são os que já rodam em produção (espelho do OpenRouter
 *   deste ambiente não lista flux.2* — não servir de fonte p/ removê-los).
 */

export interface StudioModel {
  id: string;
  label: string;
  description: string;
  category: 'barato' | 'custo-beneficio' | 'qualidade';
  /** Imagem: 'flux-2' (família FLUX 2) ou 'outras'. Vídeo: 'video'. */
  family: 'flux-2' | 'outras' | 'video';
  type: 'image' | 'video';
}

export const IMAGE_MODELS: StudioModel[] = [
  // ─── Família FLUX 2 (Black Forest Labs) ───────────────────────────
  {
    id: 'black-forest-labs/flux.2-klein-4b',
    label: 'FLUX.2 Klein 4B',
    description: 'Black Forest Labs — Rápido e consistente para o dia a dia.',
    category: 'custo-beneficio',
    family: 'flux-2',
    type: 'image',
  },
  {
    id: 'black-forest-labs/flux.2-max',
    label: 'FLUX.2 Max',
    description: 'Black Forest Labs — Máxima qualidade para campanhas premium.',
    category: 'qualidade',
    family: 'flux-2',
    type: 'image',
  },
  {
    id: 'black-forest-labs/flux.2-pro',
    label: 'FLUX.2 Pro',
    description: 'Black Forest Labs — Qualidade profissional com alta fidelidade ao prompt.',
    category: 'qualidade',
    family: 'flux-2',
    type: 'image',
  },
  // ─── Outras famílias (4 modelos, 4 provedores distintos) ──────────
  {
    // Slug real no OpenRouter usa hífen na versão ("5-0-pro"), não ponto
    // — https://openrouter.ai/bytedance-seed/seedream-5-0-pro
    id: 'bytedance-seed/seedream-5-0-pro',
    label: 'Seedream 5.0 Pro',
    description: 'ByteDance — Renderização realista com bom custo-benefício.',
    category: 'barato',
    family: 'outras',
    type: 'image',
  },
  {
    id: 'x-ai/grok-imagine-image-2.0',
    label: 'Grok Imagine 2.0',
    description: 'xAI — Estilo fotográfico e criativo com boa fidelidade.',
    category: 'custo-beneficio',
    family: 'outras',
    type: 'image',
  },
  {
    id: 'qwen/qwen-image-3-pro',
    label: 'Qwen Image 3 Pro',
    description: 'Alibaba — Equilíbrio entre qualidade e texto na imagem.',
    category: 'barato',
    family: 'outras',
    type: 'image',
  },
  {
    id: 'google/gemini-3.1-flash-image',
    label: 'Gemini 3.1 Flash Image',
    description: 'Google — Rápido, nativo do ecossistema Gemini.',
    category: 'custo-beneficio',
    family: 'outras',
    type: 'image',
  },
];

export const VIDEO_MODELS: StudioModel[] = [
  {
    id: 'google/veo-3.1-lite',
    label: 'Veo 3.1 Lite',
    description: 'Google — Mais barato. Clipes 4-8s, 720p/1080p com áudio.',
    category: 'barato',
    family: 'video',
    type: 'video',
  },
  {
    id: 'kwaivgi/kling-video-o1',
    label: 'Kling Video O1',
    description: 'Kuaishou — Melhor custo-benefício. $0.112/s, cinematográfico.',
    category: 'custo-beneficio',
    family: 'video',
    type: 'video',
  },
  {
    id: 'google/veo-3.1',
    label: 'Veo 3.1',
    description: 'Google — Máxima qualidade. 1080p, áudio nativo, cenas estendidas. $0.40/s.',
    category: 'qualidade',
    family: 'video',
    type: 'video',
  },
];