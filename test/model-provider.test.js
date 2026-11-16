import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

// A failing or misconfigured model gateway must produce an error and no
// output. It must never be replaced with mock captions.
process.env.RATE_LIMIT_RPM = '0';
process.env.TRANSLATION_PROVIDER = 'mock';
process.env.ENABLE_POSTGRES = 'false';
process.env.API_KEYS = 'fixture-key';
process.env.SSE_PUBLIC_STREAMS = 'true';
process.env.MODEL_HTTP_BASE_URL = 'http://model-gateway.local';
const GATEWAY = 'http://model-gateway.local';

const { createHttpModelProvider } = await import('../src/services/providers/httpModelProvider.js');
const { streamingService, streamEmitter } = await import('../src/services/streamingService.js');
const { store } = await import('../src/data/store.js');
const { startServer } = await import('../src/server.js');

// Stands in for the gateway. Requests to anything else go to the real fetch,
// so the tests can still call this server over HTTP.
const realFetch = globalThis.fetch;
const gateway = { mode: 'up', calls: [] };
const GATEWAY_TRANSCRIPT = 'The clerk reads item four of the agenda.';

function gatewayResponse(path, body) {
  if (path === '/v1/models/transcribe') {
    return { transcript: GATEWAY_TRANSCRIPT, scene: 'Council chamber', language: 'en', confidence: 0.93 };
  }
  if (path === '/v1/models/perception') {
    const item = body.timelineItem;
    return { transcript: item.transcript, scene: item.scene, speaker: item.speaker, entities: item.entities, source_refs: item.source_refs, confidence: 0.93 };
  }
  if (path === '/v1/models/accessibility') {
    const { timelineItem: item, perception } = body;
    return {
      segment_id: item.id, ts_start: item.ts_start, ts_end: item.ts_end, type: 'commentary',
      text: perception.transcript, speaker: perception.speaker, entities: perception.entities,
      confidence: perception.confidence, source_refs: perception.source_refs, audio_description: perception.scene
    };
  }
  const { accessibility } = body;
  return {
    id: accessibility.segment_id, start: accessibility.ts_start, end: accessibility.ts_end,
    gloss_tokens: ['CLERK', 'READ'], facial_cues: ['NEUTRAL'], confidence: accessibility.confidence,
    fallback_text: accessibility.text
  };
}

globalThis.fetch = async (url, options) => {
  const target = String(url);
  if (!target.startsWith(GATEWAY)) return realFetch(url, options);
  const path = target.slice(GATEWAY.length);
  gateway.calls.push(path);
  if (gateway.mode === 'down') throw new TypeError('fetch failed');
  if (gateway.mode === 'error') return { ok: false, status: 500, async json() { return { error: 'boom' }; } };
  if (gateway.mode === 'garbage') return { ok: true, status: 200, async json() { return 'not an object'; } };
  return { ok: true, status: 200, async json() { return gatewayResponse(path, JSON.parse(options.body)); } };
};

let server;
let base;
before(async () => { server = await startServer(0); base = `http://127.0.0.1:${server.address().port}`; });
after(() => new Promise((resolve) => {
  globalThis.fetch = realFetch;
  server.closeAllConnections();
  server.close(resolve);
}));

const MOCK_SAMPLE = { timelineItem: { id: 't1', transcript: 'x', scene: 'y', entities: [] } };

async function startedHttpStream(name) {
  gateway.mode = 'up';
  const stream = streamingService.createStream({ name, model_provider: 'http' });
  await streamingService.startStream(stream.id, {
    protocol: 'rtmp',
    source_url: 'rtmp://fixture/live',
    mock_timeline: [{ transcript: 'Opening remarks.', scene: 'Chamber', speaker: 'chair', entities: [] }]
  });
  return stream;
}

function incidentsFor(streamId) {
  return [...store.incidents.values()].filter(incident => incident.stream_id === streamId && incident.reason === 'model_provider_error');
}

