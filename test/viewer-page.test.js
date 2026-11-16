import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { streamingUiService } from '../src/services/streamingUiService.js';

// Runs the viewer page's and the embed's own JavaScript against a minimal fake
// browser, so the tests exercise what a viewer would see rather than matching
// strings in the page source.

function makeElement(id = '') {
  const children = new Map();
  return {
    id, textContent: '', innerHTML: '', className: '', value: '', src: '', href: '', title: '',
    style: {
      props: {},
      setProperty(name, value) { this.props[name] = value; },
      getPropertyValue(name) { return this.props[name] || ''; }
    },
    listeners: {},
    appended: [],
    appendChild(child) { this.appended.push(child); return child; },
    addEventListener(type, handler) { this.listeners[type] = handler; },
    setAttribute() {},
    remove() {},
    querySelector(selector) {
      if (!children.has(selector)) children.set(selector, makeElement(selector));
      return children.get(selector);
    }
  };
}

const THEMES = [
  { id: 'standard', name: 'Standard' },
  { id: 'high_contrast', name: 'High contrast' }
].map(theme => ({
  ...theme,
  size: 'small', layout: 'stack',
  background: { color: '#000', opacity: 1, style: 'solid' },
  palette: { primary: '#fff', secondary: '#fff', accent: '#fff', text: '#fff', token_bg: '#000' },
  font: { family: 'sans-serif', weight: 400, size_scale: 1 }
}));

const CAPTION = {
  id: 'seg-1', start: '2026-01-01T00:00:00.000Z', text: 'Welcome to the meeting.',
  language: 'en-US', target_language: 'en-US', translation_status: 'original'
};
const AUDIO = { id: 'ad-1', start: '2026-01-01T00:00:00.000Z', text: 'A wide shot of the chamber.' };
const SNAPSHOT = {
  type: 'snapshot', stream_id: 'stream-1', captions: [CAPTION], audio_description: [AUDIO],
  sign: [{ id: 'sign-1', start: '00:00', gloss_tokens: ['WELCOME'] }], sign_theme: THEMES[1]
};

// streamStatus is the HTTP status the protected stream JSON endpoints answer with.
function makeBrowser({ streamStatus }) {
  const elements = new Map();
  const requests = [];
  const sources = [];
  class FakeEventSource {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 2;
    constructor(url) { this.url = url; this.readyState = FakeEventSource.CONNECTING; sources.push(this); }
    close() { this.readyState = FakeEventSource.CLOSED; }
    deliver(payload) {
      this.readyState = FakeEventSource.OPEN;
      if (this.onopen) this.onopen();
      this.onmessage({ data: JSON.stringify(payload) });
    }
    fail(readyState) { this.readyState = readyState; this.onerror(); }
  }
  const document = {
    readyState: 'complete',
    body: makeElement('body'),
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement(id));
      return elements.get(id);
    },
    createElement: () => makeElement(),
    querySelector: () => null,
    addEventListener() {}
  };
  const window = { location: { origin: 'http://viewer.test' } };
  async function fetch(url) {
    requests.push(url);
    if (url === '/v1/sign-overlay-themes') return { ok: true, status: 200, json: async () => ({ themes: THEMES }) };
    if (streamStatus !== 200) return { ok: false, status: streamStatus, json: async () => ({ error: 'unauthorized' }) };
    if (url.includes('/captions')) return { ok: true, status: 200, json: async () => ({ captions: [CAPTION] }) };
    if (url.includes('/sign-overlay')) return { ok: true, status: 200, json: async () => ({ theme: THEMES[1], segments: SNAPSHOT.sign }) };
    return { ok: true, status: 200, json: async () => ({ segments: [AUDIO] }) };
  }
  const context = vm.createContext({ document, window, location: window.location, fetch, EventSource: FakeEventSource, URLSearchParams, console });
  return {
    context, document, window, requests, sources,
    el: id => document.getElementById(id),
    streamRequests: () => requests.filter(url => url.startsWith('/v1/streams/')),
    settle: async () => { for (let i = 0; i < 5; i += 1) await new Promise(resolve => setImmediate(resolve)); }
  };
}

function runViewer(browser) {
  const html = streamingUiService.buildViewerPage('stream-1', 'viewer-1');
  const [, script] = html.match(/<script>([\s\S]*?)<\/script>/);
  vm.runInContext(script, browser.context);
  return browser.sources[0];
}

