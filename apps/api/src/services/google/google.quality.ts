import type { GbpLocation } from '../../lib/google-api.js';

/** Avaliação de qualidade/recência do perfil GBP (pré-envio). */
export type GoogleQualityGrade = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';

export interface GoogleQualityReport {
  score: number; // 0-100
  grade: GoogleQualityGrade;
  complete: boolean; // todos os obrigatórios presentes
  verified: boolean; // verification.state === 'VERIFIED'
  outdated: boolean | null; // true >180d sem update; null sem timestamp
  lastUpdated: string | null; // metadata.updateTime (ISO) ou null
  missingFields: string[]; // obrigatórios: 'name' | 'address' | 'phone'
  recommendations: string[]; // recomendados: 'website' | 'category' | 'hours'
  warnings: string[]; // PT-BR, agrupados por problema
}

const QUALITY_OUTDATED_THRESHOLD_MS = 180 * 24 * 60 * 60 * 1000;

/**
 * Avalia completude e recência de um perfil do Google Meu Negócio (função pura).
 * Usada no pré-envio (lookup) e no endpoint de qualidade do perfil.
 */
export function assessGoogleProfileQuality(
  location: GbpLocation,
  now: Date = new Date(),
): GoogleQualityReport {
  const address = location.address ?? {};
  const hasStreet = Boolean(address.addressLines?.some((line) => line.trim()));
  const hasCity = Boolean(address.locality?.trim());
  const hasAddress = hasStreet || hasCity; // país/CEP sozinho NÃO satisfaz
  const hasPhone = Boolean(location.phoneNumbers?.primaryPhone?.trim());
  const hasName = Boolean(location.title?.trim());

  const missingFields: string[] = [];
  if (!hasName) missingFields.push('name');
  if (!hasAddress) missingFields.push('address');
  if (!hasPhone) missingFields.push('phone');

  const recommendations: string[] = [];
  if (!location.websiteUri?.trim()) recommendations.push('website');
  if (!location.categories?.length) recommendations.push('category');
  if (!location.openInfo?.periods?.length) recommendations.push('hours');

  let score = 100;
  score -= missingFields.length * 25; // -25 por obrigatório ausente
  score -= recommendations.length * 5; // -5 por recomendação ausente

  const verified = location.verification?.state === 'VERIFIED';
  if (!verified) score -= 10;

  const updateTime = location.metadata?.updateTime;
  const nowMs = now.getTime();
  let outdated: boolean | null = null;
  if (updateTime) {
    const updatedMs = new Date(updateTime).getTime();
    outdated = Number.isFinite(updatedMs) && nowMs - updatedMs > QUALITY_OUTDATED_THRESHOLD_MS;
    if (outdated) score -= 10; // penalidade única de recência
  }

  const scoreFloor = Math.max(0, Math.min(100, score));
  const grade: GoogleQualityGrade =
    scoreFloor >= 90 ? 'EXCELLENT' : scoreFloor >= 75 ? 'GOOD' : scoreFloor >= 50 ? 'FAIR' : 'POOR';

  const warnings: string[] = [];
  if (missingFields.includes('name')) warnings.push('Informe o nome do seu negócio.');
  if (missingFields.includes('phone')) warnings.push('Informe o telefone do seu negócio.');
  if (missingFields.includes('address'))
    warnings.push('Informe o endereço do seu negócio (rua e cidade).');
  if (outdated)
    warnings.push('Seu perfil está desatualizado. Atualize os dados para melhorar a visibilidade no Google.');
  if (missingFields.length === 0 && recommendations.length > 0)
    warnings.push('Complete o perfil com site, categoria e horário de funcionamento para melhorar sua visibilidade.');

  return {
    score: scoreFloor,
    grade,
    complete: missingFields.length === 0,
    verified,
    outdated,
    lastUpdated: updateTime ?? null,
    missingFields,
    recommendations,
    warnings,
  };
}