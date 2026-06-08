export interface CreativeData {
  headline: string;
  primary_text: string;
  cta: string;
  subheadline?: string;
  layout: 'product_hero' | 'text_focus' | 'offer_highlight' | 'testimonial_style';
  color_scheme: 'brand_orange' | 'dark_premium' | 'clean_white' | 'bold_contrast';
  productImageUrl?: string;
  businessName: string;
}

type ColorScheme = {
  bg: string;
  text: string;
  accent: string;
  ctaBg: string;
  ctaText: string;
  secondary: string;
};

const COLOR_SCHEMES: Record<CreativeData['color_scheme'], ColorScheme> = {
  brand_orange: {
    bg: '#0F0F0F',
    text: '#FFFFFF',
    accent: '#EA580C',
    ctaBg: '#EA580C',
    ctaText: '#FFFFFF',
    secondary: '#F97316',
  },
  dark_premium: {
    bg: '#0A0A0A',
    text: '#FFFFFF',
    accent: '#C9A84C',
    ctaBg: '#C9A84C',
    ctaText: '#0A0A0A',
    secondary: '#E2C97E',
  },
  clean_white: {
    bg: '#FFFFFF',
    text: '#111827',
    accent: '#2563EB',
    ctaBg: '#2563EB',
    ctaText: '#FFFFFF',
    secondary: '#3B82F6',
  },
  bold_contrast: {
    bg: '#1A1A2E',
    text: '#FFFFFF',
    accent: '#16A34A',
    ctaBg: '#16A34A',
    ctaText: '#FFFFFF',
    secondary: '#22C55E',
  },
};

function fontImport(): string {
  return `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&family=Oswald:wght@400;600;700&display=swap');`;
}

