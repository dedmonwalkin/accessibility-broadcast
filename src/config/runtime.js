export function runtimeConfig() {
  const env = process.env;
  return {
    nodeEnv: env.NODE_ENV || 'development',
    port: Number(env.PORT || 3000),
    databaseUrl: env.DATABASE_URL || '',
    enablePostgres: env.ENABLE_POSTGRES === 'true',
    snapshotIntervalMs: Number(env.SNAPSHOT_INTERVAL_MS || 5 * 60 * 1000)
  };
}
