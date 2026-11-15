import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Caller mistakes (unknown IDs, missing fields, wrong state) must come back as
// HTTP 400 with a stable code, never as a 500 internal error.
process.env.RATE_LIMIT_RPM = '0';
process.env.MODEL_PROVIDER = 'mock';
process.env.TRANSLATION_PROVIDER = 'mock';
process.env.ENABLE_POSTGRES = 'false';
process.env.API_KEYS = 'fixture-key';
const { startServer } = await import('../src/server.js');
let server;
let base;
before(async () => { server = await startServer(0); base = `http://127.0.0.1:${server.address().port}`; });
after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));

const UNKNOWN_STREAM = 'stream_00000000-0000-0000-0000-000000000000';
const UNKNOWN_VIEWER = 'viewer_00000000-0000-0000-0000-000000000000';

async function call(method, path, body) {
  const response = await fetch(base + path, {
    method,
    headers: { Authorization: 'Bearer fixture-key', 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

test('unknown resources return 400 with a typed code', async () => {
  const cases = [
    ['GET', `/v1/streams/${UNKNOWN_STREAM}/captions`, undefined, 'stream_not_found'],
    ['GET', `/v1/streams/${UNKNOWN_STREAM}/health`, undefined, 'stream_not_found'],
    ['POST', `/v1/streams/${UNKNOWN_STREAM}/stop`, {}, 'stream_not_found'],
    ['GET', `/v1/viewers/${UNKNOWN_VIEWER}`, undefined, 'viewer_not_found'],
    ['POST', '/v1/viewers', { stream_id: UNKNOWN_STREAM }, 'stream_not_found'],
    ['POST', '/v1/feedback', { stream_id: UNKNOWN_STREAM, message: 'hello' }, 'stream_not_found'],
    ['POST', '/v1/ad/sessions', { stream_id: UNKNOWN_STREAM, ad_campaign_id: 'c1' }, 'stream_not_found']
  ];
  for (const [method, path, body, code] of cases) {
    const result = await call(method, path, body);
    assert.equal(result.status, 400, `${method} ${path}`);
    assert.equal(result.body.error, code, `${method} ${path}`);
  }
});

test('missing required fields name the field without leaking a message', async () => {
  const result = await call('POST', '/v1/streams', {});
  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { field: 'name', error: 'missing_required_field' });
});

test('wrong-state requests return typed codes', async () => {
  const created = await call('POST', '/v1/streams', { name: 'Error fixture' });
  assert.equal(created.status, 201);
  const badProtocol = await call('POST', `/v1/streams/${created.body.id}/start`, { protocol: 'hls', source_url: 'x' });
  assert.equal(badProtocol.status, 400);
  assert.equal(badProtocol.body.error, 'unsupported_ingest_protocol');
});
