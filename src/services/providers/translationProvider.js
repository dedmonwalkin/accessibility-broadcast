import { runtimeConfig } from '../../config/runtime.js';
import { validateOutboundBaseUrl } from '../../utils/security.js';

const DEFAULT_TIMEOUT_MS = Number(process.env.TRANSLATION_HTTP_TIMEOUT_MS || 5000);

function safeBaseUrl(raw, rt) {
  if (!raw) return '';
  try {
    return validateOutboundBaseUrl(raw, {
      allowInsecure: rt.outboundAllowInsecure,
      allowPrivate: rt.outboundAllowPrivate,
      allowHosts: rt.modelProviderAllowedHosts
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[accessibility-broadcast] translation base URL rejected: ${err.message}; falling back to mock provider.`);
    return null;
  }
}

function withTimeout(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

function createBoundedCache() {
  const rt = runtimeConfig();
  const ttlMs = rt.translationCacheTtlMs;
  const maxSize = rt.translationCacheMaxSize;
  const entries = new Map();

  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (Date.now() - entry.ts > ttlMs) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      if (entries.size >= maxSize) {
        const oldest = entries.keys().next().value;
        entries.delete(oldest);
      }
      entries.set(key, { value, ts: Date.now() });
    },
    get size() { return entries.size; }
  };
}

const mockTranslationProvider = {
  name: 'mock',
  async translateCaption(text, targetLanguage) {
    if (targetLanguage === 'en' || targetLanguage === 'en-US') return { text, status: 'original' };
    return { text: `[${targetLanguage}] ${text}`, status: 'mock' };
  }
};

function createLibreTranslateProvider({ baseUrl, apiKey }) {
  const cache = createBoundedCache();
  const url = `${baseUrl.replace(/\/$/, '')}/translate`;

  return {
    name: 'libretranslate',
    async translateCaption(text, targetLanguage, sourceLanguage = 'en') {
      const target = targetLanguage.split('-')[0];
      const source = sourceLanguage.split('-')[0];
      if (target === source) return { text, status: 'original' };

      const cacheKey = `${target}:${text}`;
      const cached = cache.get(cacheKey);
      if (cached !== undefined) return cached;

      const t = withTimeout(DEFAULT_TIMEOUT_MS);
      try {
        const body = { q: text, source, target, format: 'text' };
        if (apiKey) body.api_key = apiKey;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: t.signal,
          redirect: 'manual'
        });
        if (!res.ok) throw new Error(`LibreTranslate error: ${res.status}`);
        const data = await res.json();
        if (typeof data.translatedText !== 'string' || !data.translatedText.trim()) throw new Error('Missing translated text');
        const result = { text: data.translatedText, status: 'translated' };
        cache.set(cacheKey, result);
        return result;
      } catch {
        return { text, status: 'unavailable' };
      } finally {
        t.clear();
      }
    }
  };
}

function createDeeplProvider({ apiKey, baseUrl }) {
  const cache = createBoundedCache();
  const apiUrl = `${(baseUrl || 'https://api-free.deepl.com').replace(/\/$/, '')}/v2/translate`;

  return {
    name: 'deepl',
    async translateCaption(text, targetLanguage) {
      const target = targetLanguage.toUpperCase().replace('-', '_');
      if (target === 'EN' || target === 'EN_US') return { text, status: 'original' };

      const cacheKey = `${target}:${text}`;
      const cached = cache.get(cacheKey);
      if (cached !== undefined) return cached;

      const t = withTimeout(DEFAULT_TIMEOUT_MS);
      try {
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `DeepL-Auth-Key ${apiKey}`
          },
          body: JSON.stringify({ text: [text], target_lang: target }),
          signal: t.signal,
          redirect: 'manual'
        });
        if (!res.ok) throw new Error(`DeepL error: ${res.status}`);
        const data = await res.json();
        const translated = data.translations?.[0]?.text;
        if (typeof translated !== 'string' || !translated.trim()) throw new Error('Missing translated text');
        const result = { text: translated, status: 'translated' };
        cache.set(cacheKey, result);
        return result;
      } catch {
        return { text, status: 'unavailable' };
      } finally {
        t.clear();
      }
    }
  };
}

export function createTranslationProvider(config = {}) {
  const rt = runtimeConfig();
  const provider = String(config.provider || process.env.TRANSLATION_PROVIDER || 'mock').toLowerCase();
  const rawBaseUrl = config.baseUrl || process.env.TRANSLATION_HTTP_BASE_URL || '';
  const apiKey = config.apiKey || process.env.TRANSLATION_API_KEY || '';

  // Outbound base URLs are validated (scheme, private hosts, allowlist) before
  // use; a rejected or missing configuration falls back to a mock whose name
  // says why, so the fallback is visible in health and logs.
  let selected = { ...mockTranslationProvider };
  if (provider === 'libretranslate') {
    const baseUrl = rawBaseUrl ? safeBaseUrl(rawBaseUrl, rt) : '';
    if (!rawBaseUrl) selected.name = 'mock(libretranslate_missing_base_url)';
    else if (!baseUrl) selected.name = 'mock(libretranslate_base_url_rejected)';
    else selected = createLibreTranslateProvider({ baseUrl, apiKey });
  } else if (provider === 'deepl') {
    const baseUrl = rawBaseUrl ? safeBaseUrl(rawBaseUrl, rt) : '';
    if (!apiKey) selected.name = 'mock(deepl_missing_api_key)';
    else if (rawBaseUrl && !baseUrl) selected.name = 'mock(deepl_base_url_rejected)';
    else selected = createDeeplProvider({ apiKey, baseUrl });
  }
  // Keep the string API for existing callers while delivery uses explicit status.
  selected.translate = async (...args) => (await selected.translateCaption(...args)).text;
  return selected;
}