test('every provider operation fails with a typed error when the gateway is unreachable', async () => {
  gateway.mode = 'down';
  const provider = createHttpModelProvider();
  const operations = [
    ['transcribe', () => provider.transcribe({ audio_base64: 'AAAA' })],
    ['perception', () => provider.inferPerception(MOCK_SAMPLE)],
    ['accessibility', () => provider.inferAccessibility({ ...MOCK_SAMPLE, perception: {} })],
    ['sign_script', () => provider.inferSignScript({ accessibility: { text: 'x' } })]
  ];
  for (const [operation, run] of operations) {
    await assert.rejects(run, (error) => {
      assert.equal(error.code, 'model_provider_unavailable', operation);
      assert.equal(error.statusCode, 502, operation);
      assert.deepEqual(error.details, { operation }, operation);
      return true;
    });
  }
});

test('gateway error statuses and unusable bodies are failures, not output', async () => {
  const provider = createHttpModelProvider();
  for (const mode of ['error', 'garbage']) {
    gateway.mode = mode;
    await assert.rejects(() => provider.transcribe({ audio_base64: 'AAAA' }), { code: 'model_provider_unavailable' }, mode);
  }
});

test('a missing or rejected gateway URL is reported instead of switching to the mock provider', () => {
  const saved = process.env.MODEL_HTTP_BASE_URL;
  try {
    delete process.env.MODEL_HTTP_BASE_URL;
    assert.throws(() => createHttpModelProvider(), (error) => {
      assert.equal(error.code, 'model_provider_misconfigured');
      assert.equal(error.statusCode, 503);
      assert.deepEqual(error.details, { reason: 'missing_base_url' });
      return true;
    });

    process.env.MODEL_HTTP_BASE_URL = 'ftp://model-gateway.local';
    assert.throws(() => createHttpModelProvider(), (error) => {
      assert.equal(error.code, 'model_provider_misconfigured');
      assert.deepEqual(error.details, { reason: 'base_url_rejected' });
      return true;
    });

    // The same mistake in a request is the caller's to fix.
    assert.throws(() => createHttpModelProvider({ base_url: 'ftp://model-gateway.local' }), (error) => {
      assert.equal(error.code, 'model_base_url_rejected');
      assert.equal(error.statusCode, 400);
      return true;
    });
  } finally {
    process.env.MODEL_HTTP_BASE_URL = saved;
  }
});

test('a gateway outage publishes nothing, opens one incident and tells viewers once', async () => {
  const stream = await startedHttpStream('Council meeting');
  assert.equal(streamingService.getHealth(stream.id).model_provider_status, 'ok');
  const captionsBefore = streamingService.getCaptions(stream.id).captions.map(caption => caption.text);

  const events = [];
  const onEvent = (event) => events.push(event);
  streamEmitter.on(`stream:${stream.id}`, onEvent);
  try {
    gateway.mode = 'down';
    for (let i = 0; i < 3; i += 1) {
      await assert.rejects(() => streamingService.ingestChunk(stream.id, { audio_base64: 'AAAA' }), { code: 'model_provider_unavailable' });
    }

    assert.deepEqual(streamingService.getCaptions(stream.id).captions.map(caption => caption.text), captionsBefore, 'no caption is published during the outage');
    assert.deepEqual(events.map(event => event.type), ['captions.interrupted']);
    assert.equal(events[0].reason, 'model_provider_unavailable');

    const incidents = incidentsFor(stream.id);
    assert.equal(incidents.length, 1, 'repeated failures share one incident');
    assert.equal(incidents[0].status, 'open');
    assert.equal(incidents[0].severity, 'high');
    assert.equal(incidents[0].operation, 'transcribe');
    assert.equal(incidents[0].failed_requests, 3);

    const health = streamingService.getHealth(stream.id);
    assert.equal(health.model_provider_status, 'interrupted');
    assert.ok(health.captions_interrupted_since);
    assert.equal(streamingService.isCaptioningInterrupted(stream.id), true);

    gateway.mode = 'up';
    const recovered = await streamingService.ingestChunk(stream.id, { audio_base64: 'AAAA' });
    assert.equal(recovered.segment.text, GATEWAY_TRANSCRIPT, 'output comes from the gateway');
    assert.equal(streamingService.getHealth(stream.id).model_provider_status, 'ok');
    assert.equal(streamingService.getHealth(stream.id).captions_interrupted_since, null);
    assert.equal(streamingService.isCaptioningInterrupted(stream.id), false);
    assert.equal(events.at(-1).type, 'segment');
  } finally {
    streamEmitter.off(`stream:${stream.id}`, onEvent);
  }
});

