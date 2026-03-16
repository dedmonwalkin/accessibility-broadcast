import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { store } from '../src/data/store.js';
import { streamingService } from '../src/services/streamingService.js';
import { viewerPreferencesService } from '../src/services/viewerPreferencesService.js';
import { feedbackService } from '../src/services/feedbackService.js';
import { adIntegrationService } from '../src/services/adIntegrationService.js';
import { AccessibilityClient } from '../sdk/js/index.js';

const require = createRequire(import.meta.url);

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

test('creates and starts a stream with captions/audio/sign outputs', async () => {
  resetStore();
  const stream = streamingService.createStream({
    name: 'Arena Accessibility Feed',
    signer_profile: 'avatar-river'
  });

  const startResult = await streamingService.startStream(stream.id, {
    protocol: 'rtmp',
    source_url: 'rtmp://encoder.local/live/main'
  });
  assert.equal(startResult.stream.status, 'running');
  assert.equal(startResult.generated.events, 3);

  const captions = streamingService.getCaptions(stream.id, 'vtt');
  assert.equal(captions.format, 'vtt');
  assert.match(captions.rendered, /WEBVTT/);

  const signOverlay = streamingService.getSignOverlay(stream.id);
  assert.equal(signOverlay.sign_language, 'ASL');
  assert.equal(signOverlay.signer_profile, 'avatar-river');

  const audio = streamingService.getAudioDescription(stream.id);
  assert.equal(audio.track_kind, 'audio_description');

  const health = streamingService.getHealth(stream.id);
  assert.equal(health.status, 'running');

  const stopped = streamingService.stopStream(stream.id);
  assert.equal(stopped.status, 'stopped');
});

test('creates and resolves low-confidence incidents with correction', async () => {
  resetStore();
  const stream = streamingService.createStream({ name: 'Low Confidence Feed' });

  await streamingService.startStream(stream.id, {
    protocol: 'srt',
    source_url: 'srt://10.0.0.4:9000',
    mock_timeline: [{ transcript: 'Goal', scene: 'fast sprint', speaker: 'announcer', entities: [] }]
  });

  const open = streamingService.listIncidents({ status: 'open' });
  assert.equal(open.length, 1);

  const resolved = await streamingService.resolveIncident(open[0].id, {
    assigned_to: 'human-reviewer-1',
    resolution: 'caption corrected after review',
    corrected_text: 'Goal scored by the home team after a fast sprint.'
  });
  assert.equal(resolved.status, 'resolved');

  const captions = streamingService.getCaptions(stream.id);
  assert.match(captions.captions[0].text, /home team/);
});

test('captures feedback and summarizes by stream', async () => {
  resetStore();
  const stream = streamingService.createStream({ name: 'Feedback Stream' });
  await streamingService.startStream(stream.id, {
    protocol: 'rtmp',
    source_url: 'rtmp://encoder.local/live/feedback'
  });

  feedbackService.create({
    stream_id: stream.id,
    source: 'viewer',
    rating: 4,
    issue_type: 'captions',
    impairment_type: 'hard_of_hearing',
    message: 'Captions lag around 3 seconds.'
  });

  const summary = feedbackService.summarizeByStream(stream.id);
  assert.equal(summary.total, 1);
  assert.equal(summary.avg_rating, 4);
  assert.equal(summary.by_issue_type.captions, 1);
});

test('supports basic sign book overlay mode', async () => {
  resetStore();
  const stream = streamingService.createStream({
    name: 'Basic Sign Stream',
    sign_presentation_mode: 'basic_signs_book'
  });

  await streamingService.startStream(stream.id, {
    protocol: 'rtmp',
    source_url: 'rtmp://encoder.local/live/basic-signs'
  });

  const signOverlay = streamingService.getSignOverlay(stream.id);
  assert.equal(signOverlay.sign_presentation_mode, 'basic_signs_book');
  assert.equal(signOverlay.render_strategy, 'book_sign_cards');
  assert.equal(signOverlay.sign_cards.length, signOverlay.segments.length);
});

test('supports multilingual captions, viewer personalization, and ad reporting', async () => {
  resetStore();
  const stream = streamingService.createStream({
    name: 'Global Stream',
    output_languages: ['en-US', 'es-ES', 'zh-CN'],
    sign_languages: ['ASL', 'BSL'],
    accessibility_profiles: ['deaf_or_hard_of_hearing', 'deafblind_support']
  });

  await streamingService.startStream(stream.id, {
    protocol: 'rtmp',
    source_url: 'rtmp://encoder.local/live/global'
  });

  const viewer = viewerPreferencesService.createViewer({
    stream_id: stream.id,
    preferences: {
      caption_language: 'es-ES',
      caption_style: 'simplified',
      audio_description_style: 'concise',
      sign_language: 'BSL',
      sign_presentation_mode: 'basic_signs_book'
    }
  });

  const captionsEs = streamingService.getCaptions(stream.id, 'vtt', null, { viewer_id: viewer.id });
  assert.equal(captionsEs.language, 'es-ES');

  const signOverlay = streamingService.getSignOverlay(stream.id, { viewer_id: viewer.id });
  assert.equal(signOverlay.sign_language, 'BSL');
  assert.equal(signOverlay.render_strategy, 'book_sign_cards');

  const coverage = streamingService.getAccessibilityCoverage();
  assert.equal(coverage.supported_output_languages.includes('zh-CN'), true);
  assert.equal(coverage.supported_accessibility_profiles.includes('deafblind_support'), true);

  const adSession = adIntegrationService.createSession({
    stream_id: stream.id,
    ad_campaign_id: 'campaign_world_1',
    platform_type: 'web_sdk'
  });
  adIntegrationService.logEvent(adSession.id, { event_type: 'impression' });
  const sessionReport = adIntegrationService.getSessionReport(adSession.id);
  assert.equal(sessionReport.counts.impressions, 1);
});

