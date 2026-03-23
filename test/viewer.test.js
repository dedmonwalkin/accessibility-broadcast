import test from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../src/data/store.js';
import { streamingService } from '../src/services/streamingService.js';
import { viewerPreferencesService } from '../src/services/viewerPreferencesService.js';
import { feedbackService } from '../src/services/feedbackService.js';
import { adIntegrationService } from '../src/services/adIntegrationService.js';

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

test('creates viewer with default preferences', () => {
  resetStore();
  const stream = streamingService.createStream({ name: 'Viewer Test' });
  const viewer = viewerPreferencesService.createViewer({
    stream_id: stream.id,
    display_name: 'Test Viewer'
  });

  assert.ok(viewer.id);
  assert.equal(viewer.display_name, 'Test Viewer');
});

test('creates viewer with custom preferences', () => {
  resetStore();
  const stream = streamingService.createStream({
    name: 'Pref Test',
    output_languages: ['en-US', 'es-ES'],
    sign_languages: ['ASL', 'BSL']
  });
  const viewer = viewerPreferencesService.createViewer({
    stream_id: stream.id,
    preferences: {
      caption_language: 'es-ES',
      caption_style: 'simplified',
      sign_language: 'BSL'
    }
  });

  const result = viewerPreferencesService.getPreferences(viewer.id);
  assert.equal(result.preferences.caption_language, 'es-ES');
  assert.equal(result.preferences.caption_style, 'simplified');
  assert.equal(result.preferences.sign_language, 'BSL');
});

test('updates viewer preferences', () => {
  resetStore();
  const stream = streamingService.createStream({
    name: 'Update Test',
    output_languages: ['en-US', 'fr-FR']
  });
  const viewer = viewerPreferencesService.createViewer({
    stream_id: stream.id,
    preferences: { caption_language: 'en-US' }
  });

  viewerPreferencesService.updatePreferences(viewer.id, {
    caption_language: 'fr-FR',
    audio_description_style: 'detailed'
  });

  const result = viewerPreferencesService.getPreferences(viewer.id);
  assert.equal(result.preferences.caption_language, 'fr-FR');
  assert.equal(result.preferences.audio_description_style, 'detailed');
});

test('submits and queries feedback', async () => {
  resetStore();
  const stream = streamingService.createStream({ name: 'Feedback Test' });
  await streamingService.startStream(stream.id, {
    protocol: 'rtmp',
    source_url: 'rtmp://test/feedback'
  });

  feedbackService.create({
    stream_id: stream.id,
    source: 'viewer',
    rating: 4,
    issue_type: 'captions',
    impairment_type: 'hard_of_hearing',
    message: 'Slight delay in captions'
  });

  feedbackService.create({
    stream_id: stream.id,
    source: 'viewer',
    rating: 5,
    issue_type: 'sign_overlay',
    impairment_type: 'deaf',
    message: 'Great signing'
  });

  const summary = feedbackService.summarizeByStream(stream.id);
  assert.equal(summary.total, 2);
  assert.equal(summary.avg_rating, 4.5);
  assert.equal(summary.by_issue_type.captions, 1);
  assert.equal(summary.by_issue_type.sign_overlay, 1);
});

test('sign_overlay_theme defaults to standard', () => {
  resetStore();
  const stream = streamingService.createStream({ name: 'Theme Default Test' });
  const viewer = viewerPreferencesService.createViewer({ stream_id: stream.id });

  assert.equal(viewer.preferences.sign_overlay_theme, 'standard');
});

test('sign_overlay_theme falls back on invalid value', () => {
  resetStore();
  const stream = streamingService.createStream({ name: 'Theme Fallback Test' });
  const viewer = viewerPreferencesService.createViewer({
    stream_id: stream.id,
    preferences: { sign_overlay_theme: 'nonexistent' }
  });

  assert.equal(viewer.preferences.sign_overlay_theme, 'standard');
});

test('sign_overlay_theme can be updated', () => {
  resetStore();
  const stream = streamingService.createStream({ name: 'Theme Update Test' });
  const viewer = viewerPreferencesService.createViewer({ stream_id: stream.id });

  viewerPreferencesService.updatePreferences(viewer.id, { sign_overlay_theme: 'kids' });

  const result = viewerPreferencesService.getPreferences(viewer.id);
  assert.equal(result.preferences.sign_overlay_theme, 'kids');
});

test('getPreferences includes sign_overlay_themes in supported list', () => {
  resetStore();
  const stream = streamingService.createStream({ name: 'Theme Supported Test' });
  const viewer = viewerPreferencesService.createViewer({ stream_id: stream.id });

  const result = viewerPreferencesService.getPreferences(viewer.id);
  assert.ok(Array.isArray(result.supported.sign_overlay_themes));
  assert.ok(result.supported.sign_overlay_themes.includes('standard'));
  assert.ok(result.supported.sign_overlay_themes.includes('kids'));
  assert.ok(result.supported.sign_overlay_themes.includes('high_contrast'));
});

test('ad session tracking and reporting', async () => {
  resetStore();
  const stream = streamingService.createStream({ name: 'Ad Test' });
  await streamingService.startStream(stream.id, {
    protocol: 'rtmp',
    source_url: 'rtmp://test/ads'
  });

  const session = adIntegrationService.createSession({
    stream_id: stream.id,
    ad_campaign_id: 'campaign_1',
    platform_type: 'web_sdk'
  });

  assert.ok(session.id);

  adIntegrationService.logEvent(session.id, { event_type: 'impression' });
  adIntegrationService.logEvent(session.id, { event_type: 'complete' });

  const report = adIntegrationService.getSessionReport(session.id);
  assert.equal(report.counts.impressions, 1);
  assert.equal(report.counts.completes, 1);
  assert.equal(report.counts.events, 2);
});
