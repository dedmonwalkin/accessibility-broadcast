import { store } from '../data/store.js';
import { assertRequired } from '../utils/validation.js';
import { clientError } from '../utils/errors.js';
import {
  SUPPORTED_AUDIO_DESCRIPTION_STYLES,
  SUPPORTED_CAPTION_STYLES,
  SUPPORTED_IMPAIRMENT_TYPES,
  SUPPORTED_OUTPUT_LANGUAGES,
  SUPPORTED_SIGN_LANGUAGES,
  SUPPORTED_SIGN_PRESENTATION_MODES,
  SUPPORTED_UI_MODES,
  SUPPORTED_SIGN_OVERLAY_THEME_IDS
} from '../config/accessibilityCatalog.js';

const PROFILE_TO_IMPAIRMENT_MAP = {
  deaf_or_hard_of_hearing: ['deaf', 'hard_of_hearing'],
  blind_or_low_vision: ['blind', 'low_vision'],
  deafblind_support: ['deafblind'],
  cognitive_support: ['cognitive'],
  neurodivergent_support: ['neurodivergent'],
  dyslexia_support: ['dyslexia'],
  motor_mobility_support: ['motor_mobility'],
  speech_communication_support: ['speech_communication'],
  photosensitive_support: ['photosensitive']
};

function normalizeEnum(value, supported, fallback) {
  const normalized = String(value || '').trim();
  if (!supported.includes(normalized)) return fallback;
  return normalized;
}

function normalizeOutputLanguage(value, fallback, stream) {
  const normalized = String(value || '').trim();
  if (!SUPPORTED_OUTPUT_LANGUAGES.includes(normalized)) return fallback;
  const allowedByStream = Array.isArray(stream?.output_languages) && stream.output_languages.length
    ? stream.output_languages
    : ['en-US'];
  if (!allowedByStream.includes(normalized)) return fallback;
  return normalized;
}

function normalizeSignLanguage(value, fallback, stream) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!SUPPORTED_SIGN_LANGUAGES.includes(normalized)) return fallback;
  const allowedByStream = Array.isArray(stream?.sign_languages) && stream.sign_languages.length
    ? stream.sign_languages
    : ['ASL'];
  if (!allowedByStream.includes(normalized)) return fallback;
  return normalized;
}

function normalizeImpairmentTags(value, fallback = []) {
  if (!Array.isArray(value)) return fallback;
  const normalized = value
    .map((item) => String(item || '').trim().toLowerCase())
    .filter((item) => SUPPORTED_IMPAIRMENT_TYPES.includes(item));
  if (!normalized.length) return fallback;
  return [...new Set(normalized)];
}

function inferDefaultImpairmentTags(stream) {
  const profiles = Array.isArray(stream?.accessibility_profiles) ? stream.accessibility_profiles : [];
  const tags = [];
  profiles.forEach((profile) => {
    tags.push(...(PROFILE_TO_IMPAIRMENT_MAP[profile] || []));
  });
  return [...new Set(tags)];
}

function buildDefaultPreferences(stream) {
  const defaultCaptionLanguage = Array.isArray(stream?.output_languages) && stream.output_languages.length
    ? stream.output_languages[0]
    : 'en-US';

  return {
    caption_language: defaultCaptionLanguage,
    caption_style: 'standard',
    audio_description_style: 'standard',
    sign_language: stream?.sign_language || 'ASL',
    sign_presentation_mode: stream?.sign_presentation_mode || 'avatar_2d',
    signer_profile: stream?.signer_profile || 'avatar-hope',
    sign_overlay_theme: 'standard',
    ui_mode: 'default',
    impairment_tags: inferDefaultImpairmentTags(stream)
  };
}

