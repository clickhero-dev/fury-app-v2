import { pathToFileURL } from 'node:url';
import { checkReadiness, evaluateReadiness } from './qa-readiness.mjs';

export async function runWhenReady(check, mutate) {
  const result = await check();
  if (!result.ok) throw new Error(`PRÉ-VOO QA BLOQUEADO (${result.reason}). Consulte docs/operations/qa-quota-readiness.md.`);
  return mutate();
}

export async function runAlert({ apiURL, email, password, config, fetchImpl = fetch, timeoutMs = 15_000 }) {
  if (evaluateReadiness(config, null).reason === 'configuration' || !apiURL || !email || !password) return { ok: false, reason: 'configuration' };
  try {
    const base = apiURL.replace(/\/$/, '');
    const login = await fetchImpl(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(timeoutMs) });
    if ([401, 403].includes(login.status)) return { ok: false, reason: 'permission' };
    if (!login.ok) return { ok: false, reason: 'unavailable' };
    const token = (await login.json())?.data?.token;
    if (typeof token !== 'string' || !token) return { ok: false, reason: 'unknown' };
    return checkReadiness(config, async () => {
      const response = await fetchImpl(`${base}/billing/subscription`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(timeoutMs) });
      return { status: () => response.status, ok: () => response.ok, json: () => response.json() };
    });
  } catch (error) {
    return { ok: false, reason: /timeout/i.test(String(error?.name)) || /timeout/i.test(String(error?.message)) ? 'timeout' : 'unavailable' };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runAlert({ apiURL: process.env.QA_API_URL, email: process.env.QA_EMAIL, password: process.env.QA_PASSWORD, config: { margin: process.env.QA_QUOTA_MARGIN, owner: process.env.QA_QUOTA_OWNER } });
  if (result.ok) console.log('Cota e elegibilidade QA confirmadas na leitura.');
  else {
    console.error(`::error::Aviso de cota QA: ${result.reason}. Responsável configurado deve consultar docs/operations/qa-quota-readiness.md e verificar novamente antes da jornada.`);
    process.exitCode = 1;
  }
}