test('viewer shows no error when the event stream delivers data and the JSON endpoints need a key', async () => {
  const browser = makeBrowser({ streamStatus: 401 });
  const sse = runViewer(browser);
  await browser.settle();
  sse.deliver(SNAPSHOT);
  await browser.settle();

  assert.equal(browser.el('error-region').innerHTML, '');
  assert.deepEqual(browser.streamRequests(), [], 'the protected JSON endpoints are not requested');
  assert.match(browser.el('captions').textContent, /Welcome to the meeting\./);
  assert.match(browser.el('audio').textContent, /A wide shot of the chamber\./);
  assert.equal(browser.el('signSegments').appended.length, 1);
  assert.equal(browser.el('conn-status').textContent, 'Live');
});

test('viewer applies the saved sign theme from the snapshot, even when it arrives before the theme list', async () => {
  const browser = makeBrowser({ streamStatus: 401 });
  const sse = runViewer(browser);
  sse.deliver(SNAPSHOT);
  await browser.settle();

  assert.equal(browser.el('themeSelect').value, 'high_contrast');
  assert.equal(browser.el('signOverlay').style.getPropertyValue('--sign-font'), 'sans-serif');
});

test('a theme picked on the page is not overwritten by a later snapshot', async () => {
  const browser = makeBrowser({ streamStatus: 401 });
  const sse = runViewer(browser);
  await browser.settle();
  sse.deliver(SNAPSHOT);
  const select = browser.el('themeSelect');
  select.value = 'standard';
  select.listeners.change.call(select);
  sse.deliver(SNAPSHOT);
  await browser.settle();

  assert.equal(select.value, 'standard');
});

test('viewer keeps its content and waits for the browser to reconnect after a dropped connection', async () => {
  const browser = makeBrowser({ streamStatus: 401 });
  const sse = runViewer(browser);
  await browser.settle();
  sse.deliver(SNAPSHOT);
  sse.fail(0);
  await browser.settle();

  assert.equal(browser.el('error-region').innerHTML, '');
  assert.deepEqual(browser.streamRequests(), []);
  assert.equal(browser.el('conn-status').textContent, 'Reconnecting...');
  assert.match(browser.el('captions').textContent, /Welcome to the meeting\./);
  assert.notEqual(sse.readyState, 2, 'the event stream is left open to reconnect');
});

test('viewer says the stream is not public when neither the event stream nor the JSON endpoints are open', async () => {
  const browser = makeBrowser({ streamStatus: 401 });
  const sse = runViewer(browser);
  await browser.settle();
  sse.fail(2);
  await browser.settle();

  const banner = browser.el('error-region').innerHTML;
  assert.match(banner, /not open for public viewing/);
  assert.doesNotMatch(banner, /Reload page/, 'reloading cannot fix a missing key');
  assert.equal(browser.el('captions').textContent, 'Captions are unavailable.');
  assert.equal(browser.el('audio').textContent, 'Audio descriptions are unavailable.');
  assert.equal(browser.streamRequests().length, 3, 'the HTTP snapshot is tried once');
});

test('viewer falls back to the HTTP snapshot when only the event stream is unavailable', async () => {
  const browser = makeBrowser({ streamStatus: 200 });
  const sse = runViewer(browser);
  await browser.settle();
  sse.fail(2);
  await browser.settle();

  assert.equal(browser.el('error-region').innerHTML, '');
  assert.match(browser.el('captions').textContent, /Welcome to the meeting\./);
  assert.equal(browser.el('themeSelect').value, 'high_contrast');
  assert.match(browser.el('conn-status').textContent, /Live updates unavailable/);
});

test('viewer offers a reload when loading fails for a reason a reload could fix', async () => {
  const browser = makeBrowser({ streamStatus: 503 });
  const sse = runViewer(browser);
  await browser.settle();
  sse.fail(2);
  await browser.settle();

  const banner = browser.el('error-region').innerHTML;
  assert.match(banner, /Could not load stream data: Failed to load captions/);
  assert.match(banner, /Reload page/);
});

function runEmbed(browser) {
  browser.window.ACCESSIBILITY_STREAM_ID = 'stream-1';
  vm.runInContext(streamingUiService.buildOverlayScript(), browser.context);
  const panel = browser.document.body.appended[0];
  return { sse: browser.sources[0], caption: panel.querySelector('#a11y-overlay-caption') };
}

test('embed keeps the caption on screen after a dropped connection instead of showing an error', async () => {
  const browser = makeBrowser({ streamStatus: 401 });
  const { sse, caption } = runEmbed(browser);
  sse.deliver(SNAPSHOT);
  sse.fail(0);
  await browser.settle();

  assert.match(caption.textContent, /Welcome to the meeting\./);
  assert.deepEqual(browser.streamRequests(), []);
  assert.notEqual(sse.readyState, 2);
});

test('embed says the stream is not public when it cannot be opened without a key', async () => {
  const browser = makeBrowser({ streamStatus: 401 });
  const { sse, caption } = runEmbed(browser);
  sse.fail(2);
  await browser.settle();

  assert.equal(caption.textContent, 'Overlay error: this stream is not open for public viewing');
});

