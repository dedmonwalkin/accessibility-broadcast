import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Default posture: with API keys configured and SSE_PUBLIC_STREAMS unset,
// the live event stream is protected like every other stream endpoint.
process.env.RATE_LIMIT_RPM = '0';
process.env.MODEL_PROVIDER = 'mock';
process.env.TRANSLATION_PROVIDER = 'mock';
process.env.ENABLE_POSTGRES = 'false';
process.env.API_KEYS = 'fixture-key';
delete process.env.SSE_PUBLIC_STREAMS;
const { startServer } = await import('../src/server.js');
const { streamingService } = await import('../src/services/streamingService.js');
let server;
let base;
before(async () => { server = await startServer(0); base = `http://127.0.0.1:${server.address().port}`; });
after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));

test('SSE requires an API key unless public streams are enabled', { timeout: 4000 }, async (t) => {
  const stream = streamingService.createStream({ name: 'Protected fixture' });
  const path = `/v1/streams/${stream.id}/events/stream`;

  const anonymous = await fetch(base + path);
  assert.equal(anonymous.status, 401);
  assert.match(anonymous.headers.get('content-type'), /application\/json/);

  const controller = new AbortController();
  t.after(() => controller.abort());
  const authorized = await fetch(base + path, {
    headers: { Authorization: 'Bearer fixture-key' },
    signal: controller.signal
  });
  assert.equal(authorized.status, 200);
  assert.match(authorized.headers.get('content-type'), /text\/event-stream/);
});
