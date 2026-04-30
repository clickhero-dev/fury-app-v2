export function centavosToReais(centavos: number): number {
  return roundToDecimals(centavos / 100, 2);
}

export function roundToDecimals(value: number, decimals: number): number {
  return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

export function calculateCTR(clicks: number, impressions: number): number {
  if (impressions === 0) return 0;
  return roundToDecimals((clicks / impressions) * 100, 2);
}

export function calculateCPM(spendInCentavos: number, impressions: number): number {
  if (impressions === 0) return 0;
  const spendInReais = centavosToReais(spendInCentavos);
  return roundToDecimals((spendInReais / impressions) * 1000, 2);
}

export function calculateCPA(spendInReais: number, conversions: number): number {
  if (conversions === 0) return 0;
  return roundToDecimals(spendInReais / conversions, 2);
}

export function aggregateDailyMetrics(daily: any[]): {
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  avgRoas: number;
} {
  const totalSpend = daily.reduce((sum, d) => sum + d.spend, 0);
  const totalImpressions = daily.reduce((sum, d) => sum + d.impressions, 0);
  const totalClicks = daily.reduce((sum, d) => sum + d.clicks, 0);
  const totalConversions = daily.reduce((sum, d) => sum + d.conversions, 0);
  const avgRoas = daily.length > 0
    ? roundToDecimals(daily.reduce((sum, d) => sum + d.roas, 0) / daily.length, 2)
    : 0;

  return {
    totalSpend,
    totalImpressions,
    totalClicks,
    totalConversions,
    avgRoas,
  };
}
