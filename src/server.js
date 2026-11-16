import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  parseUrl,
  parseJsonBody,
  sendJson,
  sendHtml,
  notFound,
  PayloadTooLargeError
} from './utils/http.js';
import { store } from './data/store.js';
import { streamingService } from './services/streamingService.js';
import { viewerPreferencesService } from './services/viewerPreferencesService.js';
import { feedbackService } from './services/feedbackService.js';
import { adIntegrationService } from './services/adIntegrationService.js';
import { accessibilityService } from './services/accessibilityService.js';
import { streamingUiService } from './services/streamingUiService.js';
import { streamEmitter } from './services/streamingService.js';
import { createModelProvider } from './services/providers/modelProvider.js';
import { persistenceService } from './services/persistence/persistenceService.js';
import { cleanupService } from './services/cleanupService.js';
import { buildErrorPage, buildLandingPage } from './services/uiShared.js';
import { runtimeConfig } from './config/runtime.js';
import { SIGN_OVERLAY_THEMES } from './config/accessibilityCatalog.js';
import {
  generateRequestId,
  logRequest,
  getMetrics as getRequestMetrics,
  incrementConnections,
  decrementConnections,
  incrementSse,
  decrementSse,
  incrementSseEvents
} from './utils/logger.js';
import { buildKeyStore, extractBearer, SCOPE_ADMIN, SCOPE_STANDARD } from './utils/auth.js';
import { requireValidId } from './utils/security.js';
import { seams, resolveTenantFromHeaders } from './services/seams/index.js';

const runtime = runtimeConfig();
const PORT = runtime.port;
const OPENAPI_PATH = path.resolve(process.cwd(), 'openapi/openapi.yaml');

const keyStore = buildKeyStore({
  apiKeys: runtime.apiKeys,
  adminApiKeys: runtime.adminApiKeys,
  pepper: runtime.apiKeyPepper
});

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

function isPublicPath(method, pathname) {
  if (pathname === '/') return true;
  if (pathname === '/health') return true;
  if (pathname === '/healthz') return true;
  if (pathname === '/readyz') return true;
  if (pathname === '/openapi.yaml') return true;
  if (pathname === '/feedback') return true;
  if (pathname.startsWith('/viewer/')) return true;
  if (pathname === '/v1/embed/overlay.js') return true;
  if (pathname === '/v1/sign-overlay-themes') return true;
  if (runtime.ssePublicStreams &&
      pathname.startsWith('/v1/streams/') &&
      pathname.endsWith('/events/stream')) {
    return true;
  }
  return false;
}

function isAdminPath(pathname) {
  return pathname.startsWith('/v1/admin/') || pathname.startsWith('/v1/debug/');
}

// Returns { scope, tenant } for the authenticated caller, or null.
// tenant is { orgId, projectId } | null, resolved via the IdentityProvider
// seam when configured, or from X-Org-Id / X-Project-Id dev headers
// when the default noop identity provider is active.
async function authorize(req) {
  if (runtime.authDisabled) {
    return { scope: SCOPE_ADMIN, tenant: resolveTenantFromHeaders(req) };
  }
  if (keyStore.size === 0) return null;
  const token = extractBearer(req);
  const scope = keyStore.verify(token);
  if (!scope) return null;
  const resolved = token ? await seams.identity.resolveApiKey(token) : null;
  const tenant = resolved && (resolved.orgId || resolved.projectId)
    ? { orgId: resolved.orgId || null, projectId: resolved.projectId || null }
    : resolveTenantFromHeaders(req);
  return { scope, tenant };
}

function clientIp(req) {
  const socketAddr = req.socket.remoteAddress || '';
  const xff = req.headers['x-forwarded-for'];
  if (!xff) return socketAddr || 'unknown';
  // Only trust X-Forwarded-For when the immediate peer is in the
  // trusted-proxy allowlist. Otherwise the header is attacker-controlled.
  const trusted = runtime.trustedProxies;
  if (trusted.length > 0 && trusted.includes(socketAddr)) {
    const first = String(xff).split(',')[0].trim();
    return first || socketAddr || 'unknown';
  }
  return socketAddr || 'unknown';
}

const rateLimitWindows = new Map();
const MAX_RATE_LIMIT_ENTRIES = 10000;
let lastRateLimitCleanup = Date.now();

