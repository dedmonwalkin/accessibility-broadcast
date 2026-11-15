import { store } from '../data/store.js';

const DEFAULTS = {
  streamTtlMs: 24 * 60 * 60 * 1000,      // 24h for stopped streams + their outputs
  incidentTtlMs: 7 * 24 * 60 * 60 * 1000, // 7d for resolved incidents
  feedbackTtlMs: 30 * 24 * 60 * 60 * 1000, // 30d for feedback
  adSessionTtlMs: 24 * 60 * 60 * 1000,   // 24h for ad sessions
  auditLogMaxEntries: 10000              // cap audit log size
};

function toMs(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  const n = Date.parse(value);
  return Number.isFinite(n) ? n : null;
}

export const cleanupService = {
  run(opts = {}) {
    const now = Date.now();
    const config = { ...DEFAULTS, ...opts };
    const removed = { streams: 0, streamOutputs: 0, incidents: 0, feedback: 0, adSessions: 0, adEvents: 0, auditLog: 0 };

    // Stopped streams older than TTL
    for (const [id, stream] of store.streams) {
      if (stream.status !== 'stopped') continue;
      const stoppedAt = toMs(stream.stoppedAt || stream.updatedAt || stream.createdAt);
      if (stoppedAt == null || now - stoppedAt < config.streamTtlMs) continue;
      store.streams.delete(id);
      if (store.streamOutputs.delete(id)) removed.streamOutputs += 1;
      removed.streams += 1;
    }

    // Resolved incidents older than TTL
    for (const [id, incident] of store.incidents) {
      if (incident.status !== 'resolved') continue;
      const resolvedAt = toMs(incident.resolvedAt || incident.updatedAt || incident.createdAt);
      if (resolvedAt == null || now - resolvedAt < config.incidentTtlMs) continue;
      store.incidents.delete(id);
      removed.incidents += 1;
    }

    // Feedback older than TTL
    for (const [id, fb] of store.feedback) {
      const createdAt = toMs(fb.createdAt);
      if (createdAt == null || now - createdAt < config.feedbackTtlMs) continue;
      store.feedback.delete(id);
      removed.feedback += 1;
    }

    // Ad sessions older than TTL (plus their events)
    for (const [id, session] of store.adSessions) {
      const createdAt = toMs(session.createdAt);
      if (createdAt == null || now - createdAt < config.adSessionTtlMs) continue;
      store.adSessions.delete(id);
      removed.adSessions += 1;
      for (const [eventId, event] of store.adEvents) {
        if (event.ad_session_id === id || event.adSessionId === id) {
          store.adEvents.delete(eventId);
          removed.adEvents += 1;
        }
      }
    }

    // Cap the audit log
    if (store.auditLog.length > config.auditLogMaxEntries) {
      const drop = store.auditLog.length - config.auditLogMaxEntries;
      store.auditLog.splice(0, drop);
      removed.auditLog = drop;
    }

    const total = Object.values(removed).reduce((a, b) => a + b, 0);
    if (total > 0) {
      store.log('cleanup.expired', removed);
      // store.log itself appends one entry; re-apply the cap so we stay bounded.
      if (store.auditLog.length > config.auditLogMaxEntries) {
        store.auditLog.splice(0, store.auditLog.length - config.auditLogMaxEntries);
      }
    }
    return removed;
  }
};
