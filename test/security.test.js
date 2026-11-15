import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsonForScript, isValidId, validateOutboundBaseUrl } from '../src/utils/security.js';
import { buildKeyStore, SCOPE_STANDARD, SCOPE_ADMIN } from '../src/utils/auth.js';

test('jsonForScript escapes </script> sequences', () => {
  const malicious = '</script><script>alert(1)</script>';
  const encoded = jsonForScript(malicious);
  assert.ok(!encoded.toLowerCase().includes('</script>'),
    `expected </script> to be escaped, got: ${encoded}`);
  assert.ok(encoded.includes('\\u003c'));
});

test('jsonForScript escapes U+2028 and U+2029', () => {
  const encoded = jsonForScript('line1\u2028line2\u2029line3');
  assert.ok(encoded.includes('\\u2028'));
  assert.ok(encoded.includes('\\u2029'));
  assert.ok(!encoded.includes('\u2028'));
  assert.ok(!encoded.includes('\u2029'));
});

test('jsonForScript escapes ampersand', () => {
  const encoded = jsonForScript('a&b');
  assert.ok(encoded.includes('\\u0026'));
});

test('isValidId accepts common id shapes', () => {
  assert.equal(isValidId('stream_2b440da3-2ece-4959-9352-f47e8407ffb1'), true);
  assert.equal(isValidId('viewer_abc123'), true);
  assert.equal(isValidId('a'), true);
});

test('isValidId rejects unsafe characters and overlong input', () => {
  assert.equal(isValidId('../etc/passwd'), false);
  assert.equal(isValidId('stream<script>'), false);
  assert.equal(isValidId(''), false);
  assert.equal(isValidId('a'.repeat(65)), false);
  assert.equal(isValidId(null), false);
  assert.equal(isValidId(undefined), false);
});

test('validateOutboundBaseUrl rejects loopback and private IPs by default', () => {
  assert.throws(() => validateOutboundBaseUrl('http://169.254.169.254/latest'),
    /outbound_url_/);
  assert.throws(() => validateOutboundBaseUrl('http://127.0.0.1/a'),
    /outbound_url_/);
  assert.throws(() => validateOutboundBaseUrl('http://10.0.0.5/a'),
    /outbound_url_/);
});

test('validateOutboundBaseUrl rejects http by default (not in prod-like posture)', () => {
  assert.throws(() => validateOutboundBaseUrl('http://example.com/a'),
    /outbound_url_http_not_allowed/);
});

test('validateOutboundBaseUrl allows https to public hosts', () => {
  const url = validateOutboundBaseUrl('https://api.example.com/v1');
  assert.equal(url, 'https://api.example.com/v1');
});

test('validateOutboundBaseUrl allows private when allowPrivate is true', () => {
  const url = validateOutboundBaseUrl('http://libretranslate.default.svc.cluster.local:5000',
    { allowInsecure: true, allowPrivate: true });
  assert.ok(url.startsWith('http://libretranslate'));
});

test('validateOutboundBaseUrl rejects embedded credentials', () => {
  assert.throws(
    () => validateOutboundBaseUrl('https://user:pass@example.com/a'),
    /outbound_url_embedded_credentials/
  );
});

test('buildKeyStore verifies with timing-safe compare and scopes', () => {
  const ks = buildKeyStore({
    apiKeys: ['standard-key-aaa'],
    adminApiKeys: ['admin-key-bbb'],
    pepper: 'test-pepper'
  });
  assert.equal(ks.size, 2);
  assert.equal(ks.hasAdmin, true);
  assert.equal(ks.verify('standard-key-aaa'), SCOPE_STANDARD);
  assert.equal(ks.verify('admin-key-bbb'), SCOPE_ADMIN);
  assert.equal(ks.verify('bogus'), null);
  assert.equal(ks.verify(''), null);
});

test('buildKeyStore returns size=0 when no keys configured', () => {
  const ks = buildKeyStore({});
  assert.equal(ks.size, 0);
  assert.equal(ks.hasAdmin, false);
  assert.equal(ks.verify('anything'), null);
});
