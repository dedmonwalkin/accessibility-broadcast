import { runtimeConfig } from '../../config/runtime.js';

const DEFAULT_TIMEOUT_MS = Number(process.env.TRANSLATION_HTTP_TIMEOUT_MS || 5000);

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
          signal: t.signal
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
          signal: t.signal
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
  const provider = String(config.provider || process.env.TRANSLATION_PROVIDER || 'mock').toLowerCase();
  const baseUrl = config.baseUrl || process.env.TRANSLATION_HTTP_BASE_URL || '';
  const apiKey = config.apiKey || process.env.TRANSLATION_API_KEY || '';

  let selected = { ...mockTranslationProvider };
  if (provider === 'libretranslate') selected = baseUrl
    ? createLibreTranslateProvider({ baseUrl, apiKey })
    : { ...mockTranslationProvider, name: 'mock(libretranslate_missing_base_url)' };
  if (provider === 'deepl') selected = apiKey
    ? createDeeplProvider({ apiKey, baseUrl })
    : { ...mockTranslationProvider, name: 'mock(deepl_missing_api_key)' };
  // Keep the string API for existing callers while delivery uses explicit status.
  selected.translate = async (...args) => (await selected.translateCaption(...args)).text;
  return selected;
}
