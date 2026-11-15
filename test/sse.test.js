import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';

process.env.RATE_LIMIT_RPM = '0';
process.env.MODEL_PROVIDER = 'mock';
process.env.TRANSLATION_PROVIDER = 'mock';
process.env.ENABLE_POSTGRES = 'false';
process.env.API_KEYS = 'fixture-key';
const {startServer} = await import('../src/server.js');
const {streamingService} = await import('../src/services/streamingService.js');
const {viewerPreferencesService} = await import('../src/services/viewerPreferencesService.js');
let server;
let base;
before(async () => { server = await startServer(0); base = `http://127.0.0.1:${server.address().port}`; });
after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));

async function connect(t, path) {
  const controller = new AbortController();
  const response = await fetch(base + path, {signal: controller.signal});
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  const reader = response.body.getReader();
  t.after(() => { controller.abort(); reader.cancel().catch(() => {}); });
  let buffer = '';
  const decoder = new TextDecoder();
  return async function next() {
    for (;;) {
      const end = buffer.indexOf('\n\n');
      if (end >= 0) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = frame.split('\n').find(line => line.startsWith('data: '));
        if (data) return JSON.parse(data.slice(6));
        continue;
      }
      const chunk = await reader.read();
      assert.equal(chunk.done, false, 'SSE ended before the expected event');
      buffer += decoder.decode(chunk.value, {stream: true});
    }
  };
}

test('real SSE personalizes delivery and reconnect snapshots while API key auth stays enabled', {timeout: 8000}, async t => {
  const stream = streamingService.createStream({name: 'Wire fixture', output_languages: ['en-US', 'es-ES']});
  await streamingService.startStream(stream.id, {protocol: 'rtmp', source_url: 'rtmp://fixture/live'});
  const viewer = viewerPreferencesService.createViewer({stream_id: stream.id, preferences: {caption_language: 'es-ES', caption_style: 'simplified'}});
  const path = `/v1/streams/${stream.id}/events/stream?viewer_id=${viewer.id}`;
  const read = await connect(t, path);
  const snapshot = await read();
  assert.equal(snapshot.type, 'snapshot');
  assert.ok(snapshot.captions.every(caption => caption.translation_status === 'mock'));
  const ingest = await streamingService.ingestChunk(stream.id);
  const original = await read();
  const translated = await read();
  assert.equal(original.type, 'segment');
  assert.equal(original.segment.translation_status, 'pending');
  assert.equal(translated.type, 'caption.translation');
  assert.equal(translated.segment.id, ingest.segment_id);
  assert.equal(translated.segment.translation_status, 'mock');
  const reconnected = await connect(t, path);
  const recovered = await reconnected();
  assert.equal(recovered.captions.filter(caption => caption.id === ingest.segment_id).length, 1);
  assert.equal(recovered.captions.at(-1).translation_status, 'mock');
  const protectedResponse = await fetch(base + `/v1/streams/${stream.id}/captions`);
  assert.equal(protectedResponse.status, 401);
});

test('SSE rejects unknown streams and profiles before opening the connection', {timeout: 4000}, async () => {
  const missing = await fetch(base + '/v1/streams/missing/events/stream');
  assert.equal(missing.status, 400);
  assert.match(missing.headers.get('content-type'), /application\/json/);
  const first = streamingService.createStream({name: 'First'});
  const second = streamingService.createStream({name: 'Second'});
  const viewer = viewerPreferencesService.createViewer({stream_id: second.id});
  const mismatch = await fetch(base + `/v1/streams/${first.id}/events/stream?viewer_id=${viewer.id}`);
  assert.equal(mismatch.status, 400);
});
