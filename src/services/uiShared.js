// Shared UI primitives: OG meta, favicon, footer, base styles, error page,
// landing page. Ported from sibling project accessibility-lite and adapted
// for the broadcast (live) context.

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export const FAVICON_SVG = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#07111f"/><circle cx="16" cy="14" r="7" fill="none" stroke="#5bd7ff" stroke-width="2"/><path d="M10 22c0-3.3 2.7-6 6-6s6 2.7 6 6" fill="none" stroke="#74ffa8" stroke-width="2" stroke-linecap="round"/><rect x="6" y="26" width="20" height="2" rx="1" fill="#5bd7ff" opacity="0.5"/></svg>')}`;

export const OG_META = `
    <meta property="og:title" content="Accessibility Broadcast — Live captions, audio descriptions, and sign overlays" />
    <meta property="og:description" content="Open source real-time accessibility pipeline for live broadcasts and streams. Captions, audio descriptions, and sign language overlays delivered via SSE." />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="Accessibility Broadcast" />
    <meta name="twitter:description" content="Real-time captions, audio descriptions, and sign language overlays for live streams. Apache-2.0, self-hostable." />
    <meta name="description" content="Open source real-time accessibility pipeline for live broadcasts and streams. Captions, audio descriptions, and sign language overlays." />
    <link rel="icon" type="image/svg+xml" href="${FAVICON_SVG}" />`;

export const FOOTER_HTML = `
  <footer style="border-top:1px solid #1a2d4a;margin-top:48px;padding:24px;text-align:center;color:var(--muted);font-size:0.85rem">
    <p style="margin:0 0 8px">Built with purpose by <a href="https://github.com/dedmonwalkin" style="color:var(--accent);text-decoration:none">Isabella &amp; Tan</a></p>
    <p style="margin:0 0 8px">
      <a href="https://github.com/dedmonwalkin/accessibility-broadcast" style="color:var(--accent);text-decoration:none;margin-right:16px">GitHub</a>
      <span style="opacity:0.5">Open Source &middot; Apache-2.0</span>
    </p>
    <p style="margin:0;font-size:0.8rem;opacity:0.6">Making live media accessible for everyone.</p>
  </footer>`;

export const SHARED_STYLES = `
  :root {
    --bg: #07111f;
    --card: #12243f;
    --accent: #5bd7ff;
    --accent-hover: #3bc4f0;
    --text: #f7fbff;
    --muted: #8ba4c4;
    --success: #74ffa8;
    --error: #ff9f9f;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "IBM Plex Sans", "Avenir Next", system-ui, sans-serif;
    background: radial-gradient(circle at top, #16345c, var(--bg));
    color: var(--text);
    min-height: 100vh;
  }
  .container { max-width: 720px; margin: 0 auto; padding: 32px 24px; }
  h1 { margin: 0 0 8px; letter-spacing: 0.02em; }
  .subtitle { color: var(--muted); margin: 0 0 24px; }
  .panel {
    background: color-mix(in oklab, var(--card) 85%, black);
    border-radius: 14px;
    padding: 20px;
    margin-bottom: 16px;
  }
  .btn {
    display: inline-block;
    margin-top: 20px;
    padding: 12px 28px;
    background: var(--accent);
    color: #07111f;
    border: 0;
    border-radius: 10px;
    font: inherit;
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    transition: background 0.2s;
    text-decoration: none;
  }
  .btn:hover { background: var(--accent-hover); }
  .btn-outline {
    display: inline-block;
    margin-top: 20px;
    padding: 12px 28px;
    background: transparent;
    color: var(--accent);
    border: 2px solid var(--accent);
    border-radius: 10px;
    font: inherit;
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
    text-decoration: none;
  }
  .btn-outline:hover { background: rgba(91, 215, 255, 0.1); }
  .muted { color: var(--muted); }
  .pill {
    display: inline-block;
    border: 1px solid #2f5379;
    border-radius: 999px;
    padding: 4px 10px;
    margin-right: 8px;
    font-size: 0.85rem;
  }
  a { color: var(--accent); }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  @media (max-width: 768px) {
    .container { padding: 24px 16px; }
    .panel { padding: 16px; }
  }
  @media (max-width: 480px) {
    .container { padding: 16px 12px; }
    h1 { font-size: 1.3rem; }
    .btn, .btn-outline { width: 100%; text-align: center; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
`;

