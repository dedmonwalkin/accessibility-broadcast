import { store } from '../data/store.js';
import { assertRequired } from '../utils/validation.js';

const VALID_PLATFORM_TYPES = new Set([
  'vast_vmap',
  'ssai',
  'csai',
  'web_sdk',
  'ctv_sdk',
  'other'
]);

function normalizePlatformType(value) {
  const normalized = String(value || 'other').toLowerCase();
  if (!VALID_PLATFORM_TYPES.has(normalized)) return 'other';
  return normalized;
}

function normalizeEventType(value) {
  const allowed = new Set([
    'impression',
    'quartile_25',
    'quartile_50',
    'quartile_75',
    'complete',
    'click',
    'feedback_open',
    'feedback_submit',
    'overlay_rendered',
    'error'
  ]);
  const normalized = String(value || '').toLowerCase().trim();
  if (!allowed.has(normalized)) return 'other';
  return normalized;
}

function getSession(id) {
  const session = store.adSessions.get(id);
  if (!session) throw new Error('Ad session not found');
  return session;
}

function countEventsForSession(sessionId) {
  return [...store.adEvents.values()].filter((event) => event.ad_session_id === sessionId);
}

export const adIntegrationService = {
  createSession(input = {}) {
    assertRequired(input, ['stream_id', 'ad_campaign_id']);

    const stream = store.streams.get(input.stream_id);
    if (!stream) throw new Error('Stream not found for ad session');

    const id = store.nextId('ad_session');
    const now = store.nowIso();
    const session = {
      id,
      stream_id: input.stream_id,
      platform_type: normalizePlatformType(input.platform_type),
      ad_campaign_id: String(input.ad_campaign_id),
      ad_break_id: input.ad_break_id ? String(input.ad_break_id) : null,
      creative_id: input.creative_id ? String(input.creative_id) : null,
      placement_id: input.placement_id ? String(input.placement_id) : null,
      locale: input.locale || 'en-US',
      overlay_mode: input.overlay_mode || 'companion_panel',
      safe_zone: input.safe_zone || {
        horizontal: 'right',
        vertical: 'bottom',
        width_pct: 22,
        height_pct: 30
      },
      status: 'active',
      started_at: now,
      ended_at: null,
      createdAt: now,
      updatedAt: now
    };

    store.adSessions.set(id, session);
    store.log('ad.session.created', {
      adSessionId: id,
      streamId: session.stream_id,
      platformType: session.platform_type,
      campaign: session.ad_campaign_id
    });

    return session;
  },

  logEvent(sessionId, input = {}) {
    const session = getSession(sessionId);
    assertRequired(input, ['event_type']);

    const id = store.nextId('ad_event');
    const event = {
      id,
      ad_session_id: sessionId,
      stream_id: session.stream_id,
      event_type: normalizeEventType(input.event_type),
      at: input.at || store.nowIso(),
      metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {}
    };

    store.adEvents.set(id, event);
    session.updatedAt = store.nowIso();

    store.log('ad.event.logged', {
      adSessionId: sessionId,
      eventType: event.event_type
    });

    return event;
  },

  getSession(sessionId) {
    return getSession(sessionId);
  },

  getSessionReport(sessionId) {
    const session = getSession(sessionId);
    const events = countEventsForSession(sessionId);
    const incidents = [...store.incidents.values()].filter((item) => item.stream_id === session.stream_id);
    const feedback = [...store.feedback.values()].filter(
      (item) => item.stream_id === session.stream_id && (item.ad_session_id === sessionId || !item.ad_session_id)
    );

    const byEventType = {};
    events.forEach((event) => {
      byEventType[event.event_type] = (byEventType[event.event_type] || 0) + 1;
    });

    return {
      session,
      counts: {
        events: events.length,
        feedback: feedback.length,
        incidents: incidents.length,
        impressions: byEventType.impression || 0,
        completes: byEventType.complete || 0
      },
      by_event_type: byEventType,
      incidents_open: incidents.filter((item) => item.status === 'open').length,
      feedback_recent: feedback.slice(-10).reverse()
    };
  },

  getCampaignReport(campaignId) {
    const targetCampaign = String(campaignId);
    const sessions = [...store.adSessions.values()].filter((item) => item.ad_campaign_id === targetCampaign);
    const sessionReports = sessions.map((item) => this.getSessionReport(item.id));

    return {
      ad_campaign_id: targetCampaign,
      sessions: sessions.map((item) => ({
        id: item.id,
        stream_id: item.stream_id,
        platform_type: item.platform_type,
        creative_id: item.creative_id,
        started_at: item.started_at
      })),
      totals: {
        sessions: sessions.length,
        events: sessionReports.reduce((sum, report) => sum + report.counts.events, 0),
        feedback: sessionReports.reduce((sum, report) => sum + report.counts.feedback, 0),
        incidents: sessionReports.reduce((sum, report) => sum + report.counts.incidents, 0),
        impressions: sessionReports.reduce((sum, report) => sum + report.counts.impressions, 0),
        completes: sessionReports.reduce((sum, report) => sum + report.counts.completes, 0)
      }
    };
  },

  buildAdTag(sessionId) {
    const session = getSession(sessionId);
    return {
      ad_session_id: session.id,
      stream_id: session.stream_id,
      platform_type: session.platform_type,
      overlay_script_url: '/v1/embed/overlay.js',
      metadata_ping_url: `/v1/ad/sessions/${session.id}/events`,
      feedback_url: `/feedback?streamId=${encodeURIComponent(session.stream_id)}&source=ad`,
      integration_example: `<script>window.ACCESSIBILITY_STREAM_ID='${session.stream_id}';window.ACCESSIBILITY_AD_SESSION_ID='${session.id}';<\/script><script src="/v1/embed/overlay.js"><\/script>`
    };
  }
};