function normalizePreferences(input = {}, stream, previous = null) {
  const base = previous || buildDefaultPreferences(stream);

  return {
    caption_language: normalizeOutputLanguage(input.caption_language, base.caption_language, stream),
    caption_style: normalizeEnum(input.caption_style, SUPPORTED_CAPTION_STYLES, base.caption_style),
    audio_description_style: normalizeEnum(
      input.audio_description_style,
      SUPPORTED_AUDIO_DESCRIPTION_STYLES,
      base.audio_description_style
    ),
    sign_language: normalizeSignLanguage(input.sign_language, base.sign_language, stream),
    sign_presentation_mode: normalizeEnum(
      input.sign_presentation_mode,
      SUPPORTED_SIGN_PRESENTATION_MODES,
      base.sign_presentation_mode
    ),
    signer_profile: input.signer_profile ? String(input.signer_profile).trim() : base.signer_profile,
    sign_overlay_theme: normalizeEnum(
      input.sign_overlay_theme,
      SUPPORTED_SIGN_OVERLAY_THEME_IDS,
      base.sign_overlay_theme
    ),
    ui_mode: normalizeEnum(input.ui_mode, SUPPORTED_UI_MODES, base.ui_mode),
    impairment_tags: normalizeImpairmentTags(input.impairment_tags, base.impairment_tags)
  };
}

function assertViewer(id) {
  const viewer = store.viewerProfiles.get(id);
  if (!viewer) throw clientError('viewer_not_found', 'Viewer not found');
  return viewer;
}

export const viewerPreferencesService = {
  createViewer(input = {}) {
    assertRequired(input, ['stream_id']);

    const stream = store.streams.get(input.stream_id);
    if (!stream) throw clientError('stream_not_found', 'Stream not found for viewer');

    const id = store.nextId('viewer');
    const now = store.nowIso();
    const profile = {
      id,
      stream_id: input.stream_id,
      display_name: input.display_name ? String(input.display_name).trim() : null,
      preferences: normalizePreferences(input.preferences || {}, stream),
      createdAt: now,
      updatedAt: now
    };

    store.viewerProfiles.set(id, profile);
    store.log('viewer.created', {
      viewerId: id,
      streamId: profile.stream_id
    });

    return profile;
  },

  getViewer(id) {
    return assertViewer(id);
  },

  resolveViewer(viewerId, streamId) {
    if (!viewerId) return null;
    const viewer = assertViewer(viewerId);
    if (viewer.stream_id !== streamId) {
      throw clientError('viewer_stream_mismatch', 'Viewer profile does not match stream');
    }
    return viewer;
  },

  getPreferences(id) {
    const viewer = assertViewer(id);
    return {
      viewer_id: viewer.id,
      stream_id: viewer.stream_id,
      preferences: viewer.preferences,
      supported: {
        caption_styles: SUPPORTED_CAPTION_STYLES,
        audio_description_styles: SUPPORTED_AUDIO_DESCRIPTION_STYLES,
        output_languages: SUPPORTED_OUTPUT_LANGUAGES,
        sign_languages: SUPPORTED_SIGN_LANGUAGES,
        sign_presentation_modes: SUPPORTED_SIGN_PRESENTATION_MODES,
        sign_overlay_themes: SUPPORTED_SIGN_OVERLAY_THEME_IDS,
        ui_modes: SUPPORTED_UI_MODES,
        impairment_tags: SUPPORTED_IMPAIRMENT_TYPES
      }
    };
  },

  updatePreferences(id, input = {}) {
    const viewer = assertViewer(id);
    const stream = store.streams.get(viewer.stream_id);
    if (!stream) throw clientError('stream_not_found', 'Stream not found for viewer');

    const patch = input.preferences && typeof input.preferences === 'object' ? input.preferences : input;
    if (input.display_name !== undefined) {
      viewer.display_name = input.display_name ? String(input.display_name).trim() : null;
    }
    viewer.preferences = normalizePreferences(patch || {}, stream, viewer.preferences);
    viewer.updatedAt = store.nowIso();

    store.log('viewer.preferences.updated', {
      viewerId: viewer.id,
      streamId: viewer.stream_id
    });

    return viewer;
  }
};
