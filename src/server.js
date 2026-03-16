import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseUrl, parseJsonBody, sendJson, notFound } from './utils/http.js';
import { store } from './data/store.js';
import { streamingService } from './services/streamingService.js';
import { viewerPreferencesService } from './services/viewerPreferencesService.js';
import { feedbackService } from './services/feedbackService.js';
import { adIntegrationService } from './services/adIntegrationService.js';
import { accessibilityService } from './services/accessibilityService.js';
import { streamingUiService } from './services/streamingUiService.js';
import { streamEmitter } from './services/streamingService.js';
import { persistenceService } from './services/persistence/persistenceService.js';
import { runtimeConfig } from './config/runtime.js';

const runtime = runtimeConfig();
const PORT = runtime.port;
const OPENAPI_PATH = path.resolve(process.cwd(), 'openapi/openapi.yaml');

function extractParams(pathname, pattern) {
  const pathParts = pathname.split('/').filter(Boolean);
  const patternParts = pattern.split('/').filter(Boolean);
  if (pathParts.length !== patternParts.length) return null;

  const params = {};
  for (let i = 0; i < patternParts.length; i += 1) {
    const p = patternParts[i];
    const v = pathParts[i];
    if (p.startsWith(':')) {
      params[p.slice(1)] = v;
      continue;
    }
    if (p !== v) return null;
  }
  return params;
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function isPublicPath(method, pathname) {
  if (pathname === '/health') return true;
  if (pathname === '/openapi.yaml') return true;
  if (pathname === '/feedback') return true;
  if (pathname.startsWith('/viewer/')) return true;
  if (pathname === '/v1/embed/overlay.js') return true;
  if (pathname.startsWith('/v1/streams/') && pathname.endsWith('/events/stream')) return true;
  return false;
}

function authenticate(req) {
  if (runtime.apiKeys.length === 0) return true;
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return runtime.apiKeys.includes(token);
}

const rateLimitWindows = new Map();

function checkRateLimit(req) {
  if (runtime.rateLimitRpm <= 0) return null;
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 1000;
  const hits = (rateLimitWindows.get(ip) || []).filter((t) => now - t < windowMs);
  hits.push(now);
  rateLimitWindows.set(ip, hits);
  if (hits.length > runtime.rateLimitRpm) {
    const retryAfter = Math.ceil((hits[0] + windowMs - now) / 1000);
    return retryAfter;
  }
  return null;
}

async function route(req, res) {
  const url = parseUrl(req);
  const { pathname } = url;
  const method = req.method.toUpperCase();

  try {
    if (method === 'GET' && pathname === '/health') {
      return sendJson(res, 200, { ok: true, service: 'accessibility-broadcast' });
    }

    const retryAfter = checkRateLimit(req);
    if (retryAfter !== null) {
      res.setHeader('Retry-After', retryAfter);
      return sendJson(res, 429, { error: 'Too Many Requests', retry_after_seconds: retryAfter });
    }

    if (!isPublicPath(method, pathname) && !authenticate(req)) {
      return sendJson(res, 401, { error: 'Unauthorized' });
    }

    if (method === 'GET' && pathname === '/v1/accessibility/resources') {
      return sendJson(res, 200, {
        kind: url.searchParams.get('kind') || 'default',
        resources: accessibilityService.getResources({ kind: url.searchParams.get('kind') })
      });
    }

    if (method === 'POST' && pathname === '/v1/streams') {
      const body = await parseJsonBody(req);
      return sendJson(res, 201, streamingService.createStream(body));
    }

    if (method === 'POST' && pathname === '/v1/viewers') {
      const body = await parseJsonBody(req);
      return sendJson(res, 201, viewerPreferencesService.createViewer(body));
    }

    const viewerDetail = extractParams(pathname, '/v1/viewers/:id');
    if (method === 'GET' && viewerDetail) {
      return sendJson(res, 200, viewerPreferencesService.getViewer(viewerDetail.id));
    }

    const viewerPreferences = extractParams(pathname, '/v1/viewers/:id/preferences');
    if (method === 'GET' && viewerPreferences) {
      return sendJson(res, 200, viewerPreferencesService.getPreferences(viewerPreferences.id));
    }

    if (method === 'PATCH' && viewerPreferences) {
      const body = await parseJsonBody(req);
      return sendJson(res, 200, viewerPreferencesService.updatePreferences(viewerPreferences.id, body));
    }

    const streamStart = extractParams(pathname, '/v1/streams/:id/start');
    if (method === 'POST' && streamStart) {
      const body = await parseJsonBody(req);
      const result = await streamingService.startStream(streamStart.id, body);
      persistenceService.snapshot('stream.started').catch(() => {});
      return sendJson(res, 200, result);
    }

    const streamStop = extractParams(pathname, '/v1/streams/:id/stop');
    if (method === 'POST' && streamStop) {
      const result = streamingService.stopStream(streamStop.id);
      persistenceService.snapshot('stream.stopped').catch(() => {});
      return sendJson(res, 200, result);
    }

    const streamCaptions = extractParams(pathname, '/v1/streams/:id/captions');
    if (method === 'GET' && streamCaptions) {
      const format = url.searchParams.get('format') || 'vtt';
      const language = url.searchParams.get('language');
      const viewerId = url.searchParams.get('viewer_id');
      return sendJson(
        res,
        200,
        streamingService.getCaptions(streamCaptions.id, format, language, { viewer_id: viewerId })
      );
    }

    const streamAudio = extractParams(pathname, '/v1/streams/:id/audio-description');
    if (method === 'GET' && streamAudio) {
      const viewerId = url.searchParams.get('viewer_id');
      return sendJson(res, 200, streamingService.getAudioDescription(streamAudio.id, { viewer_id: viewerId }));
    }

    const streamSign = extractParams(pathname, '/v1/streams/:id/sign-overlay');
    if (method === 'GET' && streamSign) {
      const viewerId = url.searchParams.get('viewer_id');
      return sendJson(res, 200, streamingService.getSignOverlay(streamSign.id, { viewer_id: viewerId }));
    }

    const streamSse = extractParams(pathname, '/v1/streams/:id/events/stream');
    if (method === 'GET' && streamSse) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      res.write(': connected\n\n');

      function onEvent(data) {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }

      const eventKey = `stream:${streamSse.id}`;
      streamEmitter.on(eventKey, onEvent);
      req.on('close', () => streamEmitter.off(eventKey, onEvent));
      return;
    }

    const streamEvents = extractParams(pathname, '/v1/streams/:id/events');
    if (method === 'GET' && streamEvents) {
      return sendJson(res, 200, {
        stream_id: streamEvents.id,
        events: streamingService.getEvents(streamEvents.id)
      });
    }

    const streamHealth = extractParams(pathname, '/v1/streams/:id/health');
    if (method === 'GET' && streamHealth) {
      return sendJson(res, 200, streamingService.getHealth(streamHealth.id));
    }

    const streamFeedbackSummary = extractParams(pathname, '/v1/streams/:id/feedback-summary');
    if (method === 'GET' && streamFeedbackSummary) {
      return sendJson(res, 200, feedbackService.summarizeByStream(streamFeedbackSummary.id));
    }

    if (method === 'GET' && pathname === '/v1/accessibility/coverage') {
      return sendJson(res, 200, streamingService.getAccessibilityCoverage());
    }

    if (method === 'GET' && pathname === '/v1/incidents') {
      return sendJson(res, 200, {
        incidents: streamingService.listIncidents({ status: url.searchParams.get('status') })
      });
    }

    const incidentResolve = extractParams(pathname, '/v1/incidents/:id/resolve');
    if (method === 'POST' && incidentResolve) {
      const body = await parseJsonBody(req);
      const result = streamingService.resolveIncident(incidentResolve.id, body);
      persistenceService.snapshot('incident.resolved').catch(() => {});
      return sendJson(res, 200, result);
    }

    if (method === 'POST' && pathname === '/v1/feedback') {
      const body = await parseJsonBody(req);
      return sendJson(res, 201, feedbackService.create(body));
    }

    if (method === 'GET' && pathname === '/v1/admin/feedback') {
      return sendJson(res, 200, {
        feedback: feedbackService.list({
          stream_id: url.searchParams.get('stream_id'),
          issue_type: url.searchParams.get('issue_type'),
          ad_session_id: url.searchParams.get('ad_session_id'),
          viewer_id: url.searchParams.get('viewer_id')
        })
      });
    }

    if (method === 'POST' && pathname === '/v1/ad/sessions') {
      const body = await parseJsonBody(req);
      return sendJson(res, 201, adIntegrationService.createSession(body));
    }

    const adSessionEvent = extractParams(pathname, '/v1/ad/sessions/:id/events');
    if (method === 'POST' && adSessionEvent) {
      const body = await parseJsonBody(req);
      return sendJson(res, 201, adIntegrationService.logEvent(adSessionEvent.id, body));
    }

    const adSessionDetail = extractParams(pathname, '/v1/ad/sessions/:id');
    if (method === 'GET' && adSessionDetail) {
      return sendJson(res, 200, adIntegrationService.getSession(adSessionDetail.id));
    }

    const adSessionTag = extractParams(pathname, '/v1/ad/sessions/:id/tag');
    if (method === 'GET' && adSessionTag) {
      return sendJson(res, 200, adIntegrationService.buildAdTag(adSessionTag.id));
    }

    const adSessionReport = extractParams(pathname, '/v1/ad/sessions/:id/report');
    if (method === 'GET' && adSessionReport) {
      return sendJson(res, 200, adIntegrationService.getSessionReport(adSessionReport.id));
    }

    const adCampaignReport = extractParams(pathname, '/v1/ad/campaigns/:campaignId/report');
    if (method === 'GET' && adCampaignReport) {
      return sendJson(res, 200, adIntegrationService.getCampaignReport(adCampaignReport.campaignId));
    }

    if (method === 'GET' && pathname === '/v1/embed/overlay.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(streamingUiService.buildOverlayScript());
      return;
    }

    const viewerPage = extractParams(pathname, '/viewer/:streamId');
    if (method === 'GET' && viewerPage) {
      return sendHtml(
        res,
        200,
        streamingUiService.buildViewerPage(viewerPage.streamId, url.searchParams.get('viewerId') || '')
      );
    }

    if (method === 'GET' && pathname === '/feedback') {
      return sendHtml(
        res,
        200,
        streamingUiService.buildFeedbackPage(
          url.searchParams.get('streamId') || '',
          url.searchParams.get('source') || 'viewer',
          url.searchParams.get('adSessionId') || '',
          url.searchParams.get('viewerId') || ''
        )
      );
    }

    if (method === 'GET' && pathname === '/openapi.yaml') {
      const spec = await readFile(OPENAPI_PATH, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/yaml; charset=utf-8' });
      res.end(spec);
      return;
    }

    if (method === 'POST' && pathname === '/v1/admin/snapshot') {
      const body = await parseJsonBody(req);
      return sendJson(res, 200, await persistenceService.snapshot(body.reason || 'manual_api'));
    }

    if (method === 'GET' && pathname === '/v1/admin/metrics') {
      const outputs = [...store.streamOutputs.values()];
      return sendJson(res, 200, {
        streams: {
          total: store.streams.size,
          running: [...store.streams.values()].filter((s) => s.status === 'running').length,
          stopped: [...store.streams.values()].filter((s) => s.status === 'stopped').length
        },
        segments: {
          total: outputs.reduce((sum, o) => sum + (o.events?.length || 0), 0)
        },
        incidents: {
          total: store.incidents.size,
          open: [...store.incidents.values()].filter((i) => i.status === 'open').length,
          resolved: [...store.incidents.values()].filter((i) => i.status === 'resolved').length
        },
        feedback: {
          total: store.feedback.size
        },
        ad_sessions: {
          total: store.adSessions.size
        },
        viewer_profiles: {
          total: store.viewerProfiles.size
        },
        audit_log_entries: store.auditLog.length
      });
    }

    if (method === 'GET' && pathname === '/v1/debug/state' && runtime.nodeEnv !== 'production') {
      return sendJson(res, 200, {
        streams: [...store.streams.values()],
        streamOutputs: [...store.streamOutputs.entries()],
        viewerProfiles: [...store.viewerProfiles.values()],
        incidents: [...store.incidents.values()],
        feedback: [...store.feedback.values()],
        adSessions: [...store.adSessions.values()],
        adEvents: [...store.adEvents.values()],
        auditLog: store.auditLog.slice(-100)
      });
    }

    return notFound(res);
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }
}

const server = http.createServer(route);

export async function startServer(port = PORT) {
  await persistenceService.configure(runtime);
  await persistenceService.loadLatest();

  return new Promise((resolve) => {
    server.listen(port, () => {
      resolve(server);
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer(PORT).then(() => {
    // eslint-disable-next-line no-console
    console.log(`Accessibility Broadcast API running on http://localhost:${PORT}`);

    const intervalMs = runtime.snapshotIntervalMs;
    if (intervalMs > 0) {
      setInterval(() => {
        persistenceService.snapshot('interval').catch(() => {});
      }, intervalMs);
    }
  });

  async function shutdown() {
    await persistenceService.snapshot('shutdown').catch(() => {});
    await persistenceService.close();
    process.exit(0);
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
