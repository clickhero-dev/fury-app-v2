import { getStoredPlatformRole } from '@/lib/platform-role';

/** Só escolhe o destino; o shell e o servidor continuam responsáveis pelo acesso. */
export function initialDestination(): '/inicio' | '/admin/dashboard' {
  return getStoredPlatformRole() === 'super_admin' ? '/admin/dashboard' : '/inicio';
}

const storageKey = 'ady-login-destination';
// Rotas do produto e admin; autenticação, callbacks e rotas públicas não são destinos de retorno.
const internalRoute = /^\/(inicio|dashboard|campanhas|criar-campanha|leads|automacao|estudio|estudio-criativo|chat|planejador|calendario|configuracoes|planos|assinatura|assinatura-vencida|onboarding\/(metas|selecionar-conta)|admin\/(dashboard|users|tenants|campanhas|planos|parceiros|clientes|integracoes|tickets|healthchecks|faqs|avisos))(?:\/|\?|#|$)/;
function isInternalDestination(value: unknown): value is string {
  return typeof value === 'string' && !/[\\\p{Cc}]/u.test(value) && internalRoute.test(value);
}
export function rememberLoginDestination(destination: string) {
  try {
    if (isInternalDestination(destination)) sessionStorage.setItem(storageKey, destination);
    else sessionStorage.removeItem(storageKey);
  } catch { /* O login continua disponível quando o armazenamento da aba está bloqueado. */ }
}
export function consumeLoginDestination(): string {
  try {
    const destination = sessionStorage.getItem(storageKey);
    sessionStorage.removeItem(storageKey);
    if (isInternalDestination(destination)) return destination;
  } catch { /* Usar o destino padrão da sessão. */ }
  return initialDestination();
}
