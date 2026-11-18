/** Test-only boundary: never connect the cross-process fixture to real services. */
export function isolatedCrossServiceConfig(env: NodeJS.ProcessEnv) {
  const databaseUrl = new URL(env.CHAT_MEDIA_TEST_DATABASE_URL ?? '');
  const serviceUrl = new URL(env.CHAT_SERVICE_URL ?? '');
  const schema = env.CHAT_CROSS_SERVICE_SCHEMA ?? '';
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol) ||
      databaseUrl.hostname !== '127.0.0.1' ||
      !/^\/[a-zA-Z0-9_]+_isolated$/.test(databaseUrl.pathname) ||
      databaseUrl.search || databaseUrl.hash ||
      !/^chat_media_[a-f0-9]{32}$/.test(schema) ||
      serviceUrl.protocol !== 'http:' || serviceUrl.hostname !== '127.0.0.1' ||
      !serviceUrl.port || Number(serviceUrl.port) < 1 ||
      serviceUrl.username || serviceUrl.password || serviceUrl.pathname !== '/' ||
      serviceUrl.search || serviceUrl.hash ||
      !env.CHAT_DELEGATION_SECRET || env.CHAT_DELEGATION_SECRET.length < 32)
    throw new Error('invalid_configuration');
  return {databaseUrl:databaseUrl.toString(),baseUrl:serviceUrl.toString(),schema,secret:env.CHAT_DELEGATION_SECRET};
}
