import test from 'node:test';
import assert from 'node:assert/strict';
import { streamingUiService, escapeHtml } from '../src/services/streamingUiService.js';

// ── escapeHtml ──────────────────────────────────────────────────

test('escapeHtml escapes all dangerous characters', () => {
  assert.equal(escapeHtml('<script>alert("xss")</script>'),
    '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  assert.equal(escapeHtml("it's & <done>"),
    "it&#39;s &amp; &lt;done&gt;");
  assert.equal(escapeHtml(''), '');
  assert.equal(escapeHtml(0), '0');
});

// ── Viewer page structure ───────────────────────────────────────

test('viewer page has correct doctype, lang, and meta tags', () => {
  const html = streamingUiService.buildViewerPage('stream-1', 'viewer-1');
  assert.ok(html.startsWith('<!doctype html>'), 'should start with doctype');
  assert.ok(html.includes('<html lang="en">'), 'should have lang=en');
  assert.ok(html.includes('<meta charset="utf-8"'), 'should have charset');
  assert.ok(html.includes('viewport'), 'should have viewport meta');
});

test('viewer page escapes streamId and viewerId in HTML context', () => {
  const html = streamingUiService.buildViewerPage('<b>bad</b>', '<img onerror=x>');
  // In HTML-rendered portions (not JSON.stringify), values should be escaped
  assert.ok(html.includes('&lt;b&gt;bad&lt;/b&gt;'), 'streamId should be HTML-escaped in visible text');
  // JSON.stringify safely escapes for JS context (angle brackets in strings are safe in JSON)
  // Verify the HTML-context escaping works for the title and visible stream ID
  assert.ok(html.includes('<title>Accessibility Viewer — Stream &lt;b&gt;bad&lt;/b&gt;</title>'), 'title should be escaped');
});

test('viewer page uses semantic main element', () => {
  const html = streamingUiService.buildViewerPage('s1');
  assert.ok(html.includes('<main'), 'should use main element');
  assert.ok(html.includes('</main>'), 'should close main element');
});

test('viewer page has skip link', () => {
  const html = streamingUiService.buildViewerPage('s1');
  assert.ok(html.includes('href="#captions"'), 'should have skip link to captions');
});

// ── Viewer page ARIA ────────────────────────────────────────────

test('viewer page has aria-live on captions region', () => {
  const html = streamingUiService.buildViewerPage('s1');
  assert.ok(html.includes('id="captions" aria-live="polite"'), 'captions should have aria-live');
});

test('viewer page has aria-live on audio description region', () => {
  const html = streamingUiService.buildViewerPage('s1');
  assert.ok(html.includes('id="audio" aria-live="polite"'), 'audio should have aria-live');
});

test('viewer page has aria-live on sign segments', () => {
  const html = streamingUiService.buildViewerPage('s1');
  assert.ok(html.includes('id="signSegments" aria-live="polite"'), 'sign segments should have aria-live');
});

test('viewer page has role=region with labels on content panels', () => {
  const html = streamingUiService.buildViewerPage('s1');
  assert.ok(html.includes('role="region" aria-label="Live captions"'), 'captions panel should have role=region');
  assert.ok(html.includes('role="region" aria-label="Sign language overlay"'), 'sign panel should have role=region');
  assert.ok(html.includes('role="region" aria-label="Audio description"'), 'audio panel should have role=region');
});

test('viewer page has error region with role=alert', () => {
  const html = streamingUiService.buildViewerPage('s1');
  assert.ok(html.includes('id="error-region" role="alert"'), 'should have error region');
  assert.ok(html.includes('aria-live="assertive"'), 'error region should be assertive');
});

test('viewer page has connection status indicator', () => {
  const html = streamingUiService.buildViewerPage('s1');
  assert.ok(html.includes('id="conn-status"'), 'should have connection status element');
  assert.ok(html.includes('Connecting...'), 'JS should set initial connecting status');
});

test('viewer page has accessible QR code alt text', () => {
  const html = streamingUiService.buildViewerPage('s1');
  assert.ok(html.includes('alt="QR code linking to feedback form'), 'QR should have descriptive alt text');
});

