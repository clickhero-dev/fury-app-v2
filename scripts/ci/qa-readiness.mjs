// O cenário realiza uma geração. A margem é uma decisão operacional externa.
export function evaluateReadiness(config, sub, now = Date.now()) {
  if (!/^\d+$/.test(config.margin ?? '') || !Number.isSafeInteger(Number(config.margin)) || !config.owner?.trim()) return { ok: false, reason: 'configuration' };
  if (!sub || !sub.plan || !Number.isSafeInteger(sub.creativesRemaining) || sub.creativesRemaining < 0) return { ok: false, reason: 'unknown' };
  if (!['active', 'trial'].includes(sub.status)) return { ok: false, reason: 'ineligible' };
  const end = sub.status === 'trial' ? sub.trialEndsAt : sub.currentPeriodEnd;
  if (!end || !Number.isFinite(Date.parse(end))) return { ok: false, reason: 'unknown' };
  if (Date.parse(end) <= now) return { ok: false, reason: 'ineligible' };
  const required = 1 + Number(config.margin);
  if (!Number.isSafeInteger(required)) return { ok: false, reason: 'configuration' };
  if (sub.creativesRemaining < required) return { ok: false, reason: 'quota_insufficient' };
  return { ok: true, reason: 'ready' };
}

export async function checkReadiness(config, request) {
  if (evaluateReadiness(config, null).reason === 'configuration') return { ok: false, reason: 'configuration' };
  try {
    const response = await request();
    if ([401, 403].includes(response.status())) return { ok: false, reason: 'permission' };
    if (!response.ok()) return { ok: false, reason: 'unavailable' };
    const body = await response.json();
    if (body?.success !== true) return { ok: false, reason: 'unknown' };
    return evaluateReadiness(config, body.data);
  } catch (error) {
    return { ok: false, reason: /timeout/i.test(String(error?.name)) || /timeout/i.test(String(error?.message)) ? 'timeout' : 'unavailable' };
  }
}

export async function runWithReadiness(config, request, journey) {
  const result = await checkReadiness(config, request);
  if (!result.ok) {
    throw new Error(`PRÉ-VOO QA BLOQUEADO (${result.reason}). Consulte docs/operations/qa-quota-readiness.md para responsável, reposição e verificação.`);
  }
  return journey();
}
