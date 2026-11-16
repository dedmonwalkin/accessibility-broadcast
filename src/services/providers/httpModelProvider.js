import { validateOutboundBaseUrl } from '../../utils/security.js';
import { runtimeConfig } from '../../config/runtime.js';
import { clientError, upstreamError } from '../../utils/errors.js';

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

    // Awaited here so the timeout also covers reading the body.
    return await response.json();
  } finally {
    timeout.clear();
  }
}

function endpoint(baseUrl, path) {
  return `${String(baseUrl || '').replace(/\/$/, '')}${path}`;
}

// This provider never substitutes mock output. If the gateway is missing,
// misconfigured or failing, the caller gets a typed error and no caption,
// audio description or sign output is produced for that request.
export function createHttpModelProvider(config = {}) {
  const rt = runtimeConfig();
  const rawBaseUrl = config.base_url || process.env.MODEL_HTTP_BASE_URL;
  const apiKey = config.api_key || process.env.MODEL_HTTP_API_KEY;
  const timeoutMs = Number(config.timeout_ms || DEFAULT_TIMEOUT_MS);

  if (!rawBaseUrl) {
    throw upstreamError(
      'model_provider_misconfigured',
      'MODEL_PROVIDER is http but no model gateway base URL is configured (MODEL_HTTP_BASE_URL)',
      503,
      { reason: 'missing_base_url' }
    );
  }

  let baseUrl;
  try {
    baseUrl = validateOutboundBaseUrl(rawBaseUrl, {
      allowInsecure: rt.outboundAllowInsecure,
      allowPrivate: rt.outboundAllowPrivate,
      allowHosts: rt.modelProviderAllowedHosts
    });
  } catch (err) {
    // A base URL sent with the request is the caller's mistake; one from the
    // server's own environment is a deployment mistake.
    if (config.base_url) {
      throw clientError('model_base_url_rejected', `model_base_url rejected: ${err.message}`);
    }
    throw upstreamError(
      'model_provider_misconfigured',
      `MODEL_HTTP_BASE_URL rejected: ${err.message}`,
      503,
      { reason: 'base_url_rejected' }
    );
  }

  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

  async function call(operation, path, input) {
    let result;
    try {
      result = await postJson({ endpoint: endpoint(baseUrl, path), payload: input, timeoutMs, headers });
    } catch (err) {
      throw upstreamError(
        'model_provider_unavailable',
        `Model gateway ${operation} request failed: ${err.message}`,
        502,
        { operation }
      );
    }
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw upstreamError(
        'model_provider_unavailable',
        `Model gateway ${operation} returned an unusable response`,
        502,
        { operation }
      );
    }
    return result;
  }

  return {
    name: 'http',
    inferPerception: (input) => call('perception', '/v1/models/perception', input),
    inferAccessibility: (input) => call('accessibility', '/v1/models/accessibility', input),
    inferSignScript: (input) => call('sign_script', '/v1/models/sign-script', input),
    transcribe: (input) => call('transcribe', '/v1/models/transcribe', input)
  };
}
