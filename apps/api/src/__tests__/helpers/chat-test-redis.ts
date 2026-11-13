/** Fail closed before any test can access a shared Redis database. */
export function isSafeChatTestRedis(testUrl: string | undefined, runtimeUrl: string | undefined): boolean {
  if (!testUrl || !runtimeUrl || testUrl !== runtimeUrl) return false;
  try {
    const url = new URL(testUrl);
    return url.protocol === 'redis:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname) && url.pathname === '/15' && !url.search && !url.hash;
  } catch { return false; }
}
