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
 * - `description`: característica real do modelo (checada em
 *   openrouter.ai/<id>), 1-4 palavras — sem preço, sem "barato/caro".
 *   Sem palavra-chave repetida entre modelos do mesmo `type` (a UI só
 *   mostra a descrição, sem o nome — termo repetido confunde a escolha).
 */

export interface StudioModel {
  id: string;
  label: string;
  /** Característica curta e real do modelo (1-4 palavras) — não é rótulo de preço. */
  description: string;
  /** Imagem: 'flux-2' (família FLUX 2) ou 'outras'. Vídeo: 'video'. */
  family: 'flux-2' | 'outras' | 'video';
  type: 'image' | 'video';
}

export const IMAGE_MODELS: StudioModel[] = [
  // ─── Família FLUX 2 (Black Forest Labs) ───────────────────────────
  {
    id: 'black-forest-labs/flux.2-klein-4b',
    label: 'FLUX.2 Klein 4B',
    description: 'Mais rápido',
    family: 'flux-2',
    type: 'image',
  },
  {
    id: 'black-forest-labs/flux.2-max',
    label: 'FLUX.2 Max',
    // ponytail: mais caro da família — descrição mais genérica de propósito
    description: 'Qualidade',
    family: 'flux-2',
    type: 'image',
  },
  {
    id: 'black-forest-labs/flux.2-pro',
    label: 'FLUX.2 Pro',
    description: 'Alta fidelidade',
    family: 'flux-2',
    type: 'image',
  },
  // ─── Outras famílias (4 modelos, 4 provedores distintos) ──────────
  {
    // Slug real no OpenRouter usa hífen na versão ("5-0-pro"), não ponto
    // — https://openrouter.ai/bytedance-seed/seedream-5-0-pro
    id: 'bytedance-seed/seedream-5-0-pro',
    label: 'Seedream 5.0 Pro',
    description: 'Realista',
    family: 'outras',
    type: 'image',
  },
  {
    id: 'x-ai/grok-imagine-image-2.0',
    label: 'Grok Imagine 2.0',
    description: 'Estilo fotográfico',
    family: 'outras',
    type: 'image',
  },
  {
    id: 'qwen/qwen-image-3-pro',
    label: 'Qwen Image 3 Pro',
    description: 'Detalhes e texto',
    family: 'outras',
    type: 'image',
  },
  {
    id: 'google/gemini-3.1-flash-image',
    label: 'Gemini 3.1 Flash Image',
    description: 'Mais nítido',
    family: 'outras',
    type: 'image',
  },
];

export const VIDEO_MODELS: StudioModel[] = [
  {
    id: 'google/veo-3.1-lite',
    label: 'Veo 3.1 Lite',
    description: 'Ágil e versátil',
    family: 'video',
    type: 'video',
  },
  {
    id: 'kwaivgi/kling-video-o1',
    label: 'Kling Video O1',
    description: 'Estilo cinematográfico',
    family: 'video',
    type: 'video',
  },
  {
    id: 'google/veo-3.1',
    label: 'Veo 3.1',
    // ponytail: mais caro dos vídeos — descrição mais genérica de propósito
    description: 'Qualidade',
    family: 'video',
    type: 'video',
  },
];