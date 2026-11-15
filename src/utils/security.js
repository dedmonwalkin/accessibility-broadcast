import { URL } from 'node:url';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

export function requireValidId(value, field = 'id') {
  if (!isValidId(value)) {
    const err = new Error(`invalid_${field}`);
    err.statusCode = 400;
    err.code = `invalid_${field}`;
    throw err;
  }
  return value;
}

// Escape a value for safe embedding inside a <script>…</script> JSON literal.
// JSON.stringify alone is unsafe: </script>, U+2028, U+2029 all break out.
export function jsonForScript(value) {
  return JSON.stringify(value ?? '')
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

const PRIVATE_HOST_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^169\.254\./,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,
  /^localhost$/i
];

function isPrivateHost(hostname) {
  return PRIVATE_HOST_PATTERNS.some((re) => re.test(hostname));
}

// Validates a user-configurable outbound base URL (model gateway, translation
// provider). Rejects private/link-local/loopback by default; requires https
// in production unless the host is in `allowHosts`.
//
// Returns a sanitized URL string. Throws if the URL is unsafe.
export function validateOutboundBaseUrl(value, opts = {}) {
  const { allowInsecure = false, allowPrivate = false, allowHosts = [] } = opts;
  if (!value) return '';
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('outbound_url_invalid');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('outbound_url_protocol_not_allowed');
  }
  const hostAllowed = allowHosts.includes(url.hostname);
  if (url.protocol === 'http:' && !allowInsecure && !hostAllowed) {
    throw new Error('outbound_url_http_not_allowed');
  }
  if (isPrivateHost(url.hostname) && !allowPrivate && !hostAllowed) {
    throw new Error('outbound_url_private_host_not_allowed');
  }
  if (url.username || url.password) {
    throw new Error('outbound_url_embedded_credentials');
  }
  return url.toString().replace(/\/$/, '');
}

export function parseAllowList(raw) {
  if (!raw) return [];
  return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
}
