import { jsonForScript } from '../utils/security.js';

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function feedbackPath(streamId, source = 'viewer', viewerId = '', adSessionId = '') {
  const qs = new URLSearchParams({ streamId, source });
  if (viewerId) qs.set('viewerId', viewerId);
  if (adSessionId) qs.set('adSessionId', adSessionId);
  return `/feedback?${qs.toString()}`;
}

export const streamingUiService = {
  buildViewerPage(streamId, viewerId = '') {
    const safeStreamId = escapeHtml(streamId);
    const safeViewerId = escapeHtml(viewerId || '');
    const feedbackHref = feedbackPath(streamId, 'viewer', viewerId);

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Accessibility Viewer — Stream ${safeStreamId}</title>
    <style>
      :root {
        --bg: #07111f;
        --card: #12243f;
        --accent: #5bd7ff;
        --text: #f7fbff;
      }
      body {
        margin: 0;
        font-family: "IBM Plex Sans", "Avenir Next", sans-serif;
        background: radial-gradient(circle at top, #16345c, var(--bg));
        color: var(--text);
      }
      .container {
        max-width: 960px;
        margin: 0 auto;
        padding: 24px;
      }
      .panel {
        background: color-mix(in oklab, var(--card) 85%, black);
        border-radius: 14px;
        padding: 16px;
        margin-bottom: 16px;
      }
      h1 {
        margin: 0 0 12px;
        letter-spacing: 0.02em;
      }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
        margin: 0;
        color: #d7f4ff;
      }
      .muted { opacity: 0.75; }
      .pill {
        display: inline-block;
        border: 1px solid #2f5379;
        border-radius: 999px;
        padding: 4px 10px;
        margin-right: 8px;
      }
      .feedbackRow {
        display: flex;
        gap: 12px;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
      }
      .feedbackLink {
        color: #8fe7ff;
      }
      .feedbackLink:focus { outline: 2px solid #5bd7ff; outline-offset: 2px; }
      .qr {
        width: 108px;
        height: 108px;
        border-radius: 8px;
        border: 1px solid #2f5379;
        background: #fff;
      }
      .sign-overlay {
        --sign-bg: #1a1a2e;
        --sign-bg-opacity: 0.85;
        --sign-primary: #5bd7ff;
        --sign-secondary: #ffffff;
        --sign-accent: #74ffa8;
        --sign-text: #f7fbff;
        --sign-token-bg: #12243f;
        --sign-font: "IBM Plex Mono", monospace;
        --sign-font-weight: 400;
        --sign-font-size: 1rem;
        background: var(--sign-bg);
        opacity: var(--sign-bg-opacity);
        border-radius: 14px;
        padding: 16px;
        margin-bottom: 16px;
        color: var(--sign-text);
        font-family: var(--sign-font);
        font-weight: var(--sign-font-weight);
        font-size: var(--sign-font-size);
        min-height: 80px;
      }
      .sign-overlay.bg-gradient {
        background: linear-gradient(135deg, var(--sign-bg), color-mix(in oklab, var(--sign-bg) 60%, black));
      }
      .sign-overlay.bg-textured {
        background: var(--sign-bg);
        background-image: repeating-linear-gradient(
          45deg, transparent, transparent 8px,
          rgba(0,0,0,0.03) 8px, rgba(0,0,0,0.03) 16px
        );
      }
      .sign-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
        flex-wrap: wrap;
        gap: 8px;
      }
      .theme-select {
        background: rgba(0,0,0,0.3);
        color: inherit;
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 8px;
        padding: 4px 8px;
        font: inherit;
        font-size: 0.85rem;
        cursor: pointer;
      }
      .theme-select:focus { outline: 2px solid #5bd7ff; outline-offset: 2px; }
      .sign-segments {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .sign-segments.layout-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 10px;
      }
      .sign-segments.layout-inline {
        flex-direction: row;
        flex-wrap: wrap;
        gap: 6px;
      }
      .sign-segment {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: baseline;
      }
      .sign-segment .ts {
        font-size: 0.75em;
        opacity: 0.5;
        min-width: 60px;
      }
      .sign-token {
        display: inline-block;
        background: var(--sign-token-bg);
        color: var(--sign-primary);
        padding: 3px 8px;
        border-radius: 6px;
        font-weight: var(--sign-font-weight);
        letter-spacing: 0.04em;
      }
      .sign-facial-cue {
        font-size: 0.7em;
        color: var(--sign-accent);
        opacity: 0.8;
        margin-left: 4px;
      }
      .sign-empty {
        opacity: 0.5;
        font-style: italic;
      }
      .error-banner {
        background: rgba(255,100,100,0.15);
        border: 1px solid rgba(255,100,100,0.3);
        border-radius: 10px;
        padding: 14px;
        margin-bottom: 16px;
        color: #ff9f9f;
      }
      .error-banner button {
        background: #1e80a6;
        color: #f4fbff;
        border: none;
        padding: 6px 14px;
        border-radius: 6px;
        cursor: pointer;
        margin-top: 8px;
        font: inherit;
        font-size: 0.85rem;
      }
      .error-banner button:focus { outline: 2px solid #5bd7ff; outline-offset: 2px; }
      .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.2);
        border-top-color: #5bd7ff; border-radius: 50%; animation: spin .6s linear infinite; vertical-align: middle; margin-right: 6px; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .conn-status { font-size: 0.8rem; opacity: 0.6; }

      @media (max-width: 768px) {
        .container { padding: 16px; }
        .panel { padding: 12px; }
        .feedbackRow { flex-direction: column; align-items: flex-start; }
        .qr { width: 80px; height: 80px; }
      }
      @media (max-width: 480px) {
        h1 { font-size: 1.2rem; }
        .container { padding: 12px; }
        .panel { padding: 10px; border-radius: 10px; }
        .sign-overlay { padding: 10px; border-radius: 10px; }
        .sign-segments.layout-grid { grid-template-columns: 1fr; }
      }
      @media (prefers-reduced-motion: reduce) {
        .spinner { animation: none; }
      }
    </style>
  </head>
  <body>
    <a href="#captions" class="muted" style="position:absolute;left:-9999px;focus:position:static;">Skip to captions</a>
    <main class="container">
      <h1>Accessibility Viewer</h1>
      <p class="muted">Stream: ${safeStreamId}</p>
      <p class="muted">Viewer Profile: ${safeViewerId || 'none'}</p>
      <div id="error-region" role="alert" aria-live="assertive"></div>
      <div class="panel feedbackRow">
        <div>
          <span class="pill">Feedback</span>
          <p class="muted">Spot a caption/sign/audio issue? Share feedback now.</p>
          <a class="feedbackLink" id="feedbackLink" href="${escapeHtml(feedbackHref)}" target="_blank" rel="noopener">Open feedback form (opens in new tab)</a>
        </div>
        <img id="feedbackQr" class="qr" alt="QR code linking to feedback form for this stream" />
      </div>
      <div class="panel" role="region" aria-label="Live captions">
        <span class="pill">Live Captions</span>
        <span id="conn-status" class="conn-status" aria-live="polite"></span>
        <pre id="captions" aria-live="polite" aria-atomic="false"><span class="spinner"></span> Loading captions...</pre>
      </div>
      <div class="sign-overlay" id="signOverlay" role="region" aria-label="Sign language overlay">
        <div class="sign-header">
          <span class="pill">Sign Language</span>
          <label for="themeSelect" class="muted" style="font-size:0.8rem">Theme:</label>
          <select class="theme-select" id="themeSelect" aria-label="Sign overlay theme"></select>
        </div>
        <div class="sign-segments" id="signSegments" aria-live="polite">
          <span class="sign-empty">Waiting for sign-script segments...</span>
        </div>
      </div>
      <div class="panel" role="region" aria-label="Audio description">
        <span class="pill">Audio Description</span>
        <pre id="audio" aria-live="polite" aria-atomic="false"><span class="spinner"></span> Loading audio descriptions...</pre>
      </div>
    </main>
    <script>
      var streamId = ${jsonForScript(streamId)};
      var viewerId = ${jsonForScript(viewerId || '')};
      var feedbackPathVal = ${jsonForScript(feedbackHref)};
      var feedbackUrl = window.location.origin + feedbackPathVal;
      var viewerQuery = viewerId ? ('?viewer_id=' + encodeURIComponent(viewerId)) : '';

      var qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=216x216&data=' + encodeURIComponent(feedbackUrl);
      document.getElementById('feedbackQr').src = qrUrl;
      document.getElementById('feedbackLink').href = feedbackUrl;

      var captionLines = [];
      var audioLines = [];
      var allThemes = [];
      var sizeMap = { small: '280px', medium: '360px', large: '480px' };
      var errorRegion = document.getElementById('error-region');
      var connStatus = document.getElementById('conn-status');

      function showError(msg) {
        errorRegion.innerHTML = '<div class="error-banner">' + msg +
          '<br><button onclick="location.reload()">Reload page</button></div>';
      }

      function applyTheme(theme) {
        var overlay = document.getElementById('signOverlay');
        var segments = document.getElementById('signSegments');
        overlay.style.setProperty('--sign-bg', theme.background.color);
        overlay.style.setProperty('--sign-bg-opacity', theme.background.opacity);
        overlay.style.setProperty('--sign-primary', theme.palette.primary);
        overlay.style.setProperty('--sign-secondary', theme.palette.secondary);
        overlay.style.setProperty('--sign-accent', theme.palette.accent);
        overlay.style.setProperty('--sign-text', theme.palette.text);
        overlay.style.setProperty('--sign-token-bg', theme.palette.token_bg);
        overlay.style.setProperty('--sign-font', theme.font.family);
        overlay.style.setProperty('--sign-font-weight', theme.font.weight);
        overlay.style.setProperty('--sign-font-size', (theme.font.size_scale * 1) + 'rem');
        overlay.style.maxWidth = sizeMap[theme.size] || sizeMap.small;
        overlay.className = 'sign-overlay' + (theme.background.style === 'gradient' ? ' bg-gradient' : theme.background.style === 'textured' ? ' bg-textured' : '');
        segments.className = 'sign-segments' + (theme.layout === 'grid' ? ' layout-grid' : theme.layout === 'inline' ? ' layout-inline' : '');
      }

      function renderSignSegment(segment) {
        var el = document.createElement('div');
        el.className = 'sign-segment';
        var ts = document.createElement('span');
        ts.className = 'ts';
        ts.textContent = segment.start || '';
        el.appendChild(ts);
        var tokens = segment.gloss_tokens || [];
        tokens.forEach(function (token) {
          var t = document.createElement('span');
          t.className = 'sign-token';
          t.textContent = token;
          el.appendChild(t);
        });
        if (segment.facial_cues && segment.facial_cues.length) {
          var cue = document.createElement('span');
          cue.className = 'sign-facial-cue';
          cue.textContent = segment.facial_cues.join(' ');
          el.appendChild(cue);
        }
        return el;
      }

      function clearSignEmpty() {
        var empty = document.querySelector('.sign-empty');
        if (empty) empty.remove();
      }

      function renderCaptionsAndAudio() {
        document.getElementById('captions').textContent = captionLines.join('\\n') || 'Waiting for captions...';
        document.getElementById('audio').textContent = audioLines.join('\\n') || 'Waiting for audio-description segments...';
      }

      async function loadThemes() {
        try {
          var res = await fetch('/v1/sign-overlay-themes');
          var data = await res.json();
          allThemes = data.themes || [];
          var select = document.getElementById('themeSelect');
          allThemes.forEach(function (theme) {
            var opt = document.createElement('option');
            opt.value = theme.id;
            opt.textContent = theme.name;
            if (theme.accessibility_notes) opt.title = theme.accessibility_notes;
            select.appendChild(opt);
          });
        } catch (_) {}
      }

      async function initialLoad() {
        try {
          var results = await Promise.all([
            fetch('/v1/streams/' + streamId + '/captions' + viewerQuery).then(function (r) { if (!r.ok) throw new Error('Failed to load captions'); return r.json(); }),
            fetch('/v1/streams/' + streamId + '/sign-overlay' + viewerQuery).then(function (r) { if (!r.ok) throw new Error('Failed to load sign overlay'); return r.json(); }),
            fetch('/v1/streams/' + streamId + '/audio-description' + viewerQuery).then(function (r) { if (!r.ok) throw new Error('Failed to load audio description'); return r.json(); })
          ]);
          var captions = results[0];
          var signOverlay = results[1];
          var audio = results[2];

          captions.captions.forEach(function (s) { captionLines.push('[' + s.start + '] ' + s.text); });
          audio.segments.forEach(function (s) { audioLines.push('[' + s.start + '] ' + s.text); });
          renderCaptionsAndAudio();

          if (signOverlay.theme) {
            applyTheme(signOverlay.theme);
            document.getElementById('themeSelect').value = signOverlay.theme.id;
          }
          if (signOverlay.segments && signOverlay.segments.length) {
            clearSignEmpty();
            var container = document.getElementById('signSegments');
            signOverlay.segments.forEach(function (s) {
              container.appendChild(renderSignSegment(s));
            });
          }
        } catch (err) {
          showError('Could not load stream data: ' + err.message);
        }
      }

      document.getElementById('themeSelect').addEventListener('change', function () {
        var selected = allThemes.find(function (t) { return t.id === this.value; }.bind(this));
        if (selected) applyTheme(selected);
        if (viewerId) {
          fetch('/v1/viewers/' + viewerId + '/preferences', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sign_overlay_theme: this.value })
          }).catch(function () {});
        }
      });

      var sse = new EventSource('/v1/streams/' + streamId + '/events/stream');
      connStatus.textContent = 'Connecting...';
      sse.onopen = function () { connStatus.textContent = 'Live'; };
      sse.onmessage = function (e) {
        try {
          var data = JSON.parse(e.data);
          if (data.type === 'segment') {
            captionLines.push('[' + data.segment.start + '] ' + data.segment.text);
            audioLines.push('[' + data.audio_description.start + '] ' + data.audio_description.text);
            renderCaptionsAndAudio();
            if (data.sign && data.sign.gloss_tokens) {
              clearSignEmpty();
              document.getElementById('signSegments').appendChild(renderSignSegment(data.sign));
            }
          } else if (data.type === 'stream.stopped') {
            document.getElementById('captions').textContent += '\\n[stream stopped]';
            connStatus.textContent = 'Stream ended';
            sse.close();
          }
        } catch (_) {}
      };
      sse.onerror = function () {
        connStatus.textContent = 'Disconnected — using snapshot';
        if (!captionLines.length) {
          document.getElementById('captions').textContent = 'SSE connection error. Falling back to snapshot.';
          initialLoad();
          sse.close();
        }
      };

      loadThemes().then(function () { return initialLoad(); }).catch(function () {});
    </script>
  </body>