function baseStyles(colors: ColorScheme): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 1080px; height: 1080px; overflow: hidden;
      background: ${colors.bg};
      color: ${colors.text};
      font-family: 'Inter', sans-serif;
    }
    .container { width: 1080px; height: 1080px; position: relative; overflow: hidden; }
    .headline { font-family: 'Oswald', sans-serif; font-weight: 700; color: ${colors.text}; }
    .accent { color: ${colors.accent}; }
    .cta-btn {
      display: inline-block;
      background: ${colors.ctaBg};
      color: ${colors.ctaText};
      font-family: 'Inter', sans-serif;
      font-weight: 700;
      font-size: 28px;
      padding: 22px 60px;
      border-radius: 8px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .business-tag {
      font-size: 18px;
      font-weight: 600;
      color: ${colors.accent};
      text-transform: uppercase;
      letter-spacing: 2px;
    }
  `;
}

function productHeroLayout(data: CreativeData, colors: ColorScheme): string {
  const imgSection = data.productImageUrl
    ? `<div class="img-area" style="width:100%;height:540px;overflow:hidden;">
        <img src="${data.productImageUrl}" style="width:100%;height:100%;object-fit:cover;" alt="produto" />
       </div>`
    : `<div class="img-area" style="width:100%;height:540px;background:linear-gradient(135deg,${colors.accent}33,${colors.secondary}22);display:flex;align-items:center;justify-content:center;">
        <div style="width:200px;height:200px;border-radius:50%;background:${colors.accent}22;border:3px solid ${colors.accent};"></div>
       </div>`;

  return `
    ${imgSection}
    <div style="padding:40px 60px 50px;display:flex;flex-direction:column;gap:16px;height:540px;justify-content:space-between;">
      <div>
        <p class="business-tag">${data.businessName}</p>
        <h1 class="headline" style="font-size:64px;line-height:1.1;margin-top:12px;">${data.headline}</h1>
        <p style="font-size:26px;line-height:1.4;margin-top:16px;color:${colors.text}cc;">${data.primary_text}</p>
        ${data.subheadline ? `<p style="font-size:22px;margin-top:12px;color:${colors.accent};">${data.subheadline}</p>` : ''}
      </div>
      <div><span class="cta-btn">${data.cta}</span></div>
    </div>`;
}

function textFocusLayout(data: CreativeData, colors: ColorScheme): string {
  return `
    <div style="width:100%;height:100%;background:linear-gradient(160deg,${colors.bg} 0%,${colors.accent}22 50%,${colors.bg} 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 100px;text-align:center;gap:32px;">
      <p class="business-tag">${data.businessName}</p>
      <div style="width:80px;height:4px;background:${colors.accent};border-radius:2px;"></div>
      <h1 class="headline" style="font-size:80px;line-height:1.05;">${data.headline}</h1>
      ${data.subheadline ? `<p style="font-size:32px;color:${colors.accent};font-weight:600;">${data.subheadline}</p>` : ''}
      <p style="font-size:28px;line-height:1.5;color:${colors.text}cc;max-width:800px;">${data.primary_text}</p>
      <div style="margin-top:16px;"><span class="cta-btn">${data.cta}</span></div>
    </div>`;
}

function offerHighlightLayout(data: CreativeData, colors: ColorScheme): string {
  return `
    <div style="width:100%;height:100%;display:flex;flex-direction:column;padding:0;">
      <div style="background:${colors.accent};padding:24px 60px;display:flex;justify-content:space-between;align-items:center;">
        <p style="font-size:22px;font-weight:700;color:${colors.ctaText};text-transform:uppercase;letter-spacing:2px;">${data.businessName}</p>
        <div style="background:${colors.ctaText};color:${colors.accent};padding:8px 24px;border-radius:100px;font-weight:700;font-size:18px;">OFERTA ESPECIAL</div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px;text-align:center;gap:28px;">
        <h1 class="headline" style="font-size:76px;line-height:1.05;">${data.headline}</h1>
        <p style="font-size:28px;color:${colors.accent};font-weight:600;">${data.subheadline || data.primary_text}</p>
        <div style="border:3px solid ${colors.accent};border-radius:16px;padding:32px 80px;margin:8px 0;">
          <p style="font-size:26px;line-height:1.5;color:${colors.text}cc;">${data.primary_text}</p>
        </div>
        <span class="cta-btn">${data.cta}</span>
      </div>
    </div>`;
}

function testimonialStyleLayout(data: CreativeData, colors: ColorScheme): string {
  return `
    <div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 100px;text-align:center;gap:40px;">
      <div style="font-size:120px;color:${colors.accent};font-family:'Oswald',sans-serif;line-height:0.6;margin-bottom:8px;">"</div>
      <h1 class="headline" style="font-size:68px;line-height:1.1;">${data.headline}</h1>
      <p style="font-size:30px;line-height:1.5;color:${colors.text}cc;font-style:italic;max-width:860px;">${data.primary_text}</p>
      <div style="width:60px;height:3px;background:${colors.accent};"></div>
      <div style="display:flex;flex-direction:column;gap:8px;align-items:center;">
        <p class="business-tag">${data.businessName}</p>
        ${data.subheadline ? `<p style="font-size:22px;color:${colors.text}99;">${data.subheadline}</p>` : ''}
      </div>
      <span class="cta-btn" style="margin-top:8px;">${data.cta}</span>
    </div>`;
}

export function generateCreativeHTML(data: CreativeData): string {
  const colors = COLOR_SCHEMES[data.color_scheme];

  const layoutMap: Record<CreativeData['layout'], string> = {
    product_hero: productHeroLayout(data, colors),
    text_focus: textFocusLayout(data, colors),
    offer_highlight: offerHighlightLayout(data, colors),
    testimonial_style: testimonialStyleLayout(data, colors),
  };

  const body = layoutMap[data.layout];

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=1080">
<style>
${fontImport()}
${baseStyles(colors)}
</style>
</head>
<body>
<div class="container">
${body}
</div>
</body>
</html>`;
}
