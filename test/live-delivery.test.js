import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { store } from '../src/data/store.js';
import { viewerPreferencesService } from '../src/services/viewerPreferencesService.js';
import { createCaptionBuffer } from '../src/services/liveCaptionClient.js';
import { streamingUiService } from '../src/services/streamingUiService.js';

// A separate service instance exercises the real translation adapter with gated I/O.
const before = { provider: process.env.TRANSLATION_PROVIDER, url: process.env.TRANSLATION_HTTP_BASE_URL };
process.env.TRANSLATION_PROVIDER = 'libretranslate';
process.env.TRANSLATION_HTTP_BASE_URL = 'https://translation.invalid';
const { streamingService, streamEmitter } = await import('../src/services/streamingService.js?live-delivery-tests');
for (const [key, value] of [['TRANSLATION_PROVIDER', before.provider], ['TRANSLATION_HTTP_BASE_URL', before.url]]) {
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function running(t, languages = ['en-US', 'es-ES']) {
  for (const map of [store.streams, store.streamOutputs, store.viewerProfiles, store.incidents]) map.clear();
  t.mock.method(globalThis, 'fetch', async () => Response.json({translatedText: 'Initial translated caption'}));
  const stream = streamingService.createStream({name: 'Delivery test', output_languages: languages});
  await streamingService.startStream(stream.id, {protocol: 'rtmp', source_url: 'rtmp://fixture/live', mock_timeline: [{transcript: 'Initial fixture caption'}]});
  return stream;
}

test('original arrives while translation is blocked, then the same segment receives a language update', async t => {
  const stream = await running(t);
  const gate = deferred();
  const called = deferred();
  t.mock.method(globalThis, 'fetch', async () => { called.resolve(); await gate.promise; return Response.json({translatedText: 'Texto traducido'}); });
  const events = [];
  const receive = event => events.push(event);
  streamEmitter.on(`stream:${stream.id}`, receive);
  t.after(() => streamEmitter.off(`stream:${stream.id}`, receive));
  const ingest = streamingService.ingestChunk(stream.id);
  try {
    await called.promise;
    assert.equal(events[0].type, 'segment');
    assert.equal(events.length, 1);
    const pending = streamingService.getCaptions(stream.id, 'vtt', 'es-ES').captions.at(-1);
    assert.equal(pending.id, events[0].segment.id);
    assert.equal(pending.translation_status, 'pending');
    assert.equal(pending.language, 'en-US');
  } finally { gate.resolve(); await ingest; }
  const update = events.find(event => event.type === 'caption.translation');
  assert.equal(update.segment_id, events[0].segment.id);
  assert.equal(update.target_language, 'es-ES');
  assert.equal(update.segment.text, 'Texto traducido');
  assert.equal(update.segment.translation_status, 'translated');
});

test('viewer language/style and audio preferences apply to original and translation events', async t => {
  const stream = await running(t, ['en-US', 'es-ES', 'fr-FR']);
  const viewer = viewerPreferencesService.createViewer({stream_id: stream.id, preferences: {
    caption_language: 'es-ES', caption_style: 'simplified', audio_description_style: 'concise'
  }});
  const segment = {id: 'fixture', start: new Date().toISOString(), text: 'One two three four five six seven eight nine ten eleven twelve.'};
  const event = streamingService.getLiveEvent(stream.id, {type: 'segment', segment, audio_description: {...segment, text: 'A very long and detailed audio description of the event happening right now.'}}, {viewer_id: viewer.id});
  assert.equal(event.segment.target_language, 'es-ES');
  assert.equal(event.segment.translation_status, 'pending');
  assert.equal(event.segment.text, 'One two three four five six seven eight nine ten...');
  assert.match(event.audio_description.text, /^Audio description:/);
  const update = {type: 'caption.translation', target_language: 'es-ES', segment: {...segment, text: 'Uno dos tres.', translation_status: 'translated'}};
  assert.equal(streamingService.getLiveEvent(stream.id, update, {viewer_id: viewer.id}).segment.text, 'Uno dos tres');
  assert.equal(streamingService.getLiveEvent(stream.id, {...update, target_language: 'fr-FR'}, {viewer_id: viewer.id}), null);
  assert.equal(streamingService.getLiveEvent(stream.id, update), null);
});

test('a ready language is published without waiting for another requested language', async t => {
  const stream = await running(t, ['en-US', 'es-ES', 'fr-FR']);
  const spanishReady = deferred();
  const frenchGate = deferred();
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const request = JSON.parse(options.body);
    if (request.target === 'fr') await frenchGate.promise;
    return Response.json({translatedText: request.target + ' translated'});
  });
  const receive = event => { if (event.type === 'caption.translation' && event.target_language === 'es-ES') spanishReady.resolve(event); };
  streamEmitter.on(`stream:${stream.id}`, receive);
  t.after(() => streamEmitter.off(`stream:${stream.id}`, receive));
  const ingest = streamingService.ingestChunk(stream.id);
  try { assert.equal((await spanishReady.promise).segment.text, 'es translated'); }
  finally { frenchGate.resolve(); await ingest; }
});