export function buildErrorPage(statusCode, title, message, { autoRefresh = 0 } = {}) {
  const refreshTag = autoRefresh > 0 ? `<meta http-equiv="refresh" content="${autoRefresh}">` : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${refreshTag}
  <title>${escapeHtml(title)} — Accessibility Broadcast</title>
  ${OG_META}
  <style>${SHARED_STYLES}</style>
</head>
<body>
  <main class="container" style="text-align:center;padding-top:80px">
    <p style="font-size:3rem;margin:0;opacity:0.3">${escapeHtml(String(statusCode))}</p>
    <h1>${escapeHtml(title)}</h1>
    <p class="muted" style="margin:12px 0 24px" aria-live="polite">${escapeHtml(message)}</p>
    <a href="/" class="btn">Back to home</a>
  </main>
  ${FOOTER_HTML}
</body>
</html>`;
}

export function buildLandingPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Accessibility Broadcast — Live captions, audio descriptions &amp; sign overlays</title>
  ${OG_META}
  <style>${SHARED_STYLES}
    .hero { text-align: center; padding: 48px 0 32px; }
    .hero h1 { font-size: 2.2rem; margin: 0 0 12px; line-height: 1.2; }
    .hero .tagline { font-size: 1.15rem; color: var(--muted); margin: 0 0 32px; max-width: 560px; margin-left: auto; margin-right: auto; line-height: 1.5; }
    .hero-actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
    .badges { display: flex; gap: 12px; justify-content: center; margin-top: 16px; flex-wrap: wrap; }
    .badge { display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; color: var(--muted); border: 1px solid #1a2d4a; border-radius: 999px; padding: 4px 12px; }

    .how-it-works { margin: 48px 0; }
    .how-it-works h2 { text-align: center; margin: 0 0 24px; font-size: 1.4rem; }
    .steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .step { background: color-mix(in oklab, var(--card) 85%, black); border-radius: 14px; padding: 24px 20px; text-align: center; }
    .step-number {
      display: inline-flex; align-items: center; justify-content: center;
      width: 36px; height: 36px; border-radius: 50%;
      background: var(--accent); color: #07111f; font-weight: 700; font-size: 1.1rem;
      margin-bottom: 12px;
    }
    .step h3 { margin: 0 0 8px; font-size: 1rem; }
    .step p { margin: 0; font-size: 0.9rem; color: var(--muted); line-height: 1.4; }

    .features { margin: 48px 0; }
    .features h2 { text-align: center; margin: 0 0 24px; font-size: 1.4rem; }
    .feature-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
    .feature { background: color-mix(in oklab, var(--card) 85%, black); border-radius: 14px; padding: 20px; }
    .feature h3 { margin: 0 0 6px; font-size: 0.95rem; color: var(--accent); }
    .feature p { margin: 0; font-size: 0.88rem; color: var(--muted); line-height: 1.4; }

    .compliance { margin: 48px 0; text-align: center; }
    .compliance h2 { margin: 0 0 8px; font-size: 1.2rem; }
    .compliance p { margin: 0; color: var(--muted); font-size: 0.9rem; max-width: 540px; margin-left: auto; margin-right: auto; line-height: 1.5; }

    @media (max-width: 768px) {
      .hero h1 { font-size: 1.7rem; }
      .steps { grid-template-columns: 1fr; }
      .feature-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="container">
    <section class="hero">
      <h1>Live accessibility for every broadcast.</h1>
      <p class="tagline">Real-time captions, audio descriptions, and sign language overlays for streams, events, and live media — delivered via Server-Sent Events. Open source. Self-hostable.</p>
      <div class="hero-actions">
        <a href="https://github.com/dedmonwalkin/accessibility-broadcast" class="btn" target="_blank" rel="noopener">View on GitHub</a>
        <a href="/openapi.yaml" class="btn-outline">API Reference</a>
      </div>
      <div class="badges">
        <span class="badge">Apache-2.0</span>
        <span class="badge">Real-time SSE</span>
        <span class="badge">WCAG 2.2 AA</span>
        <span class="badge">EU Accessibility Act</span>
        <span class="badge">Self-hostable</span>
      </div>
    </section>

    <section class="how-it-works">
      <h2>How it works</h2>
      <div class="steps">
        <div class="step">
          <div class="step-number">1</div>
          <h3>Ingest</h3>
          <p>POST audio chunks from your stream. Whisper transcribes in real time.</p>
        </div>
        <div class="step">
          <div class="step-number">2</div>
          <h3>Enrich</h3>
          <p>Captions get translated, audio descriptions get generated, sign overlays get composed.</p>
        </div>
        <div class="step">
          <div class="step-number">3</div>
          <h3>Deliver</h3>
          <p>Viewers connect to the SSE stream and receive captions, descriptions, and sign tokens live.</p>
        </div>
      </div>
    </section>

    <section class="features">
      <h2>What you get</h2>
      <div class="feature-grid">
        <div class="feature">
          <h3>Live Captions</h3>
          <p>Real-time transcription in 21 languages. WebVTT and TTML on demand. Low-confidence segments flagged for review.</p>
        </div>
        <div class="feature">
          <h3>Audio Descriptions</h3>
          <p>Scene descriptions delivered during dialogue gaps, so blind and low-vision viewers stay with the story.</p>
        </div>
        <div class="feature">
          <h3>Sign Language</h3>
          <p>Gloss tokens and overlays for 10 sign languages, with 6 themes including high-contrast and kid-friendly modes.</p>
        </div>
        <div class="feature">
          <h3>Viewer-first</h3>
          <p>Per-viewer preferences, ad-integration hooks, incident reporting, and feedback — no cookies, no tracking by default.</p>
        </div>
      </div>
    </section>

    <section class="compliance">
      <h2>Built for compliance.</h2>
      <p>Designed around WCAG 2.2 AA and the EU Accessibility Act (2025). See <a href="https://github.com/dedmonwalkin/accessibility-broadcast/blob/main/PRIVACY.md">PRIVACY.md</a> for the data posture and <a href="https://github.com/dedmonwalkin/accessibility-broadcast/blob/main/SECURITY.md">SECURITY.md</a> to report vulnerabilities.</p>
    </section>
  </main>
  ${FOOTER_HTML}
</body>
</html>`;
}
