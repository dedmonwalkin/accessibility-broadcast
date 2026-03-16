import test from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../src/data/store.js';
import { streamingService } from '../src/services/streamingService.js';
import { runtimeConfig } from '../src/config/runtime.js';

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

test('low-confidence threshold is configurable via runtime', () => {
  const config = runtimeConfig();
  assert.equal(typeof config.lowConfidenceThreshold, 'number');
  assert.ok(config.lowConfidenceThreshold > 0);
  assert.ok(config.lowConfidenceThreshold < 1);
});

test('low-confidence events create incidents', async () => {
  resetStore();
  const stream = streamingService.createStream({ name: 'Confidence Test' });
  await streamingService.startStream(stream.id, {
    protocol: 'srt',
    source_url: 'srt://test:9000',
    mock_timeline: [
      { transcript: 'Goal', scene: 'fast action', speaker: 'announcer', entities: [] }
    ]
  });

  const incidents = streamingService.listIncidents({ status: 'open' });
  assert.ok(incidents.length > 0);
  assert.equal(incidents[0].reason, 'low_confidence');
});

test('translation cache config has expected defaults', () => {
  const config = runtimeConfig();
  assert.equal(config.translationCacheTtlMs, 3600_000);
  assert.equal(config.translationCacheMaxSize, 10000);
});

test('SSE config has expected defaults', () => {
  const config = runtimeConfig();
  assert.equal(config.maxSseListeners, 200);
  assert.equal(config.sseIdleTimeoutMs, 300000);
});

test('model HTTP timeout config has expected default', () => {
  const config = runtimeConfig();
  assert.equal(config.modelHttpTimeoutMs, 4000);
});
