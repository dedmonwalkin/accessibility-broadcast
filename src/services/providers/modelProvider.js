import { mockModelProvider } from './mockModelProvider.js';
import { createHttpModelProvider } from './httpModelProvider.js';
import { clientError, upstreamError } from '../../utils/errors.js';

export const SUPPORTED_MODEL_PROVIDERS = ['mock', 'http'];

// Resolves the provider name for a stream. A name sent in a request must be
// one this server supports; otherwise the server's own MODEL_PROVIDER is used.
// An unrecognised name is an error. It is never treated as "mock".
export function resolveModelProviderName(requested) {
  if (requested !== undefined && requested !== null && requested !== '') {
    const name = String(requested).toLowerCase();
    if (!SUPPORTED_MODEL_PROVIDERS.includes(name)) {
      throw clientError('unsupported_model_provider', `Unsupported model provider "${name}"`, {
        supported: SUPPORTED_MODEL_PROVIDERS
      });
    }
    return name;
  }
  const configured = String(process.env.MODEL_PROVIDER || 'mock').toLowerCase();
  if (!SUPPORTED_MODEL_PROVIDERS.includes(configured)) {
    throw upstreamError(
      'model_provider_misconfigured',
      `MODEL_PROVIDER is "${configured}", which is not a supported provider`,
      503,
      { reason: 'unknown_provider' }
    );
  }
  return configured;
}

export function createModelProvider(config = {}) {
  const provider = String(config.provider || process.env.MODEL_PROVIDER || 'mock').toLowerCase();

  if (provider === 'http') return createHttpModelProvider(config);
  if (provider === 'mock') return mockModelProvider;

  throw upstreamError(
    'model_provider_misconfigured',
    `Model provider "${provider}" is not a supported provider`,
    503,
    { reason: 'unknown_provider' }
  );
}