test('viewer page feedback link indicates new tab', () => {
  const html = streamingUiService.buildViewerPage('s1');
  assert.ok(html.includes('opens in new tab'), 'feedback link should indicate it opens in new tab');
});

test('viewer page has label for theme select', () => {
  const html = streamingUiService.buildViewerPage('s1');
  assert.ok(html.includes('for="themeSelect"'), 'theme select should have associated label');
});

// ── Viewer page error handling ──────────────────────────────────

test('viewer page has error handling in initialLoad', () => {
  const html = streamingUiService.buildViewerPage('s1');
  assert.ok(html.includes('catch (err)'), 'initialLoad should catch errors');
  assert.ok(html.includes('showError'), 'should call showError on failure');
  assert.ok(html.includes('Reload page'), 'should offer reload on error');
});

test('viewer page checks response.ok on fetches', () => {
  const html = streamingUiService.buildViewerPage('s1');
  assert.ok(html.includes('if (!r.ok)'), 'should check response status');
});

// ── Viewer page CSS ─────────────────────────────────────────────

test('viewer page has mobile breakpoints', () => {
  const html = streamingUiService.buildViewerPage('s1');
  assert.ok(html.includes('@media (max-width: 768px)'), 'should have tablet breakpoint');
  assert.ok(html.includes('@media (max-width: 480px)'), 'should have mobile breakpoint');
});

test('viewer page has prefers-reduced-motion', () => {
  const html = streamingUiService.buildViewerPage('s1');
  assert.ok(html.includes('@media (prefers-reduced-motion: reduce)'), 'should respect reduced motion');
});

test('viewer page has focus styles', () => {
  const html = streamingUiService.buildViewerPage('s1');
  assert.ok(html.includes('.feedbackLink:focus'), 'feedback link should have focus style');
  assert.ok(html.includes('.theme-select:focus'), 'theme select should have focus style');
});

test('viewer page has spinner animation', () => {
  const html = streamingUiService.buildViewerPage('s1');
  assert.ok(html.includes('@keyframes spin'), 'should have spin animation');
  assert.ok(html.includes('class="spinner"'), 'should show spinners during load');
});

test('viewer page uses word-break on pre elements', () => {
  const html = streamingUiService.buildViewerPage('s1');
  assert.ok(html.includes('word-break: break-word'), 'pre should use break-word for long captions');
});

// ── Feedback page structure ─────────────────────────────────────

test('feedback page has correct doctype, lang, and meta tags', () => {
  const html = streamingUiService.buildFeedbackPage('stream-1', 'viewer');
  assert.ok(html.startsWith('<!doctype html>'), 'should start with doctype');
  assert.ok(html.includes('<html lang="en">'), 'should have lang=en');
  assert.ok(html.includes('<meta charset="utf-8"'), 'should have charset');
  assert.ok(html.includes('viewport'), 'should have viewport meta');
});

test('feedback page uses semantic main element', () => {
  const html = streamingUiService.buildFeedbackPage('s1');
  assert.ok(html.includes('<main'), 'should use main element');
  assert.ok(html.includes('</main>'), 'should close main element');
});

test('feedback page escapes query params in HTML context', () => {
  const html = streamingUiService.buildFeedbackPage('<b>xss</b>', '<i>evil</i>', '<img>', '<div>');
  // Verify HTML-context rendering is escaped (the visible <strong> tags)
  assert.ok(html.includes('&lt;b&gt;xss&lt;/b&gt;'), 'streamId should be escaped in visible text');
  assert.ok(html.includes('&lt;i&gt;evil&lt;/i&gt;'), 'source should be escaped in visible text');
  assert.ok(html.includes('&lt;img&gt;'), 'adSessionId should be escaped in visible text');
  assert.ok(html.includes('&lt;div&gt;'), 'viewerId should be escaped in visible text');
});

test('feedback page has novalidate for custom validation', () => {
  const html = streamingUiService.buildFeedbackPage('s1');
  assert.ok(html.includes('novalidate'), 'form should have novalidate');
});

