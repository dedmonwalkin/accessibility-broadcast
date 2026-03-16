export function runtimeConfig() {
  const env = process.env;
  return {
    nodeEnv: env.NODE_ENV || 'development',
    port: Number(env.PORT || 3000),
    databaseUrl: env.DATABASE_URL || '',
    enablePostgres: env.ENABLE_POSTGRES === 'true',
    snapshotIntervalMs: Number(env.SNAPSHOT_INTERVAL_MS || 5 * 60 * 1000),
    apiKeys: env.API_KEYS ? env.API_KEYS.split(',').map(k => k.trim()).filter(Boolean) : [],
    rateLimitRpm: Number(env.RATE_LIMIT_RPM || 60),
    translationProvider: env.TRANSLATION_PROVIDER || 'mock',
    translationHttpBaseUrl: env.TRANSLATION_HTTP_BASE_URL || '',
    translationApiKey: env.TRANSLATION_API_KEY || ''
  };
}
