const TECH_TERMS_RE =
  /software|aplicativo|app|c[óo]digo|programa[çc][aã]o|programa|digital|plataforma|site|sites|computador|ícone|ícones|interface|dashboard|tela|telas|layout de app/i;

const TECH_NICHE_RE =
  /tech|software|sistema|sistemas|aplicativo|aplicativos|digital|inform[aá]tica|sites|computador|desenvolvimento/i;

export type BusinessContext = {
  niche?: string | null;
  mainProduct?: string | null;
};

/**
 * Guardrail pré-geração de imagem: quando o nicho do negócio NÃO é tecnologia,
 * remove do prompt de imagem qualquer menção a software/app/digital (que gera
 * imagens fora de contexto, ex.: "pão digital" para uma padaria) e garante que
 * o produto/serviço real do cliente esteja descrito no prompt.
 */
export function sanitizeImagePromptForBusiness(prompt: string, ctx: BusinessContext): string {
  const isTechNiche = ctx.niche ? TECH_NICHE_RE.test(ctx.niche) : false;
  let out = prompt;

  if (!isTechNiche && TECH_TERMS_RE.test(out)) {
    out =
      out
        .split('\n')
        .filter((line) => !TECH_TERMS_RE.test(line))
        .join('\n')
        .trim();
  }

  const product = ctx.mainProduct?.trim();
  if (!isTechNiche && product && out.length > 0) {
    const firstWord = product.split(/\s+/)[0]?.toLowerCase() ?? '';
    if (firstWord.length > 3 && !out.toLowerCase().includes(firstWord)) {
      out = `${out}. A imagem deve mostrar: ${product}.`;
    }
  }

  return out || prompt;
}