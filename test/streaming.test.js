import test from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../src/data/store.js';
import { streamingService, streamEmitter } from '../src/services/streamingService.js';

function resetStore() {
  store.streams.clear();
  store.streamOutputs.clear();
  store.viewerProfiles.clear();
  store.incidents.clear();
  store.feedback.clear();
  store.adSessions.clear();
  store.adEvents.clear();
  store.auditLog.length = 0;
}

test('creates a stream and assigns correct defaults', () => {
  resetStore();
  const stream = streamingService.createStream({ name: 'Test Stream' });
  assert.equal(stream.status, 'created');
  assert.equal(stream.sign_language, 'ASL');
  assert.deepEqual(stream.output_languages, ['en-US']);
  assert.equal(stream.sign_presentation_mode, 'avatar_2d');
});

test('starts stream and generates outputs', async () => {
  resetStore();
  const stream = streamingService.createStream({ name: 'Start Test' });
  const result = await streamingService.startStream(stream.id, {
    protocol: 'rtmp',
    source_url: 'rtmp://test/live'
  });

  assert.equal(result.stream.status, 'running');
  assert.equal(result.generated.events, 3);
  assert.ok(result.generated.captions > 0);
  assert.ok(result.generated.audioDescription > 0);
  assert.ok(result.generated.signScript > 0);
});

test('stops a running stream', async () => {
  resetStore();
  const stream = streamingService.createStream({ name: 'Stop Test' });
  await streamingService.startStream(stream.id, {
    protocol: 'srt',
    source_url: 'srt://test:9000'
  });

  const stopped = streamingService.stopStream(stream.id);
  assert.equal(stopped.status, 'stopped');
  assert.ok(stopped.stopped_at);
});

test('ingests a chunk and produces outputs', async () => {
  resetStore();
  const stream = streamingService.createStream({ name: 'Chunk Test' });
  await streamingService.startStream(stream.id, {
    protocol: 'rtmp',
    source_url: 'rtmp://test/chunk'
  });

  const result = await streamingService.ingestChunk(stream.id, {
    audio_base64: 'dGVzdA==',
    format: 'wav',
    duration_ms: 2000
  });

  assert.ok(result.segment_id);
  assert.ok(result.segment);
  assert.ok(result.audio_description);
  assert.ok(result.sign);
});

test('emits SSE events on chunk ingest', async () => {
  resetStore();
  const stream = streamingService.createStream({ name: 'SSE Test' });
  await streamingService.startStream(stream.id, {
    protocol: 'rtmp',
    source_url: 'rtmp://test/sse'
  });

  const events = [];
  const handler = (data) => events.push(data);
  streamEmitter.on(`stream:${stream.id}`, handler);

  await streamingService.ingestChunk(stream.id, {
    audio_base64: 'dGVzdA==',
    format: 'wav'
  });

  streamEmitter.off(`stream:${stream.id}`, handler);
  assert.ok(events.length > 0);
  assert.equal(events[events.length - 1].type, 'segment');
});

test('emits stream.stopped event on stop', async () => {
  resetStore();
  const stream = streamingService.createStream({ name: 'Stop Event Test' });
  await streamingService.startStream(stream.id, {
    protocol: 'rtmp',
    source_url: 'rtmp://test/stop-event'
  });

  const events = [];
  const handler = (data) => events.push(data);
  streamEmitter.on(`stream:${stream.id}`, handler);

  streamingService.stopStream(stream.id);

  streamEmitter.off(`stream:${stream.id}`, handler);
  assert.equal(events[events.length - 1].type, 'stream.stopped');
});

test('throws when ingesting chunk on non-running stream', async () => {
  resetStore();
  const stream = streamingService.createStream({ name: 'Error Test' });

  await assert.rejects(
    () => streamingService.ingestChunk(stream.id, { audio_base64: 'dGVzdA==' }),
    /not running/
  );
});

test('getCaptions returns VTT format by default', async () => {
  resetStore();
  const stream = streamingService.createStream({ name: 'Caption Test' });
  await streamingService.startStream(stream.id, {
    protocol: 'rtmp',
    source_url: 'rtmp://test/captions'
  });

  const captions = streamingService.getCaptions(stream.id);
  assert.equal(captions.format, 'vtt');
  assert.match(captions.rendered, /WEBVTT/);
});

test('getCaptions returns TTML when requested', async () => {
  resetStore();
  const stream = streamingService.createStream({ name: 'TTML Test' });
  await streamingService.startStream(stream.id, {
    protocol: 'rtmp',
    source_url: 'rtmp://test/ttml'
  });

  const captions = streamingService.getCaptions(stream.id, 'ttml');
  assert.equal(captions.format, 'ttml');
  assert.match(captions.rendered, /<tt/);
});

test('getHealth returns stream health metrics', async () => {
  resetStore();
  const stream = streamingService.createStream({ name: 'Health Test' });
  await streamingService.startStream(stream.id, {
    protocol: 'rtmp',
    source_url: 'rtmp://test/health'
  });

  const health = streamingService.getHealth(stream.id);
  assert.equal(health.status, 'running');
  assert.ok(health.generated_segments > 0);
  assert.equal(health.stream_id, stream.id);
});