test('sdk client builds requests for viewer and stream APIs', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      async text() {
        return JSON.stringify({ ok: true });
      }
    };
  };

  const client = new AccessibilityClient({
    baseUrl: 'http://localhost:3000',
    apiKey: 'token_123',
    fetchImpl
  });

  await client.createStream({ name: 'SDK Stream' });
  await client.createViewer({ stream_id: 'stream_1', display_name: 'Viewer A' });
  await client.getViewer('viewer_1');
  await client.getViewerPreferences('viewer_1');
  await client.updateViewerPreferences('viewer_1', { caption_style: 'simplified' });
  await client.startStream('stream_1', { protocol: 'rtmp', source_url: 'rtmp://source' });
  await client.getCaptions('stream_1', 'ttml', 'es-ES', 'viewer_1');
  await client.getAudioDescription('stream_1', 'viewer_1');
  await client.getSignOverlay('stream_1', 'viewer_1');
  await client.listIncidents('open');

  assert.equal(calls.length, 10);
  assert.match(calls[1].url, /\/v1\/viewers$/);
  assert.match(calls[6].url, /\/v1\/streams\/stream_1\/captions\?format=ttml&language=es-ES&viewer_id=viewer_1/);
  assert.match(calls[7].url, /\/v1\/streams\/stream_1\/audio-description\?viewer_id=viewer_1/);
});

test('http model provider uses configured HTTP endpoints', async () => {
  resetStore();
  const originalFetch = globalThis.fetch;
  const endpoints = [];
  globalThis.fetch = async (url, options = {}) => {
    const asString = String(url);
    endpoints.push(asString);
    const body = JSON.parse(options.body || '{}');

    if (asString.endsWith('/v1/models/perception')) {
      return {
        ok: true,
        async json() {
          return {
            transcript: body.timelineItem.transcript,
            scene: body.timelineItem.scene,
            speaker: body.timelineItem.speaker,
            entities: body.timelineItem.entities,
            source_refs: ['vision:http'],
            confidence: 0.82
          };
        }
      };
    }

    if (asString.endsWith('/v1/models/accessibility')) {
      return {
        ok: true,
        async json() {
          return {
            segment_id: body.timelineItem.id,
            ts_start: body.timelineItem.ts_start,
            ts_end: body.timelineItem.ts_end,
            type: 'action',
            text: body.perception.transcript,
            speaker: body.perception.speaker,
            entities: body.perception.entities,
            confidence: body.perception.confidence,
            source_refs: body.perception.source_refs,
            audio_description: body.perception.scene
          };
        }
      };
    }

    if (asString.endsWith('/v1/models/sign-script')) {
      return {
        ok: true,
        async json() {
          return {
            id: body.accessibility.segment_id,
            start: body.accessibility.ts_start,
            end: body.accessibility.ts_end,
            gloss_tokens: ['GOAL', 'SCORE'],
            facial_cues: ['INTENSE-FOCUS'],
            confidence: body.accessibility.confidence,
            fallback_text: body.accessibility.text
          };
        }
      };
    }

    return {
      ok: false,
      status: 404,
      async json() {
        return { error: 'not found' };
      }
    };
  };

  try {
    const stream = streamingService.createStream({
      name: 'HTTP Provider Stream',
      model_provider: 'http'
    });

    const started = await streamingService.startStream(stream.id, {
      protocol: 'rtmp',
      source_url: 'rtmp://encoder.local/live/http',
      model_provider: 'http',
      model_base_url: 'http://model-gateway.local',
      mock_timeline: [
        {
          transcript: 'The striker takes a shot and scores.',
          scene: 'Close-up goal celebration',
          speaker: 'commentator',
          entities: ['striker']
        }
      ]
    });

    assert.equal(started.generated.provider, 'http');
    assert.equal(endpoints.some((item) => item.endsWith('/v1/models/perception')), true);
    assert.equal(endpoints.some((item) => item.endsWith('/v1/models/accessibility')), true);
    assert.equal(endpoints.some((item) => item.endsWith('/v1/models/sign-script')), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sdk cjs export is loadable', () => {
  const cjs = require('../sdk/js/index.cjs');
  assert.equal(typeof cjs.AccessibilityClient, 'function');
});
