import { store } from '../data/store.js';
import { assertRequired } from '../utils/validation.js';
import { clientError } from '../utils/errors.js';
import { SUPPORTED_IMPAIRMENT_TYPES } from '../config/accessibilityCatalog.js';

function normalizeRating(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 5) return null;
  return rounded;
}

function normalizeIssueType(value) {
  const allowed = new Set([
    'captions',
    'audio_description',
    'sign_overlay',
    'latency',
    'translation',
    'other'
  ]);
  const normalized = String(value || '').toLowerCase().trim();
  if (!allowed.has(normalized)) return 'other';
  return normalized;
}

function normalizeImpairment(value) {
  const allowed = new Set(SUPPORTED_IMPAIRMENT_TYPES);
  const normalized = String(value || '').toLowerCase().trim();
  if (!allowed.has(normalized)) return 'other';
  return normalized;
}

export const feedbackService = {
  create(input = {}) {
    assertRequired(input, ['stream_id', 'message']);

    const stream = store.streams.get(input.stream_id);
    if (!stream) throw clientError('stream_not_found', 'Stream not found for feedback');

    const id = store.nextId('feedback');
    const adSessionId = input.ad_session_id ? String(input.ad_session_id) : null;
    const viewerId = input.viewer_id ? String(input.viewer_id) : null;
    if (adSessionId && !store.adSessions.has(adSessionId)) {
      throw clientError('ad_session_not_found', 'Ad session not found for feedback');
    }
    if (viewerId && !store.viewerProfiles.has(viewerId)) {
      throw clientError('viewer_not_found', 'Viewer profile not found for feedback');
    }

    const entry = {
      id,
      stream_id: input.stream_id,
      ad_session_id: adSessionId,
      viewer_id: viewerId,
      source: input.source || 'viewer',
      message: String(input.message || '').trim(),
      rating: normalizeRating(input.rating),
      issue_type: normalizeIssueType(input.issue_type),
      impairment_type: normalizeImpairment(input.impairment_type),
      contact: input.contact ? String(input.contact).trim() : null,
      createdAt: store.nowIso()
    };

    store.feedback.set(id, entry);
    store.log('feedback.created', {
      feedbackId: id,
      streamId: entry.stream_id,
      issueType: entry.issue_type
    });

    return entry;
  },

  list(filters = {}) {
    const streamId = filters.stream_id || null;
    const issueType = filters.issue_type || null;
    const adSessionId = filters.ad_session_id || null;
    const viewerId = filters.viewer_id || null;
    return [...store.feedback.values()].filter((item) => {
      if (streamId && item.stream_id !== streamId) return false;
      if (issueType && item.issue_type !== issueType) return false;
      if (adSessionId && item.ad_session_id !== adSessionId) return false;
      if (viewerId && item.viewer_id !== viewerId) return false;
      return true;
    });
  },

  summarizeByStream(streamId) {
    const items = this.list({ stream_id: streamId });
    const ratings = items.map((item) => item.rating).filter((value) => Number.isFinite(value));
    const avgRating = ratings.length
      ? Number((ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(2))
      : null;

    const byIssue = {};
    const byImpairment = {};

    items.forEach((item) => {
      byIssue[item.issue_type] = (byIssue[item.issue_type] || 0) + 1;
      byImpairment[item.impairment_type] = (byImpairment[item.impairment_type] || 0) + 1;
    });

    return {
      stream_id: streamId,
      total: items.length,
      avg_rating: avgRating,
      by_issue_type: byIssue,
      by_impairment_type: byImpairment,
      recent: items.slice(-10).reverse()
    };
  }
};
