import { parseAllowList } from '../utils/security.js';

function parseIntEnv(raw, name, fallback) {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new Error(`config: ${name} must be a non-negative integer, got "${raw}"`);
  }
  return n;
}

function parseBoolEnv(raw, fallback) {
  if (raw === undefined || raw === '') return fallback;
  const v = String(raw).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(v)) return true;
  if (['false', '0', 'no', 'off'].includes(v)) return false;
  return fallback;
}

export function runtimeConfig() {
  const env = process.env;
  const nodeEnv = env.NODE_ENV || 'development';
  const isProd = nodeEnv === 'production';

  const apiKeys = parseAllowList(env.API_KEYS);
  const adminApiKeys = parseAllowList(env.ADMIN_API_KEYS);
  const authDisabled = parseBoolEnv(env.AUTH_DISABLED, false);

  if (isProd && apiKeys.length === 0 && adminApiKeys.length === 0 && !authDisabled) {
    throw new Error(
      'config: production start with no API keys configured. ' +
      'Set API_KEYS (and optionally ADMIN_API_KEYS), or explicitly set AUTH_DISABLED=true.'
    );
  }

  return {
    nodeEnv,
    isProd,
    port: parseIntEnv(env.PORT, 'PORT', 3000),
    databaseUrl: env.DATABASE_URL || '',
    enablePostgres: parseBoolEnv(env.ENABLE_POSTGRES, false),
    databaseSsl: String(env.DATABASE_SSL || (isProd ? 'require' : 'prefer')).toLowerCase(),
    snapshotIntervalMs: parseIntEnv(env.SNAPSHOT_INTERVAL_MS, 'SNAPSHOT_INTERVAL_MS', 5 * 60 * 1000),
    apiKeys,
    adminApiKeys,
    authDisabled,
    apiKeyPepper: env.API_KEY_PEPPER || '',
    trustedProxies: parseAllowList(env.TRUSTED_PROXIES),
    debugEndpointsEnabled: parseBoolEnv(env.DEBUG_ENDPOINTS, false),
    ssePublicStreams: parseBoolEnv(env.SSE_PUBLIC_STREAMS, false),
    rateLimitRpm: parseIntEnv(env.RATE_LIMIT_RPM, 'RATE_LIMIT_RPM', 60),
    maxJsonBodyBytes: parseIntEnv(env.MAX_JSON_BODY_BYTES, 'MAX_JSON_BODY_BYTES', 1024 * 1024),
    maxIngestBodyBytes: parseIntEnv(env.MAX_INGEST_BODY_BYTES, 'MAX_INGEST_BODY_BYTES', 16 * 1024 * 1024),
    translationProvider: env.TRANSLATION_PROVIDER || 'mock',
    translationHttpBaseUrl: env.TRANSLATION_HTTP_BASE_URL || '',
    translationApiKey: env.TRANSLATION_API_KEY || '',
    translationCacheTtlMs: parseIntEnv(env.TRANSLATION_CACHE_TTL_MS, 'TRANSLATION_CACHE_TTL_MS', 3600_000),
    translationCacheMaxSize: parseIntEnv(env.TRANSLATION_CACHE_MAX_SIZE, 'TRANSLATION_CACHE_MAX_SIZE', 10000),
    modelHttpTimeoutMs: parseIntEnv(env.MODEL_HTTP_TIMEOUT_MS, 'MODEL_HTTP_TIMEOUT_MS', 4000),
    modelProviderAllowedHosts: parseAllowList(env.MODEL_PROVIDER_ALLOWED_HOSTS),
    outboundAllowPrivate: parseBoolEnv(env.OUTBOUND_ALLOW_PRIVATE_HOSTS, !isProd),
    outboundAllowInsecure: parseBoolEnv(env.OUTBOUND_ALLOW_INSECURE, !isProd),
    lowConfidenceThreshold: Number(env.LOW_CONFIDENCE_THRESHOLD || 0.72),
    maxSseListeners: parseIntEnv(env.MAX_SSE_LISTENERS, 'MAX_SSE_LISTENERS', 200),
    sseIdleTimeoutMs: parseIntEnv(env.SSE_IDLE_TIMEOUT_MS, 'SSE_IDLE_TIMEOUT_MS', 300000)
  };
}
