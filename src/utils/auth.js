import crypto from 'node:crypto';

// Hashes API keys at boot with a per-deployment pepper so a memory dump or
// env snapshot cannot be replayed directly. Compare with timingSafeEqual to
// avoid leaking keys through request-timing side channels.

const SCOPE_STANDARD = 'standard';
const SCOPE_ADMIN = 'admin';

function hashKey(token, pepper) {
  return crypto
    .createHash('sha256')
    .update(`${pepper}:${token}`)
    .digest();
}

export function buildKeyStore({ apiKeys = [], adminApiKeys = [], pepper = '' }) {
  const effectivePepper = pepper || 'accessibility-broadcast/default-pepper';
  const entries = [];
  for (const raw of apiKeys) {
    const token = String(raw).trim();
    if (!token) continue;
    entries.push({ scope: SCOPE_STANDARD, digest: hashKey(token, effectivePepper) });
  }
  for (const raw of adminApiKeys) {
    const token = String(raw).trim();
    if (!token) continue;
    entries.push({ scope: SCOPE_ADMIN, digest: hashKey(token, effectivePepper) });
  }

  return {
    size: entries.length,
    hasAdmin: entries.some((e) => e.scope === SCOPE_ADMIN),
    verify(token) {
      if (!token) return null;
      const candidate = hashKey(token, effectivePepper);
      // Compare against every entry with constant-time compare. Small fixed
      // constant factor; no early exit.
      let matched = null;
      for (const entry of entries) {
        if (candidate.length === entry.digest.length &&
            crypto.timingSafeEqual(candidate, entry.digest)) {
          matched = entry.scope;
        }
      }
      return matched;
    }
  };
}

export function extractBearer(req) {
  const auth = req.headers['authorization'] || '';
  if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) return '';
  return auth.slice(7).trim();
}

export { SCOPE_STANDARD, SCOPE_ADMIN };