</html>`;
  },

  buildFeedbackPage(streamId, source = 'viewer', adSessionId = '', viewerId = '') {
    const safeStreamId = escapeHtml(streamId || '');
    const safeSource = escapeHtml(source || 'viewer');
    const safeAdSessionId = escapeHtml(adSessionId || '');
    const safeViewerId = escapeHtml(viewerId || '');

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Accessibility Feedback — Stream ${safeStreamId}</title>
    <style>
      body {
        margin: 0;
        font-family: "IBM Plex Sans", sans-serif;
        background: #06101d;
        color: #f4fbff;
      }
      .wrap {
        max-width: 640px;
        margin: 0 auto;
        padding: 24px;
      }
      form {
        background: #10213a;
        border-radius: 12px;
        padding: 16px;
      }
      label { display: block; margin: 12px 0 6px; }
      select, input, textarea, button {
        width: 100%;
        box-sizing: border-box;
        border-radius: 8px;
        border: 1px solid #2f5379;
        background: #081628;
        color: #f4fbff;
        padding: 10px;
        font: inherit;
      }
      select:focus, input:focus, textarea:focus { outline: 2px solid #5bd7ff; outline-offset: 1px; border-color: #5bd7ff; }
      textarea { min-height: 120px; resize: vertical; }
      button {
        margin-top: 14px;
        background: #1e80a6;
        border: 0;
        cursor: pointer;
      }
      button:hover { background: #1a6f91; }
      button:focus { outline: 2px solid #5bd7ff; outline-offset: 2px; }
      button:disabled { background: #1a4a62; cursor: not-allowed; opacity: 0.7; }
      .ok { color: #74ffa8; }
      .err { color: #ff9f9f; }
      .field-error { border-color: #ff9f9f !important; }
      .field-error-msg { color: #ff9f9f; font-size: 0.85rem; margin-top: 4px; }
      .required-mark { color: #ff9f9f; }
      .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.2);
        border-top-color: #5bd7ff; border-radius: 50%; animation: spin .6s linear infinite; vertical-align: middle; margin-right: 6px; }
      @keyframes spin { to { transform: rotate(360deg); } }

      @media (max-width: 480px) {
        .wrap { padding: 16px; }
        form { padding: 12px; }
        textarea { min-height: 90px; }
      }
      @media (prefers-reduced-motion: reduce) {
        .spinner { animation: none; }
      }
    </style>
  </head>
  <body>
    <main class="wrap">
      <h1>Accessibility Feedback</h1>
      <p>Stream <strong>${safeStreamId}</strong> · Source <strong>${safeSource}</strong> · Ad Session <strong>${safeAdSessionId || 'N/A'}</strong> · Viewer <strong>${safeViewerId || 'N/A'}</strong></p>
      <form id="feedbackForm" novalidate>
        <label for="rating">Rating (optional)</label>
        <select id="rating" name="rating">
          <option value="">No rating</option>
          <option value="5">5 - Great</option>
          <option value="4">4 - Good</option>
          <option value="3">3 - OK</option>
          <option value="2">2 - Poor</option>
          <option value="1">1 - Unusable</option>
        </select>

        <label for="issue_type">Issue type</label>
        <select id="issue_type" name="issue_type">
          <option value="captions">Captions</option>
          <option value="audio_description">Audio description</option>
          <option value="sign_overlay">Sign overlay</option>
          <option value="latency">Latency</option>
          <option value="translation">Translation quality</option>
          <option value="other">Other</option>
        </select>

        <label for="impairment_type">Impairment type</label>
        <select id="impairment_type" name="impairment_type">
          <option value="deaf">Deaf</option>
          <option value="hard_of_hearing">Hard of hearing</option>
          <option value="blind">Blind</option>
          <option value="low_vision">Low vision</option>
          <option value="deafblind">Deafblind</option>
          <option value="cognitive">Cognitive</option>
          <option value="neurodivergent">Neurodivergent</option>
          <option value="dyslexia">Dyslexia</option>
          <option value="motor_mobility">Motor/Mobility</option>
          <option value="speech_communication">Speech/Communication</option>
          <option value="photosensitive">Photosensitive</option>
          <option value="other">Other</option>
        </select>

        <label for="message">Feedback <span class="required-mark" aria-hidden="true">*</span></label>
        <textarea id="message" name="message" required aria-required="true" placeholder="Tell us what happened and when."></textarea>
        <div id="message-error" class="field-error-msg" role="alert"></div>

        <label for="contact">Contact (optional)</label>
        <input id="contact" name="contact" placeholder="email or phone" autocomplete="email" />

        <button type="submit" id="submit-btn">Send feedback</button>
      </form>
      <p id="status" aria-live="polite"></p>
    </main>

    <script>
      var streamId = ${jsonForScript(streamId || '')};
      var source = ${jsonForScript(source || 'viewer')};
      var adSessionId = ${jsonForScript(adSessionId || '')};
      var viewerId = ${jsonForScript(viewerId || '')};
      var form = document.getElementById('feedbackForm');
      var statusEl = document.getElementById('status');
      var submitBtn = document.getElementById('submit-btn');
      var messageEl = document.getElementById('message');
      var messageErr = document.getElementById('message-error');

      messageEl.addEventListener('input', function() {
        messageEl.classList.remove('field-error');
        messageErr.textContent = '';
      });

      form.addEventListener('submit', async function(event) {
        event.preventDefault();

        if (!messageEl.value.trim()) {
          messageEl.classList.add('field-error');
          messageErr.textContent = 'Please describe the issue.';
          messageEl.focus();
          return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> Sending...';
        statusEl.className = '';
        statusEl.textContent = '';

        var payload = {
          stream_id: streamId,
          ad_session_id: adSessionId || undefined,
          viewer_id: viewerId || undefined,
          source: source,
          rating: form.rating.value || undefined,
          issue_type: form.issue_type.value,
          impairment_type: form.impairment_type.value,
          message: form.message.value,
          contact: form.contact.value || undefined
        };

        try {
          var response = await fetch('/v1/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          var result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Failed to submit feedback');

          statusEl.className = 'ok';
          statusEl.textContent = 'Thank you. Your feedback was submitted.';
          form.reset();
        } catch (error) {
          statusEl.className = 'err';
          statusEl.textContent = 'Error: ' + error.message;
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send feedback';
        }
      });
    </script>
  </body>
</html>`;
  },

  buildOverlayScript() {
    return `(() => {
  function createPanel() {
    const panel = document.createElement('div');
    panel.id = 'a11y-overlay-agent';
    panel.style.position = 'fixed';
    panel.style.right = '16px';
    panel.style.bottom = '16px';
    panel.style.zIndex = '2147483647';
    panel.style.width = '340px';
    panel.style.maxHeight = '40vh';
    panel.style.overflow = 'auto';
    panel.style.borderRadius = '12px';
    panel.style.padding = '12px';
    panel.style.background = 'rgba(4, 12, 22, 0.88)';
    panel.style.color = '#f2f9ff';
    panel.style.fontFamily = 'IBM Plex Sans, sans-serif';
    panel.style.fontSize = '14px';
    panel.style.lineHeight = '1.4';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Accessibility overlay');
    panel.innerHTML = '<strong>Accessibility Agent</strong><div id="a11y-overlay-caption" role="status" aria-live="polite">Connecting...</div><div style="margin-top:8px;"><a id="a11y-feedback-link" style="color:#8fe7ff;" target="_blank" rel="noopener">Feedback (opens in new tab)</a></div>';
    return panel;
  }

  async function boot() {
    const streamId = window.ACCESSIBILITY_STREAM_ID;
    if (!streamId) {
      console.error('Set window.ACCESSIBILITY_STREAM_ID before loading overlay script.');
      return;
    }

    const panel = createPanel();
    document.body.appendChild(panel);
    const target = panel.querySelector('#a11y-overlay-caption');
    const feedbackLink = panel.querySelector('#a11y-feedback-link');
    const adSessionId = window.ACCESSIBILITY_AD_SESSION_ID || '';
    feedbackLink.href = window.location.origin + '/feedback?streamId=' + encodeURIComponent(streamId) + '&source=overlay&adSessionId=' + encodeURIComponent(adSessionId);

    const sse = new EventSource('/v1/streams/' + streamId + '/events/stream');
    sse.onmessage = function (e) {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'segment') {
          target.textContent = data.segment.text;
        } else if (data.type === 'stream.stopped') {
          target.textContent = '[stream ended]';
          sse.close();
        }
      } catch (_) {}
    };
    sse.onerror = function () {
      fetch('/v1/streams/' + streamId + '/captions').then((r) => r.json()).then((payload) => {
        const last = payload.captions[payload.captions.length - 1];
        target.textContent = last ? last.text : 'No captions available yet.';
      }).catch((error) => {
        target.textContent = 'Overlay error: ' + error.message;
      });
      sse.close();
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();`;
  }
};