test('translation failure retains the original with an unavailable status', async t => {
  const stream = await running(t);
  t.mock.method(globalThis, 'fetch', async () => Response.json({error: 'Unavailable'}, {status: 503}));
  const result = await streamingService.ingestChunk(stream.id);
  const fallback = streamingService.getCaptions(stream.id, 'vtt', 'es-ES').captions.at(-1);
  assert.equal(fallback.id, result.segment_id);
  assert.equal(fallback.text, result.segment.text);
  assert.equal(fallback.language, 'en-US');
  assert.equal(fallback.translation_status, 'unavailable');
});

test('concurrent chunks have unique IDs and keep source ordering when translations finish in reverse', async t => {
  const stream = await running(t);
  const firstCalled = deferred();
  const firstGate = deferred();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    const index = calls++;
    if (index === 0) { firstCalled.resolve(); await firstGate.promise; }
    return Response.json({translatedText: 'Translation ' + index});
  });
  const first = streamingService.ingestChunk(stream.id);
  await firstCalled.promise;
  let second;
  try { second = await streamingService.ingestChunk(stream.id); }
  finally { firstGate.resolve(); }
  const firstResult = await first;
  assert.notEqual(firstResult.segment_id, second.segment_id);
  const output = store.streamOutputs.get(stream.id);
  assert.deepEqual(output.captionTranslations['es-ES'].map(segment => segment.id), output.captions.map(segment => segment.id));
});

test('a stream stopped during translation does not publish late language updates', async t => {
  const stream = await running(t);
  const called = deferred();
  const gate = deferred();
  t.mock.method(globalThis, 'fetch', async () => { called.resolve(); await gate.promise; return Response.json({translatedText: 'Late'}); });
  const events = [];
  const receive = event => events.push(event);
  streamEmitter.on(`stream:${stream.id}`, receive);
  t.after(() => streamEmitter.off(`stream:${stream.id}`, receive));
  const ingest = streamingService.ingestChunk(stream.id);
  await called.promise;
  streamingService.stopStream(stream.id);
  gate.resolve();
  await ingest;
  assert.deepEqual(events.map(event => event.type), ['segment', 'stream.stopped']);
});

test('caption buffer merges reconnects and late originals without duplicating or regressing text', () => {
  const buffer = createCaptionBuffer();
  const original = {id: 'a', start: '2026-01-01T00:00:00Z', text: 'Original', translation_status: 'pending'};
  buffer.upsert(original);
  buffer.upsert({...original, text: 'Traducido', translation_status: 'translated'});
  buffer.upsert(original);
  assert.equal(buffer.values().length, 1);
  assert.equal(buffer.values()[0].text, 'Traducido');
  buffer.upsert({...original, id: 'b', start: '2026-01-01T00:00:01Z'});
  buffer.upsert({...original, id: 'b', text: 'Segundo', start: '2026-01-01T00:00:01Z', translation_status: 'translated'});
  assert.deepEqual(buffer.values().map(segment => segment.id), ['a', 'b']);
  assert.match(buffer.text(), /Traducido/);
});

test('embed retains the newest segment when an older translation arrives late', () => {
  const buffer = createCaptionBuffer(1);
  buffer.upsert({id: 'b', start: '2026-01-01T00:00:02Z', text: 'Newer'});
  buffer.upsert({id: 'a', start: '2026-01-01T00:00:01Z', text: 'Older translated', translation_status: 'translated'});
  assert.equal(buffer.values()[0].id, 'b');
});

test('a changed target language can replace a completed caption in the buffer', () => {
  const buffer = createCaptionBuffer();
  buffer.upsert({id: 'a', text: 'Espanol', target_language: 'es-ES', translation_status: 'translated'});
  buffer.upsert({id: 'a', text: 'English original', target_language: 'fr-FR', translation_status: 'pending'});
  assert.equal(buffer.values()[0].target_language, 'fr-FR');
  assert.match(buffer.text(), /translation pending/);
});

test('viewer and embed emitted JavaScript parses and includes translation/reconnect delivery', () => {
  const html = streamingUiService.buildViewerPage('fixture', 'viewer-fixture');
  for (const [, script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(script);
  new vm.Script(streamingUiService.buildOverlayScript());
  assert.ok(html.includes("'/events/stream' + viewerQuery"));
});
