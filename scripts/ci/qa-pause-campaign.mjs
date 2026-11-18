import { pathToFileURL } from 'node:url';

/** Remedia uma execução QA interrompida; não cria, publica, exclui ou amplia orçamento. */
export async function pauseQaCampaign({ apiURL, email, password, label, fetchImpl = fetch }) {
  if (!apiURL || !email || !password || !/^Anúncio QA \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(label ?? '')) {
    throw new Error('Informe credenciais QA e o nome exato da execução de teste.');
  }
  const base = apiURL.replace(/\/$/, '');
  async function request(path, options = {}) {
    const response = await fetchImpl(base + path, { ...options, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`API QA indisponível ou sem permissão (${response.status}).`);
    return response.json();
  }
  const session = await request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const token = session?.data?.token;
  if (typeof token !== 'string' || !token) throw new Error('Sessão QA não confirmada.');
  const headers = { Authorization: `Bearer ${token}` };
  const campaigns = (await request('/campaigns?limit=100', { headers })).data;
  if (!Array.isArray(campaigns)) throw new Error('Lista de campanhas não confirmada.');
  const matches = campaigns.filter(campaign => campaign.name === label);
  if (matches.length !== 1 || typeof matches[0].id !== 'string' || !matches[0].id) throw new Error('Não há correspondência única e exata para a execução QA.');
  const campaign = matches[0];
  if (['paused', 'archived'].includes(campaign.status?.toLowerCase())) return { paused: false };
  if (campaign.status?.toLowerCase() !== 'active') throw new Error('Estado da campanha não confirmado.');
  await request(`/campaigns/${encodeURIComponent(campaign.id)}/pause`, { method: 'PATCH', headers });
  const verified = (await request('/campaigns?limit=100', { headers })).data;
  if (!Array.isArray(verified) || !verified.some(item => item.id === campaign.id && item.name === label && item.status?.toLowerCase() === 'paused')) throw new Error('Pausa ainda não confirmada pela API.');
  return { paused: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await pauseQaCampaign({ apiURL: process.env.QA_API_URL, email: process.env.QA_EMAIL, password: process.env.QA_PASSWORD, label: process.env.QA_PAUSE_CAMPAIGN });
    console.log(result.paused ? 'Pausa da campanha QA confirmada.' : 'Campanha QA já está pausada ou arquivada.');
  } catch {
    console.error('Não foi possível confirmar a pausa da campanha QA. Nenhuma nova campanha foi criada.');
    process.exitCode = 1;
  }
}
