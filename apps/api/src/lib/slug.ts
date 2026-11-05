// Slugificação de nomes de organizações para URLs públicas (LP /l/<slug>).
// Mesma regra de base do signup (auth.service / social-auth.service), com
// transliteração de acentos (NFD) — "Petróleo" → "petroleo", "Negócio" → "negocio".
// NOTA: o signup ainda usa a versão local sem NFD (slugs legados podem ser
// lossy, ex. "petrleo"); o resolveTenantId cobre a divergência via fallback.
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove marcas de acentuação combinadas
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}