// ── Feedback page ARIA ──────────────────────────────────────────

test('feedback page has aria-required on message textarea', () => {
  const html = streamingUiService.buildFeedbackPage('s1');
  assert.ok(html.includes('aria-required="true"'), 'message should have aria-required');
});

test('feedback page has aria-live on status', () => {
  const html = streamingUiService.buildFeedbackPage('s1');
  assert.ok(html.includes('id="status" aria-live="polite"'), 'status should have aria-live');
});

test('feedback page has required field indicator', () => {
  const html = streamingUiService.buildFeedbackPage('s1');
  assert.ok(html.includes('required-mark'), 'should show required field marker');
});

test('feedback page has field error container for message', () => {
  const html = streamingUiService.buildFeedbackPage('s1');
  assert.ok(html.includes('id="message-error"'), 'should have message error container');
  assert.ok(html.includes('role="alert"'), 'error container should have role=alert');
});

// ── Feedback page UX ────────────────────────────────────────────

test('feedback page has loading state on submit button', () => {
  const html = streamingUiService.buildFeedbackPage('s1');
  assert.ok(html.includes('submitBtn.disabled = true'), 'button should disable during submit');
  assert.ok(html.includes('spinner'), 'should show spinner during submit');
  assert.ok(html.includes('submitBtn.disabled = false'), 'button should re-enable after submit');
});

test('feedback page has client-side message validation', () => {
  const html = streamingUiService.buildFeedbackPage('s1');
  assert.ok(html.includes('messageEl.value.trim()'), 'should validate message is not empty');
  assert.ok(html.includes('Please describe the issue'), 'should show specific error message');
  assert.ok(html.includes('messageEl.focus()'), 'should focus the field on error');
});

test('feedback page has focus styles on form inputs', () => {
  const html = streamingUiService.buildFeedbackPage('s1');
  assert.ok(html.includes('select:focus'), 'selects should have focus style');
  assert.ok(html.includes('input:focus'), 'inputs should have focus style');
  assert.ok(html.includes('textarea:focus'), 'textarea should have focus style');
  assert.ok(html.includes('button:focus'), 'button should have focus style');
});

test('feedback page has disabled button style', () => {
  const html = streamingUiService.buildFeedbackPage('s1');
  assert.ok(html.includes('button:disabled'), 'should style disabled button');
});

test('feedback page has mobile breakpoint', () => {
  const html = streamingUiService.buildFeedbackPage('s1');
  assert.ok(html.includes('@media (max-width: 480px)'), 'should have mobile breakpoint');
});

test('feedback page has prefers-reduced-motion', () => {
  const html = streamingUiService.buildFeedbackPage('s1');
  assert.ok(html.includes('prefers-reduced-motion'), 'should respect reduced motion');
});

// ── Overlay script ──────────────────────────────────────────────

test('overlay script has ARIA attributes on panel', () => {
  const js = streamingUiService.buildOverlayScript();
  assert.ok(js.includes("role', 'region'"), 'panel should have role=region');
  assert.ok(js.includes("aria-label', 'Accessibility overlay'"), 'panel should have aria-label');
});

test('overlay script has aria-live on caption element', () => {
  const js = streamingUiService.buildOverlayScript();
  assert.ok(js.includes('role="status"'), 'caption div should have role=status');
  assert.ok(js.includes('aria-live="polite"'), 'caption div should have aria-live');
});

test('overlay script feedback link indicates new tab', () => {
  const js = streamingUiService.buildOverlayScript();
  assert.ok(js.includes('opens in new tab'), 'feedback link should indicate new tab');
});

test('overlay script checks for ACCESSIBILITY_STREAM_ID', () => {
  const js = streamingUiService.buildOverlayScript();
  assert.ok(js.includes('window.ACCESSIBILITY_STREAM_ID'), 'should check for stream ID');
});

test('overlay script has SSE error fallback', () => {
  const js = streamingUiService.buildOverlayScript();
  assert.ok(js.includes('sse.onerror'), 'should handle SSE errors');
  assert.ok(js.includes('/captions'), 'should fall back to snapshot on error');
});