test('a later outage on the same stream opens a new incident', async () => {
  const stream = await startedHttpStream('Second outage');
  gateway.mode = 'down';
  await assert.rejects(() => streamingService.ingestChunk(stream.id, {}), { code: 'model_provider_unavailable' });
  gateway.mode = 'up';
  await streamingService.ingestChunk(stream.id, {});
  gateway.mode = 'down';
  await assert.rejects(() => streamingService.ingestChunk(stream.id, {}), { code: 'model_provider_unavailable' });
  assert.equal(incidentsFor(stream.id).length, 2);
});

test('a start that sends a timeline fails while the gateway is down and the stream is not left running', async () => {
  gateway.mode = 'down';
  const stream = streamingService.createStream({ name: 'Never started', model_provider: 'http' });
  await assert.rejects(
    () => streamingService.startStream(stream.id, {
      protocol: 'rtmp',
      source_url: 'rtmp://fixture/live',
      mock_timeline: [{ transcript: 'Opening remarks.', scene: 'Chamber', speaker: 'chair', entities: [] }]
    }),
    { code: 'model_provider_unavailable' }
  );
  const health = streamingService.getHealth(stream.id);
  assert.notEqual(health.status, 'running');
  assert.equal(health.generated_segments, 0);
  assert.equal(streamingService.getCaptions(stream.id).captions.length, 0);
});

test('the API answers 502 with the failing operation, and the event stream snapshot reports the interruption', { timeout: 5000 }, async (t) => {
  const stream = await startedHttpStream('HTTP surface');
  gateway.mode = 'down';
  const response = await fetch(`${base}/v1/streams/${stream.id}/ingest/chunk`, {
    method: 'POST',
    headers: { Authorization: 'Bearer fixture-key', 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio_base64: 'AAAA' })
  });
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error, 'model_provider_unavailable');
  assert.equal(body.operation, 'transcribe');
  assert.ok(body.request_id);

  const controller = new AbortController();
  t.after(() => controller.abort());
  const sse = await fetch(`${base}/v1/streams/${stream.id}/events/stream`, { signal: controller.signal });
  assert.equal(sse.status, 200);
  const reader = sse.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (!text.includes('"type":"snapshot"') || !text.endsWith('\n\n')) {
    const chunk = await reader.read();
    assert.equal(chunk.done, false);
    text += decoder.decode(chunk.value, { stream: true });
  }
  const snapshot = JSON.parse(text.split('\n').find(line => line.startsWith('data: ')).slice(6));
  assert.equal(snapshot.captions_interrupted, true);
});

test('a misconfigured gateway is a 503 the operator can act on', async () => {
  const stream = await startedHttpStream('Misconfigured later');
  const saved = process.env.MODEL_HTTP_BASE_URL;
  delete process.env.MODEL_HTTP_BASE_URL;
  try {
    const response = await fetch(`${base}/v1/streams/${stream.id}/ingest/chunk`, {
      method: 'POST',
      headers: { Authorization: 'Bearer fixture-key', 'Content-Type': 'application/json' },
      body: '{}'
    });
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.error, 'model_provider_misconfigured');
    assert.equal(body.reason, 'missing_base_url');
  } finally {
    process.env.MODEL_HTTP_BASE_URL = saved;
  }
});

const DEMO_CAPTION = /championship game|home team|midfield/i;

