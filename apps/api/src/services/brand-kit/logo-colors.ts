import sharp from 'sharp';

export interface LogoColors { primaryColor: string; secondaryColor: string | null }

/**
 * Obtém cores dominantes de uma imagem raster. Transparência e pixels quase
 * brancos são ignorados; uma segunda cor só é retornada quando há evidência.
 */
export async function extractLogoColors(bytes: Buffer): Promise<LogoColors | null> {
  try {
    const { data, info } = await sharp(bytes, { limitInputPixels: 16_000_000, failOn: 'warning' })
      .resize(64, 64, { fit: 'inside', withoutEnlargement: true })
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const buckets = new Map<string, { count: number; red: number; green: number; blue: number }>();
    for (let offset = 0; offset < data.length; offset += info.channels) {
      const [red, green, blue, alpha] = [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
      if (alpha < 128 || (red > 245 && green > 245 && blue > 245)) continue;
      const key = `${red >> 4}:${green >> 4}:${blue >> 4}`;
      const bucket = buckets.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 };
      bucket.count++; bucket.red += red; bucket.green += green; bucket.blue += blue; buckets.set(key, bucket);
    }
    const ordered = [...buckets.values()].sort((a, b) => b.count - a.count);
    if (!ordered.length) return null;
    const hex = (value: { count: number; red: number; green: number; blue: number }) =>
      `#${[value.red, value.green, value.blue].map(channel => Math.round(channel / value.count).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
    const primary = hex(ordered[0]);
    const secondary = ordered.find(candidate => {
      const color = hex(candidate);
      const distance = Math.sqrt([0, 1, 2].reduce((sum, index) => sum + (parseInt(color.slice(1 + index * 2, 3 + index * 2), 16) - parseInt(primary.slice(1 + index * 2, 3 + index * 2), 16)) ** 2, 0));
      return distance >= 80;
    });
    return { primaryColor: primary, secondaryColor: secondary ? hex(secondary) : null };
  } catch {
    return null;
  }
}
