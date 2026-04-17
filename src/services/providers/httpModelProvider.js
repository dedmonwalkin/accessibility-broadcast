import { mockModelProvider } from './mockModelProvider.js';
import { validateOutboundBaseUrl } from '../../utils/security.js';
import { runtimeConfig } from '../../config/runtime.js';

const DEFAULT_TIMEOUT_MS = Number(process.env.MODEL_HTTP_TIMEOUT_MS || 4000);

function withTimeout(signal, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    if (signal.aborted) controller.abort();
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer)
  };
}

async function postJson({ endpoint, payload, timeoutMs, headers = {}, signal }) {
  const timeout = withTimeout(signal, timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify(payload),
      signal: timeout.signal,
      // Never auto-follow redirects: credentials in `Authorization` must not
      // be silently re-sent to a different origin.
      redirect: 'manual'
    });

    if (response.status >= 300 && response.status < 400) {
      throw new Error(`HTTP model provider redirect refused: ${response.status}`);
    }

    if (!response.ok) {
      throw new Error(`HTTP model provider failed: ${response.status}`);
    }

    return response.json();
  } finally {
    timeout.clear();
  }
}

function endpoint(baseUrl, path) {
  return `${String(baseUrl || '').replace(/\/$/, '')}${path}`;
}

export function createHttpModelProvider(config = {}) {
  const rt = runtimeConfig();
  const rawBaseUrl = config.base_url || process.env.MODEL_HTTP_BASE_URL;
  const apiKey = config.api_key || process.env.MODEL_HTTP_API_KEY;
  const timeoutMs = Number(config.timeout_ms || DEFAULT_TIMEOUT_MS);

  if (!rawBaseUrl) {
    return {
      ...mockModelProvider,
      name: 'mock(http_missing_base_url)'
    };
  }

  let baseUrl;
  try {
    baseUrl = validateOutboundBaseUrl(rawBaseUrl, {
      allowInsecure: rt.outboundAllowInsecure,
      allowPrivate: rt.outboundAllowPrivate,
      allowHosts: rt.modelProviderAllowedHosts
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[accessibility-broadcast] MODEL_HTTP_BASE_URL rejected: ${err.message}; falling back to mock provider.`);
    return {
      ...mockModelProvider,
      name: `mock(http_base_url_rejected:${err.message})`
    };
  }

  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

  return {
    name: 'http',

    async inferPerception(input) {
      try {
        return await postJson({
          endpoint: endpoint(baseUrl, '/v1/models/perception'),
          payload: input,
          timeoutMs,
          headers
        });
      } catch {
        return mockModelProvider.inferPerception(input);
      }
    },

    async inferAccessibility(input) {
      try {
        return await postJson({
          endpoint: endpoint(baseUrl, '/v1/models/accessibility'),
          payload: input,
          timeoutMs,
          headers
        });
      } catch {
        return mockModelProvider.inferAccessibility(input);
      }
    },

    async inferSignScript(input) {
      try {
        return await postJson({
          endpoint: endpoint(baseUrl, '/v1/models/sign-script'),
          payload: input,
          timeoutMs,
          headers
        });
      } catch {
        return mockModelProvider.inferSignScript(input);
      }
    },

    async transcribe(input) {
      try {
        return await postJson({
          endpoint: endpoint(baseUrl, '/v1/models/transcribe'),
          payload: input,
          timeoutMs,
          headers
        });
      } catch {
        return mockModelProvider.transcribe(input);
      }
    }
  };
}