test('a stream on the real provider starts empty: no demo captions and no gateway calls', async () => {
  gateway.mode = 'up';
  gateway.calls.length = 0;
  const stream = streamingService.createStream({ name: 'City council meeting', model_provider: 'http' });
  const started = await streamingService.startStream(stream.id, { protocol: 'rtmp', source_url: 'rtmp://fixture/live' });

  assert.equal(started.stream.status, 'running');
  assert.equal(started.generated.provider, 'http');
  assert.deepEqual(
    { events: started.generated.events, captions: started.generated.captions, audio: started.generated.audioDescription, sign: started.generated.signScript },
    { events: 0, captions: 0, audio: 0, sign: 0 }
  );
  assert.deepEqual(streamingService.getCaptions(stream.id).captions, []);
  assert.deepEqual(streamingService.getAudioDescription(stream.id).segments, []);
  assert.deepEqual(streamingService.getSignOverlay(stream.id).segments, []);
  assert.deepEqual(gateway.calls, [], 'nothing was sent to the gateway');
  assert.equal(streamingService.getHealth(stream.id).model_provider_status, 'unknown', 'not reported as ok before it has been used');

  await streamingService.ingestChunk(stream.id, { audio_base64: 'AAAA' });
  const texts = streamingService.getCaptions(stream.id).captions.map(caption => caption.text);
  assert.deepEqual(texts, [GATEWAY_TRANSCRIPT], 'the first caption is the first real one');
  assert.ok(texts.every(text => !DEMO_CAPTION.test(text)));
  assert.equal(streamingService.getHealth(stream.id).model_provider_status, 'ok');
});

test('a real-provider stream can start while the gateway is down, and the first chunk reports it', async () => {
  gateway.mode = 'down';
  const stream = streamingService.createStream({ name: 'Starts anyway', model_provider: 'http' });
  const started = await streamingService.startStream(stream.id, { protocol: 'rtmp', source_url: 'rtmp://fixture/live' });
  assert.equal(started.stream.status, 'running');
  await assert.rejects(() => streamingService.ingestChunk(stream.id, {}), { code: 'model_provider_unavailable' });
  assert.equal(streamingService.getHealth(stream.id).model_provider_status, 'interrupted');
  assert.equal(incidentsFor(stream.id).length, 1);
});

test('the demo timeline is still what a mock-provider stream starts with', async () => {
  const stream = streamingService.createStream({ name: 'Demo', model_provider: 'mock' });
  const started = await streamingService.startStream(stream.id, { protocol: 'rtmp', source_url: 'rtmp://fixture/live' });
  assert.equal(started.generated.provider, 'mock');
  assert.equal(started.generated.captions, 3);
  assert.ok(streamingService.getCaptions(stream.id).captions.every(caption => DEMO_CAPTION.test(caption.text)));
});

test('an unrecognised provider name is refused instead of being treated as mock', async () => {
  assert.throws(() => streamingService.createStream({ name: 'Typo', model_provider: 'whisper' }), (error) => {
    assert.equal(error.code, 'unsupported_model_provider');
    assert.equal(error.statusCode, 400);
    assert.deepEqual(error.details, { supported: ['mock', 'http'] });
    return true;
  });

  const stream = streamingService.createStream({ name: 'Override', model_provider: 'http' });
  await assert.rejects(
    () => streamingService.startStream(stream.id, { protocol: 'rtmp', source_url: 'rtmp://fixture/live', model_provider: 'whisper' }),
    { code: 'unsupported_model_provider' }
  );
  assert.notEqual(streamingService.getHealth(stream.id).status, 'running');

  const response = await fetch(`${base}/v1/streams`, {
    method: 'POST',
    headers: { Authorization: 'Bearer fixture-key', 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Typo over HTTP', model_provider: 'whisper' })
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { supported: ['mock', 'http'], error: 'unsupported_model_provider' });
});

test('an unrecognised MODEL_PROVIDER on the server is a 503, not a mock stream', () => {
  const saved = process.env.MODEL_PROVIDER;
  process.env.MODEL_PROVIDER = 'whisper';
  try {
    assert.throws(() => streamingService.createStream({ name: 'Env typo' }), (error) => {
      assert.equal(error.code, 'model_provider_misconfigured');
      assert.equal(error.statusCode, 503);
      assert.deepEqual(error.details, { reason: 'unknown_provider' });
      return true;
    });
  } finally {
    if (saved === undefined) delete process.env.MODEL_PROVIDER; else process.env.MODEL_PROVIDER = saved;
  }
});
