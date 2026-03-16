function escapeHtml(value) {
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
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Accessibility Viewer</title>
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
      .qr {
        width: 108px;
        height: 108px;
        border-radius: 8px;
        border: 1px solid #2f5379;
        background: #fff;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Accessibility Viewer</h1>
      <p class="muted">Stream: ${safeStreamId}</p>
      <p class="muted">Viewer Profile: ${safeViewerId || 'none'}</p>
      <div class="panel feedbackRow">
        <div>
          <span class="pill">Feedback</span>
          <p class="muted">Spot a caption/sign/audio issue? Share feedback now.</p>
          <a class="feedbackLink" id="feedbackLink" href="${escapeHtml(feedbackHref)}" target="_blank" rel="noopener">Open feedback form</a>
        </div>
        <img id="feedbackQr" class="qr" alt="Feedback QR code" />
      </div>
      <div class="panel">
        <span class="pill">Live Captions</span>
        <pre id="captions">Loading...</pre>
      </div>
      <div class="panel">
        <span class="pill">ASL Sign Script</span>
        <pre id="signScript">Loading...</pre>
      </div>
      <div class="panel">
        <span class="pill">Audio Description</span>
        <pre id="audio">Loading...</pre>
      </div>
    </div>
    <script>
      const streamId = ${JSON.stringify(streamId)};
      const viewerId = ${JSON.stringify(viewerId || '')};
      const feedbackPath = ${JSON.stringify(feedbackHref)};
      const feedbackUrl = window.location.origin + feedbackPath;
      const viewerQuery = viewerId ? ('?viewer_id=' + encodeURIComponent(viewerId)) : '';

      const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=216x216&data=' + encodeURIComponent(feedbackUrl);
      document.getElementById('feedbackQr').src = qrUrl;
      document.getElementById('feedbackLink').href = feedbackUrl;

      const captionLines = [];
      const audioLines = [];
      const signLines = [];

      function renderPanels() {
        document.getElementById('captions').textContent = captionLines.join('\n') || 'Waiting for captions...';
        document.getElementById('signScript').textContent = signLines.join('\n') || 'Waiting for sign-script segments...';
        document.getElementById('audio').textContent = audioLines.join('\n') || 'Waiting for audio-description segments...';
      }

      async function initialLoad() {
        const [captions, signOverlay, audio] = await Promise.all([
          fetch('/v1/streams/' + streamId + '/captions' + viewerQuery).then((r) => r.json()),
          fetch('/v1/streams/' + streamId + '/sign-overlay' + viewerQuery).then((r) => r.json()),
          fetch('/v1/streams/' + streamId + '/audio-description' + viewerQuery).then((r) => r.json())
        ]);
        captions.captions.forEach((s) => captionLines.push('[' + s.start + '] ' + s.text));
        signOverlay.segments.forEach((s) => signLines.push('[' + s.start + '] ' + s.gloss_tokens.join(' ')));
        audio.segments.forEach((s) => audioLines.push('[' + s.start + '] ' + s.text));
        renderPanels();
      }

      const sse = new EventSource('/v1/streams/' + streamId + '/events/stream');
      sse.onmessage = function (e) {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'segment') {
            captionLines.push('[' + data.segment.start + '] ' + data.segment.text);
            audioLines.push('[' + data.audio_description.start + '] ' + data.audio_description.text);
            if (data.sign && data.sign.gloss_tokens) {
              signLines.push('[' + data.sign.start + '] ' + data.sign.gloss_tokens.join(' '));
            }
            renderPanels();
          } else if (data.type === 'stream.stopped') {
            document.getElementById('captions').textContent += '\n[stream stopped]';
            sse.close();
          }
        } catch (_) {}
      };
      sse.onerror = function () {
        if (!captionLines.length) {
          document.getElementById('captions').textContent = 'SSE connection error. Falling back to snapshot.';
          initialLoad().catch((err) => {
            document.getElementById('captions').textContent = err.message;
          });
          sse.close();
        }
      };

      initialLoad().catch(() => {});
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
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Accessibility Feedback</title>
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
      textarea { min-height: 120px; }
      button {
        margin-top: 14px;
        background: #1e80a6;
        border: 0;
        cursor: pointer;
      }
      .ok { color: #74ffa8; }
      .err { color: #ff9f9f; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>Accessibility Feedback</h1>
      <p>Stream <strong>${safeStreamId}</strong> · Source <strong>${safeSource}</strong> · Ad Session <strong>${safeAdSessionId || 'N/A'}</strong> · Viewer <strong>${safeViewerId || 'N/A'}</strong></p>
      <form id="feedbackForm">
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

        <label for="message">Feedback</label>
        <textarea id="message" name="message" required placeholder="Tell us what happened and when."></textarea>

        <label for="contact">Contact (optional)</label>
        <input id="contact" name="contact" placeholder="email or phone" />

        <button type="submit">Send feedback</button>
      </form>
      <p id="status"></p>
    </div>

    <script>
      const streamId = ${JSON.stringify(streamId || '')};
      const source = ${JSON.stringify(source || 'viewer')};
      const adSessionId = ${JSON.stringify(adSessionId || '')};
      const viewerId = ${JSON.stringify(viewerId || '')};
      const form = document.getElementById('feedbackForm');
      const status = document.getElementById('status');

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        status.className = '';
        status.textContent = 'Submitting...';

        const payload = {
          stream_id: streamId,
          ad_session_id: adSessionId || undefined,
          viewer_id: viewerId || undefined,
          source,
          rating: form.rating.value || undefined,
          issue_type: form.issue_type.value,
          impairment_type: form.impairment_type.value,
          message: form.message.value,
          contact: form.contact.value || undefined
        };

        try {
          const response = await fetch('/v1/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Failed to submit feedback');

          status.className = 'ok';
          status.textContent = 'Thank you. Your feedback was submitted.';
          form.reset();
        } catch (error) {
          status.className = 'err';
          status.textContent = error.message;
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
    panel.innerHTML = '<strong>Accessibility Agent</strong><div id="a11y-overlay-caption">Connecting...</div><div style="margin-top:8px;"><a id="a11y-feedback-link" style="color:#8fe7ff;" target="_blank" rel="noopener">Feedback</a></div>';
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