function cleanupRateLimitWindows() {
  const now = Date.now();
  if (now - lastRateLimitCleanup < 60_000) return;
  lastRateLimitCleanup = now;
  const windowMs = 60 * 1000;
  for (const [ip, hits] of rateLimitWindows) {
    const valid = hits.filter((t) => now - t < windowMs);
    if (valid.length === 0) {
      rateLimitWindows.delete(ip);
    } else {
      rateLimitWindows.set(ip, valid);
    }
  }
  if (rateLimitWindows.size > MAX_RATE_LIMIT_ENTRIES) {
    const toRemove = rateLimitWindows.size - MAX_RATE_LIMIT_ENTRIES;
    const keys = rateLimitWindows.keys();
    for (let i = 0; i < toRemove; i++) {
      rateLimitWindows.delete(keys.next().value);
    }
  }
}

function checkRateLimit(req) {
  if (runtime.rateLimitRpm <= 0) return null;
  cleanupRateLimitWindows();
  const ip = clientIp(req);
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

function readJsonBody(req, limit = runtime.maxJsonBodyBytes) {
  return parseJsonBody(req, { maxBytes: limit });
}

function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  };
}

async function route(req, res) {
  const startTime = Date.now();
  const requestId = generateRequestId();
  res.setHeader('X-Request-Id', requestId);
  for (const [k, v] of Object.entries(securityHeaders())) {
    res.setHeader(k, v);
  }
  incrementConnections();

  const url = parseUrl(req);
  const { pathname } = url;
  const method = req.method.toUpperCase();

  try {
    if (method === 'GET' && pathname === '/') {
      return sendHtml(res, 200, buildLandingPage());
    }

    if (method === 'GET' && pathname === '/health') {
      return sendJson(res, 200, { ok: true, service: 'accessibility-broadcast' });
    }

    if (method === 'GET' && pathname === '/healthz') {
      return sendJson(res, 200, { status: 'ok' });
    }

    if (method === 'GET' && pathname === '/readyz') {
      const checks = { database: 'skipped' };
      let healthy = true;
      if (runtime.enablePostgres) {
        try {
          await persistenceService.ping();
          checks.database = 'ok';
        } catch {
          checks.database = 'error';
          healthy = false;
        }
      }
      return sendJson(res, healthy ? 200 : 503, { status: healthy ? 'ok' : 'degraded', checks });
    }

    const retryAfter = checkRateLimit(req);
    if (retryAfter !== null) {
      res.setHeader('Retry-After', retryAfter);
      return sendJson(res, 429, { error: 'rate_limited', retry_after_seconds: retryAfter });
    }

    const requiresAuth = !isPublicPath(method, pathname);
    const auth = await authorize(req);
    const scope = auth ? auth.scope : null;
    const tenant = auth ? auth.tenant : null;
    if (requiresAuth && !scope) {
      return sendJson(res, 401, { error: 'unauthorized' });
    }
    if (isAdminPath(pathname)) {
      const needsAdmin = keyStore.hasAdmin;
      if (needsAdmin && scope !== SCOPE_ADMIN) {
        return sendJson(res, 403, { error: 'forbidden', required_scope: SCOPE_ADMIN });
      }
    }
    req.tenant = tenant;

    if (method === 'GET' && pathname === '/v1/accessibility/resources') {
      return sendJson(res, 200, {
        kind: url.searchParams.get('kind') || 'default',
        resources: accessibilityService.getResources({ kind: url.searchParams.get('kind') })
      });
    }

    if (method === 'GET' && pathname === '/v1/sign-overlay-themes') {
      return sendJson(res, 200, { themes: SIGN_OVERLAY_THEMES });
    }

    if (method === 'POST' && pathname === '/v1/streams') {
      const body = await readJsonBody(req);
      return sendJson(res, 201, streamingService.createStream(body));
    }

    if (method === 'POST' && pathname === '/v1/viewers') {
      const body = await readJsonBody(req);
      return sendJson(res, 201, viewerPreferencesService.createViewer(body));
    }

    const viewerDetail = extractParams(pathname, '/v1/viewers/:id');
    if (method === 'GET' && viewerDetail) {
      requireValidId(viewerDetail.id, 'viewer_id');
      return sendJson(res, 200, viewerPreferencesService.getViewer(viewerDetail.id));
    }

    const viewerPreferences = extractParams(pathname, '/v1/viewers/:id/preferences');
    if (method === 'GET' && viewerPreferences) {
      requireValidId(viewerPreferences.id, 'viewer_id');
      return sendJson(res, 200, viewerPreferencesService.getPreferences(viewerPreferences.id));
    }

    if (method === 'PATCH' && viewerPreferences) {
      requireValidId(viewerPreferences.id, 'viewer_id');
      const body = await readJsonBody(req);
      return sendJson(res, 200, viewerPreferencesService.updatePreferences(viewerPreferences.id, body));
    }

    const streamStart = extractParams(pathname, '/v1/streams/:id/start');
    if (method === 'POST' && streamStart) {
      requireValidId(streamStart.id, 'stream_id');
      const body = await readJsonBody(req);
      const result = await streamingService.startStream(streamStart.id, body);
      persistenceService.snapshot('stream.started').catch(() => {});
      return sendJson(res, 200, result);
    }

    const streamStop = extractParams(pathname, '/v1/streams/:id/stop');
    if (method === 'POST' && streamStop) {
      requireValidId(streamStop.id, 'stream_id');
      const result = streamingService.stopStream(streamStop.id);
      persistenceService.snapshot('stream.stopped').catch(() => {});
      return sendJson(res, 200, result);
    }

    const streamIngestChunk = extractParams(pathname, '/v1/streams/:id/ingest/chunk');
    if (method === 'POST' && streamIngestChunk) {
      requireValidId(streamIngestChunk.id, 'stream_id');
      const body = await readJsonBody(req, runtime.maxIngestBodyBytes);
      return sendJson(res, 201, await streamingService.ingestChunk(streamIngestChunk.id, body));
    }

    const streamCaptions = extractParams(pathname, '/v1/streams/:id/captions');
    if (method === 'GET' && streamCaptions) {
      requireValidId(streamCaptions.id, 'stream_id');
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
      requireValidId(streamAudio.id, 'stream_id');
      const viewerId = url.searchParams.get('viewer_id');
      return sendJson(res, 200, streamingService.getAudioDescription(streamAudio.id, { viewer_id: viewerId }));
    }

    const streamSign = extractParams(pathname, '/v1/streams/:id/sign-overlay');
    if (method === 'GET' && streamSign) {
      requireValidId(streamSign.id, 'stream_id');
      const viewerId = url.searchParams.get('viewer_id');
      return sendJson(res, 200, streamingService.getSignOverlay(streamSign.id, { viewer_id: viewerId }));
    }

    const streamSse = extractParams(pathname, '/v1/streams/:id/events/stream');
    if (method === 'GET' && streamSse) {
      requireValidId(streamSse.id, 'stream_id');
      const options = { viewer_id: url.searchParams.get('viewer_id'), language: url.searchParams.get('language') };
      // Validate the stream/profile before committing event-stream headers.
      const captions = streamingService.getCaptions(streamSse.id, 'vtt', options.language, options);
      const audio = streamingService.getAudioDescription(streamSse.id, options);
      const sign = streamingService.getSignOverlay(streamSse.id, options);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      res.write(': connected\n\n');
      incrementSse();
      const sseStart = Date.now();
      seams.usage.record({
        kind: 'sse_connect',
        streamId: streamSse.id,
        ts: new Date().toISOString(),
        tenant: req.tenant || null
      });

      const idleTimeout = setTimeout(() => {
        res.end();
      }, runtime.sseIdleTimeoutMs);

      function onEvent(data) {
        try {
          const event = streamingService.getLiveEvent(streamSse.id, data, options);
          if (!event) return;
          incrementSseEvents();
          idleTimeout.refresh();
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch { res.end(); }
      }

      const eventKey = `stream:${streamSse.id}`;
      streamEmitter.on(eventKey, onEvent);
      res.write(`data: ${JSON.stringify({
        type: 'snapshot', stream_id: streamSse.id, captions: captions.captions,
        audio_description: audio.segments, sign: sign.segments, sign_theme: sign.theme,
        captions_interrupted: streamingService.isCaptioningInterrupted(streamSse.id),
        demo: streamingService.isDemoStream(streamSse.id)
      })}\n\n`);
      let closed = false;
      const cleanup = () => {
        // Runs on both request close and response error; count once.
        if (closed) return;
        closed = true;
        clearTimeout(idleTimeout);
        decrementSse();
        streamEmitter.off(eventKey, onEvent);
        seams.telemetry.onSse({
          streamId: streamSse.id,
          durationMs: Date.now() - sseStart,
          tenant: req.tenant || null
        });
      };
      req.on('close', cleanup);
      res.on('error', cleanup);
      return;
    }

    const streamEvents = extractParams(pathname, '/v1/streams/:id/events');
    if (method === 'GET' && streamEvents) {
      requireValidId(streamEvents.id, 'stream_id');
      return sendJson(res, 200, {
        stream_id: streamEvents.id,
        events: streamingService.getEvents(streamEvents.id)
      });
    }

    const streamHealth = extractParams(pathname, '/v1/streams/:id/health');
    if (method === 'GET' && streamHealth) {
      requireValidId(streamHealth.id, 'stream_id');
      return sendJson(res, 200, streamingService.getHealth(streamHealth.id));
    }

    const streamFeedbackSummary = extractParams(pathname, '/v1/streams/:id/feedback-summary');
    if (method === 'GET' && streamFeedbackSummary) {
      requireValidId(streamFeedbackSummary.id, 'stream_id');
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
      requireValidId(incidentResolve.id, 'incident_id');
      const body = await readJsonBody(req);
      const result = await streamingService.resolveIncident(incidentResolve.id, body);
      persistenceService.snapshot('incident.resolved').catch(() => {});
      return sendJson(res, 200, result);
    }

    if (method === 'POST' && pathname === '/v1/feedback') {
      const body = await readJsonBody(req);
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
      const body = await readJsonBody(req);
      return sendJson(res, 201, adIntegrationService.createSession(body));
    }

    const adSessionEvent = extractParams(pathname, '/v1/ad/sessions/:id/events');
    if (method === 'POST' && adSessionEvent) {
      requireValidId(adSessionEvent.id, 'ad_session_id');
      const body = await readJsonBody(req);
      return sendJson(res, 201, adIntegrationService.logEvent(adSessionEvent.id, body));
    }

    const adSessionDetail = extractParams(pathname, '/v1/ad/sessions/:id');
    if (method === 'GET' && adSessionDetail) {
      requireValidId(adSessionDetail.id, 'ad_session_id');
      return sendJson(res, 200, adIntegrationService.getSession(adSessionDetail.id));
    }

    const adSessionTag = extractParams(pathname, '/v1/ad/sessions/:id/tag');
    if (method === 'GET' && adSessionTag) {
      requireValidId(adSessionTag.id, 'ad_session_id');
      return sendJson(res, 200, adIntegrationService.buildAdTag(adSessionTag.id));
    }

    const adSessionReport = extractParams(pathname, '/v1/ad/sessions/:id/report');
    if (method === 'GET' && adSessionReport) {
      requireValidId(adSessionReport.id, 'ad_session_id');
      return sendJson(res, 200, adIntegrationService.getSessionReport(adSessionReport.id));
    }

    const adCampaignReport = extractParams(pathname, '/v1/ad/campaigns/:campaignId/report');
    if (method === 'GET' && adCampaignReport) {
      requireValidId(adCampaignReport.campaignId, 'campaign_id');
      return sendJson(res, 200, adIntegrationService.getCampaignReport(adCampaignReport.campaignId));
    }

    if (method === 'GET' && pathname === '/v1/embed/overlay.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(streamingUiService.buildOverlayScript());
      return;
    }

    const viewerPage = extractParams(pathname, '/viewer/:streamId');
    if (method === 'GET' && viewerPage) {
      requireValidId(viewerPage.streamId, 'stream_id');
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
      const body = await readJsonBody(req);
      return sendJson(res, 200, await persistenceService.snapshot(body.reason || 'manual_api'));
    }

    if (method === 'GET' && pathname === '/v1/admin/metrics') {
      const outputs = [...store.streamOutputs.values()];
      const requestMetrics = getRequestMetrics();
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
        audit_log_entries: store.auditLog.length,
        ...requestMetrics
      });
    }

    if (method === 'GET' && pathname === '/v1/debug/state') {
      if (!runtime.debugEndpointsEnabled) {
        return sendJson(res, 404, { error: 'not_found' });
      }
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

    return sendNotFound(req, res);
  } catch (error) {
    return handleError(req, res, error, requestId);
  } finally {
    decrementConnections();
    const durationMs = Date.now() - startTime;
    logRequest({ method, path: pathname, statusCode: res.statusCode, durationMs, requestId });
    const tenant = req.tenant || null;
    seams.telemetry.onRequest({ method, path: pathname, statusCode: res.statusCode, durationMs, requestId, tenant });
    seams.usage.record({ kind: 'request', method, path: pathname, statusCode: res.statusCode, ts: new Date().toISOString(), tenant });
  }
}

