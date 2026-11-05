const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo';

/** Formata a última atualização para uma faixa compacta de status. */
export function formatLastSync(syncedAt: string | null | undefined): string | null {
  if (!syncedAt) return null;

  const date = new Date(syncedAt);
  if (!Number.isFinite(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: SAO_PAULO_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const valueFor = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const day = valueFor('day');
  const month = valueFor('month');
  const hour = valueFor('hour');
  const minute = valueFor('minute');

  return day && month && hour && minute ? `${day}/${month} às ${hour}:${minute}` : null;
}

/** Retorna o instante mais recente entre respostas de um mesmo estado de sincronização. */
export function getLatestSync(...timestamps: Array<string | null | undefined>): string | null {
  return timestamps.reduce<string | null>((latest, timestamp) => {
    if (!timestamp || !Number.isFinite(new Date(timestamp).getTime())) return latest;
    if (!latest || new Date(timestamp).getTime() > new Date(latest).getTime()) return timestamp;
    return latest;
  }, null);
}