const NEXT_CAPTION = { ...CAPTION, id: 'seg-2', start: '2026-01-01T00:00:05.000Z', text: 'Item four is approved.' };
const NOTICE = '[captions interrupted: the captioning service is not responding]';

test('viewer says captions are interrupted when the captioning service fails, and clears it on the next caption', async () => {
  const browser = makeBrowser({ streamStatus: 401 });
  const sse = runViewer(browser);
  await browser.settle();
  sse.deliver(SNAPSHOT);
  sse.deliver({ type: 'captions.interrupted', stream_id: 'stream-1', reason: 'model_provider_unavailable' });

  assert.equal(browser.el('conn-status').textContent, 'Captions interrupted');
  const during = browser.el('captions').textContent;
  assert.match(during, /Welcome to the meeting\./, 'earlier captions stay on screen');
  assert.ok(during.endsWith(NOTICE));
  assert.equal(browser.el('error-region').innerHTML, '');

  sse.deliver({ type: 'segment', stream_id: 'stream-1', segment: NEXT_CAPTION, audio_description: AUDIO });
  assert.equal(browser.el('conn-status').textContent, 'Live');
  const after = browser.el('captions').textContent;
  assert.match(after, /Item four is approved\./);
  assert.ok(!after.includes(NOTICE));
});

test('viewer joining during an interruption is told straight away', async () => {
  const browser = makeBrowser({ streamStatus: 401 });
  const sse = runViewer(browser);
  await browser.settle();
  sse.deliver({ ...SNAPSHOT, captions_interrupted: true });

  assert.equal(browser.el('conn-status').textContent, 'Captions interrupted');
  assert.ok(browser.el('captions').textContent.endsWith(NOTICE));
});

test('embed replaces a stale caption with an interruption notice until captions resume', async () => {
  const browser = makeBrowser({ streamStatus: 401 });
  const { sse, caption } = runEmbed(browser);
  sse.deliver(SNAPSHOT);
  sse.deliver({ type: 'captions.interrupted', stream_id: 'stream-1', reason: 'model_provider_unavailable' });
  assert.equal(caption.textContent, '[captions interrupted]');

  sse.deliver({ type: 'segment', stream_id: 'stream-1', segment: NEXT_CAPTION });
  assert.match(caption.textContent, /Item four is approved\./);
});

const DEMO_TEXT = /Demo content\..*not a live transcription/;

test('viewer shows no demo notice for a stream without demo content', async () => {
  const browser = makeBrowser({ streamStatus: 401 });
  const sse = runViewer(browser);
  await browser.settle();
  sse.deliver({ ...SNAPSHOT, demo: false });
  sse.deliver({ type: 'segment', stream_id: 'stream-1', segment: NEXT_CAPTION, audio_description: AUDIO, demo: false });

  assert.equal(browser.el('demo-region').innerHTML, '');
});

test('viewer labels a demo stream as soon as it connects', async () => {
  const browser = makeBrowser({ streamStatus: 401 });
  const sse = runViewer(browser);
  await browser.settle();
  sse.deliver({ ...SNAPSHOT, demo: true });

  assert.match(browser.el('demo-region').innerHTML, DEMO_TEXT);
  assert.equal(browser.el('error-region').innerHTML, '', 'a demo is not an error');
});

test('viewer adds the demo notice when demo content arrives after it connected', async () => {
  const browser = makeBrowser({ streamStatus: 401 });
  const sse = runViewer(browser);
  await browser.settle();
  sse.deliver({ ...SNAPSHOT, demo: false });
  assert.equal(browser.el('demo-region').innerHTML, '');
  sse.deliver({ type: 'segment', stream_id: 'stream-1', segment: NEXT_CAPTION, audio_description: AUDIO, demo: true });

  assert.match(browser.el('demo-region').innerHTML, DEMO_TEXT);
});

test('embed shows its demo label only for demo content', async () => {
  const real = makeBrowser({ streamStatus: 401 });
  const realEmbed = runEmbed(real);
  realEmbed.sse.deliver({ ...SNAPSHOT, demo: false });
  const realPanel = real.document.body.appended[0];
  assert.notEqual(realPanel.querySelector('#a11y-overlay-demo').hidden, false);

  const demo = makeBrowser({ streamStatus: 401 });
  const demoEmbed = runEmbed(demo);
  demoEmbed.sse.deliver({ ...SNAPSHOT, demo: true });
  const demoPanel = demo.document.body.appended[0];
  assert.equal(demoPanel.querySelector('#a11y-overlay-demo').hidden, false);
});
