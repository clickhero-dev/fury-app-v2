// Layout Selector Agent — escolhe o arquétipo visual mais adequado ao briefing.
//
// STUB (Prompt 3 implementa a lógica real). Por enquanto retorna 'offer_burst'
// como default para todos os briefings. A assinatura já é a final, então o
// handler de geração chama selectLayout() de verdade desde já, sem // TODO
// espalhado e com tipos estritos.

import type { CreativeLayout } from '@fury/shared';

export interface LayoutSelectorInput {
  tenantId: string;
  briefing: {
    product: string;
    promise: string;
    offer?: string;
    audience: string;
    objective?: 'awareness' | 'consideration' | 'conversion' | 'content';
  };
  assets: {
    hasProductImage: boolean;
    productImageUrl?: string;
    hasLogo: boolean;
  };
  brand: {
    primary_color: string;
    accent_color?: string;
    dark_color?: string;
    brand_voice?: string;
  };
}

export interface LayoutSelectorOutput {
  layout: CreativeLayout;
  confidence: number;
  justification: string;
  suggested_fields: Partial<{
    headline: string;
    subheadline: string;
    qualifier: string;
    offer_text: string;
    subtitle: string;
    subtitle_highlight: string;
    benefits: string[];
    cta: string;
    tone: 'institutional' | 'energetic';
  }>;
}

// STUB: Prompt 3 substitui esta implementação por chamada real ao DeepSeek.
export async function selectLayout(
  input: LayoutSelectorInput,
): Promise<LayoutSelectorOutput> {
  return {
    layout: 'offer_burst',
    confidence: 0,
    justification: 'Stub temporário — Layout Selector real implementado no Prompt 3.',
    suggested_fields: {
      headline: input.briefing.promise,
      cta: 'Saiba Mais',
    },
  };
}