function wantsHtml(req) {
  const accept = String(req.headers['accept'] || '');
  if (!accept) return false;
  if (accept.includes('application/json')) return false;
  return accept.includes('text/html') || accept.includes('*/*') && req.method === 'GET';
}

function sendNotFound(req, res) {
  if (wantsHtml(req)) {
    return sendHtml(res, 404, buildErrorPage(404, 'Not found', 'This page could not be found.'));
  }
  return notFound(res);
}

function handleError(req, res, error, requestId) {
  if (error instanceof PayloadTooLargeError) {
    return sendJson(res, 413, { error: 'payload_too_large', limit_bytes: error.limit });
  }
  const status = Number(error?.statusCode) || 0;
  const code = error?.code;
  if (status >= 400 && status < 500 && code) {
    // Client-visible validation/not-found errors keep their code (plus any
    // structured details such as the missing field) but do not leak raw messages.
    const details = error.details && typeof error.details === 'object' ? error.details : {};
    return sendJson(res, status, { ...details, error: code });
  }
  if ((status === 502 || status === 503) && code) {
    // A dependency (for example the model gateway) failed or is misconfigured.
    // The caller gets the stable code; the message is logged for operators.
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      requestId,
      code,
      message: error?.message
    }));
    const details = error.details && typeof error.details === 'object' ? error.details : {};
    return sendJson(res, status, { ...details, error: code, request_id: requestId });
  }
  // Internal errors: log server-side, return generic.
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({
    ts: new Date().toISOString(),
    level: 'error',
    requestId,
    message: error?.message,
    stack: error?.stack
  }));
  if (wantsHtml(req)) {
    return sendHtml(res, 500, buildErrorPage(500, 'Something went wrong', 'An internal error occurred. Reference: ' + requestId));
  }
  return sendJson(res, 500, { error: 'internal_error', request_id: requestId });
}

