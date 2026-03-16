import http from 'node:http';

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function normalizeWords(text) {
  return String(text || '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

function confidenceFor(timelineItem = {}) {
  const transcriptScore = Math.min(String(timelineItem.transcript || '').length / 120, 1);
  const sceneScore = Math.min(String(timelineItem.scene || '').length / 100, 1);
  return Number((0.56 + transcriptScore * 0.22 + sceneScore * 0.22).toFixed(2));
}

function perception(payload = {}) {
  const timeline = payload.timelineItem || {};
  return {
    transcript: timeline.transcript || timeline.text || 'Live commentary unavailable',
    scene: timeline.scene || timeline.visual || 'Scene details unavailable',
    speaker: timeline.speaker || 'unknown',
    entities: Array.isArray(timeline.entities) ? timeline.entities : [],
    source_refs: Array.isArray(timeline.source_refs) ? timeline.source_refs : ['vision:http', 'speech:http'],
    confidence: confidenceFor(timeline)
  };
}

function accessibility(payload = {}) {
  const timeline = payload.timelineItem || {};
  const p = payload.perception || {};
  const segmentId = timeline.id || `seg_${Math.random().toString(16).slice(2, 6)}`;
  return {
    segment_id: segmentId,
    ts_start: timeline.ts_start || new Date().toISOString(),
    ts_end: timeline.ts_end || new Date(Date.now() + 2000).toISOString(),
    type: String(p.scene || '').toLowerCase().includes('goal') ? 'action' : 'commentary',
    text: p.transcript || 'No transcript available',
    speaker: p.speaker || 'unknown',
    entities: Array.isArray(p.entities) ? p.entities : [],
    confidence: typeof p.confidence === 'number' ? p.confidence : 0.7,
    source_refs: Array.isArray(p.source_refs) ? p.source_refs : ['fusion:http'],
    audio_description: p.scene || 'No scene analysis available'
  };
}

function signScript(payload = {}) {
  const a = payload.accessibility || {};
  return {
    id: a.segment_id || `seg_${Math.random().toString(16).slice(2, 6)}`,
    start: a.ts_start || new Date().toISOString(),
    end: a.ts_end || new Date(Date.now() + 2000).toISOString(),
    gloss_tokens: normalizeWords(a.text).slice(0, 12),
    facial_cues: a.type === 'action' ? ['INTENSE-FOCUS'] : ['NEUTRAL'],
    confidence: typeof a.confidence === 'number' ? a.confidence : 0.7,
    fallback_text: a.text || ''
  };
}

export function createModelGatewayServer() {
  return http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        return sendJson(res, 200, { ok: true, service: 'model-gateway-stub' });
      }

      if (req.method !== 'POST') {
        return sendJson(res, 405, { error: 'Method not allowed' });
      }

      const body = await readJson(req);

      if (req.url === '/v1/models/perception') {
        return sendJson(res, 200, perception(body));
      }

      if (req.url === '/v1/models/accessibility') {
        return sendJson(res, 200, accessibility(body));
      }

      if (req.url === '/v1/models/sign-script') {
        return sendJson(res, 200, signScript(body));
      }

      if (req.url === '/v1/translate') {
        const text = body.q || body.text || '';
        const target = body.target || 'en';
        const translated = (target === 'en') ? text : `[${target}] ${text}`;
        return sendJson(res, 200, { translatedText: translated });
      }

      return sendJson(res, 404, { error: 'Not found' });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.MODEL_GATEWAY_PORT || 4011);
  const server = createModelGatewayServer();
  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Model gateway stub listening on http://localhost:${port}`);
  });
}