const server = http.createServer(route);

// Says at boot what would otherwise only show up on the first live request.
function reportModelProviderConfig() {
  const configured = String(process.env.MODEL_PROVIDER || 'mock').toLowerCase();
  const warn = (message) => {
    // eslint-disable-next-line no-console
    console.warn(JSON.stringify({ ts: new Date().toISOString(), level: 'warn', message }));
  };
  try {
    createModelProvider({ provider: configured });
  } catch (error) {
    warn(`Model provider is misconfigured: ${error.message}. Streams that use it will fail with ${error.code} until this is fixed.`);
    return;
  }
  if (configured === 'mock' && process.env.NODE_ENV === 'production') {
    warn('MODEL_PROVIDER is mock: caption, audio description and sign output is canned demo text, not real transcription.');
  }
}

export async function startServer(port = PORT) {
  reportModelProviderConfig();
  await persistenceService.configure(runtime);
  await persistenceService.loadLatest();

  return new Promise((resolve) => {
    server.listen(port, () => {
      resolve(server);
    });
  });
}

const cleanupTimers = [];

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer(PORT).then(() => {
    // eslint-disable-next-line no-console
    console.log(`Accessibility Broadcast API running on http://localhost:${PORT}`);

    const intervalMs = runtime.snapshotIntervalMs;
    if (intervalMs > 0) {
      cleanupTimers.push(setInterval(() => {
        persistenceService.snapshot('interval').catch(() => {});
      }, intervalMs));
    }

    const rlCleanup = setInterval(() => cleanupRateLimitWindows(), 5 * 60_000);
    if (typeof rlCleanup.unref === 'function') rlCleanup.unref();
    cleanupTimers.push(rlCleanup);

    if (runtime.cleanupIntervalMs > 0) {
      const retentionOpts = {
        streamTtlMs: runtime.retainStoppedStreamsMs,
        incidentTtlMs: runtime.retainResolvedIncidentsMs,
        feedbackTtlMs: runtime.retainFeedbackMs,
        adSessionTtlMs: runtime.retainAdSessionsMs,
        auditLogMaxEntries: runtime.auditLogMaxEntries
      };
      const retentionTimer = setInterval(() => {
        try {
          cleanupService.run(retentionOpts);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(JSON.stringify({
            ts: new Date().toISOString(),
            level: 'error',
            message: 'cleanup.run.failed',
            error: err?.message
          }));
        }
      }, runtime.cleanupIntervalMs);
      if (typeof retentionTimer.unref === 'function') retentionTimer.unref();
      cleanupTimers.push(retentionTimer);
    }
  });

  async function shutdown() {
    for (const timer of cleanupTimers) clearInterval(timer);
    await persistenceService.snapshot('shutdown').catch(() => {});
    await persistenceService.close();
    process.exit(0);
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.on('unhandledRejection', (err) => {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      message: 'unhandledRejection',
      error: err?.message,
      stack: err?.stack
    }));
  });
}
