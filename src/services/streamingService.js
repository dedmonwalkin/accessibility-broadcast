import { EventEmitter } from 'node:events';
import { store } from '../data/store.js';
import { assertRequired } from '../utils/validation.js';
import { clientError, isModelProviderError } from '../utils/errors.js';
import { createModelProvider, resolveModelProviderName } from './providers/modelProvider.js';
import { createTranslationProvider } from './providers/translationProvider.js';
import { runtimeConfig } from '../config/runtime.js';

const translationProvider = createTranslationProvider();

export const streamEmitter = new EventEmitter();
streamEmitter.setMaxListeners(runtimeConfig().maxSseListeners);
import {
  SUPPORTED_ACCESSIBILITY_PROFILES,
  SUPPORTED_AUDIO_DESCRIPTION_STYLES,
  SUPPORTED_CAPTION_STYLES,
  SUPPORTED_IMPAIRMENT_TYPES,
  SUPPORTED_OUTPUT_LANGUAGES,
  SUPPORTED_SIGN_LANGUAGES,
  SUPPORTED_SIGN_PRESENTATION_MODES,
  SUPPORTED_UI_MODES,
  SIGN_OVERLAY_THEMES
} from '../config/accessibilityCatalog.js';
import { viewerPreferencesService } from './viewerPreferencesService.js';

const SUPPORTED_PROTOCOLS = new Set(['rtmp', 'srt']);
const DEFAULT_SIGNER = 'avatar-hope';
const DEFAULT_THEME = SIGN_OVERLAY_THEMES.find((t) => t.id === 'standard');

function resolveSignOverlayTheme(themeId) {
  return SIGN_OVERLAY_THEMES.find((t) => t.id === themeId) || DEFAULT_THEME;
}

function toSeconds(iso) {
  return Math.floor(new Date(iso).getTime() / 1000);
}

function asTimelineItem(item, index, anchorMs) {
  const startMs = anchorMs + index * 2000;
  const endMs = startMs + 2000;
  const transcript = String(item.transcript || item.text || '').trim() || 'Crowd reacts to live action.';
  const scene = String(item.scene || item.visual || '').trim() || 'Wide camera shot of the event stage';
  const speaker = String(item.speaker || 'unknown').trim() || 'unknown';

  return {
    id: store.nextId('segment'),
    ts_start: new Date(startMs).toISOString(),
    ts_end: new Date(endMs).toISOString(),
    transcript,
    scene,
    speaker,
    entities: Array.isArray(item.entities) ? item.entities : [],
    source_refs: Array.isArray(item.source_refs) ? item.source_refs : ['vision:v1', 'speech:v1']
  };
}

// Canned demo content. It is only ever used for streams on the mock provider;
// a stream on a real provider shows nothing until real audio has been processed.
function defaultTimeline(anchorMs) {
  return [
    asTimelineItem(
      {
        transcript: 'Welcome to tonight\'s championship game. Teams are entering the field.',
        scene: 'Players enter from the tunnel while fans stand and cheer',
        speaker: 'announcer',
        entities: ['home-team', 'away-team', 'announcer']
      },
      0,
      anchorMs
    ),
    asTimelineItem(
      {
        transcript: 'The home team wins possession and starts a fast break toward the goal.',
        scene: 'Camera tracks a sprinting attacker moving right to left',
        speaker: 'commentator',
        entities: ['home-team', 'attacker']
      },
      1,
      anchorMs
    ),
    asTimelineItem(
      {
        transcript: 'A close call at midfield. Officials are reviewing the play.',
        scene: 'Officials signal for review while players wait',
        speaker: 'commentator',
        entities: ['officials']
      },
      2,
      anchorMs
    )
  ];
}

function toCaptionSegment(event) {
  return {
    id: event.segment_id,
    start: event.ts_start,
    end: event.ts_end,
    text: event.text,
    speaker: event.speaker,
    confidence: event.confidence
  };
}

function toAudioDescriptionSegment(event) {
  return {
    id: event.segment_id,
    start: event.ts_start,
    end: event.ts_end,
    text: `Audio description: ${event.audio_description}`,
    confidence: event.confidence
  };
}

function normalizeOutputLanguages(input = []) {
  const values = Array.isArray(input) ? input : [];
  const normalized = values
    .map((value) => String(value || '').trim())
    .filter((value) => SUPPORTED_OUTPUT_LANGUAGES.includes(value));
  return normalized.length ? [...new Set(normalized)] : ['en-US'];
}

function normalizeSignLanguages(input = []) {
  const values = Array.isArray(input) ? input : [];
  const normalized = values
    .map((value) => String(value || '').trim().toUpperCase())
    .filter((value) => SUPPORTED_SIGN_LANGUAGES.includes(value));
  return normalized.length ? [...new Set(normalized)] : ['ASL'];
}

function normalizeProfiles(input = []) {
  const values = Array.isArray(input) ? input : [];
  const normalized = values
    .map((value) => String(value || '').trim())
    .filter((value) => SUPPORTED_ACCESSIBILITY_PROFILES.includes(value));
  return normalized.length ? [...new Set(normalized)] : ['deaf_or_hard_of_hearing', 'blind_or_low_vision'];
}

async function buildCaptionTranslations(captions, outputLanguages, onLanguage = () => {}) {
  const map = {};
  await Promise.all(
    outputLanguages.map(async (language) => {
      map[language] = await Promise.all(
        captions.map(async (segment) => {
          const result = await translationProvider.translateCaption(segment.text, language);
          return {
            ...segment, text: result.text, translation_status: result.status,
            language: result.status === 'unavailable' || result.status === 'original' ? 'en-US' : language,
            target_language: language
          };
        })
      );
      onLanguage(language, map[language]);
    })
  );
  return map;
}

function captionSettings(stream, viewer, language) {
  const availableLanguages = stream.output_languages || ['en-US'];
  const fallback = availableLanguages.includes('en-US') ? 'en-US' : availableLanguages[0] || 'en-US';
  const preferred = availableLanguages.includes(viewer?.caption_language) ? viewer.caption_language : fallback;
  return {
    targetLanguage: availableLanguages.includes(language) ? language : preferred,
    captionStyle: SUPPORTED_CAPTION_STYLES.includes(viewer?.caption_style) ? viewer.caption_style : 'standard',
    availableLanguages
  };
}

function originalCaption(segment, stream, targetLanguage) {
  return {
    ...segment, language: stream.language, target_language: targetLanguage,
    translation_status: targetLanguage === stream.language ? 'original' : 'pending'
  };
}

async function translateAndPublish(stream, outputs, captions) {
  await buildCaptionTranslations(captions, stream.output_languages, (language, segments) => {
    if (store.streamOutputs.get(stream.id) !== outputs) return;
    const byId = new Map((outputs.captionTranslations[language] || []).map(segment => [segment.id, segment]));
    segments.forEach(segment => byId.set(segment.id, segment));
    // Preserve source order even if concurrent translation requests finish out of order.
    outputs.captionTranslations[language] = outputs.captions.map(segment => byId.get(segment.id)).filter(Boolean);
    if (stream.status !== 'running' || language === stream.language) return;
    segments.forEach(segment => streamEmitter.emit(`stream:${stream.id}`, {
      type: 'caption.translation', stream_id: stream.id, segment_id: segment.id,
      target_language: language, segment
    }));
  });
}

function normalizeSignPresentationMode(value) {
  const normalized = String(value || '').toLowerCase().trim();
  if (!SUPPORTED_SIGN_PRESENTATION_MODES.includes(normalized)) return 'avatar_2d';
  return normalized;
}

function buildSignCards(signScript = []) {
  return signScript.map((segment) => ({
    id: segment.id,
    start: segment.start,
    end: segment.end,
    signs: segment.gloss_tokens.map((token) => ({
      token,
      visual_hint: `BOOK_SIGN:${token}`
    })),
    confidence: segment.confidence,
    fallback_text: segment.fallback_text
  }));
}

function simplifyText(text, maxWords = 12) {
  const cleaned = String(text || '')
    .replace(/\[[A-Za-z-]{2,10}\]\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';

  const firstSentence = cleaned.split(/[.!?]/).map((item) => item.trim()).find(Boolean) || cleaned;
  const words = firstSentence.split(/\s+/);
  if (words.length <= maxWords) return firstSentence;
  return `${words.slice(0, maxWords).join(' ')}...`;
}

function personalizeCaptions(captions, captionStyle = 'standard') {
  if (captionStyle === 'verbatim') return captions.map((item) => ({ ...item }));
  if (captionStyle !== 'simplified') return captions.map((item) => ({ ...item }));
  return captions.map((item) => ({
    ...item,
    text: simplifyText(item.text, 10)
  }));
}

function personalizeAudioSegments(segments, style = 'standard') {
  if (style === 'detailed') {
    return segments.map((segment) => ({
      ...segment,
      text: `${segment.text} Context emphasis enabled.`
    }));
  }
  if (style === 'concise') {
    return segments.map((segment) => ({
      ...segment,
      text: `Audio description: ${simplifyText(segment.text, 8)}`
    }));
  }
  return segments.map((segment) => ({ ...segment }));
}

function formatTimecode(iso) {
  const date = new Date(iso);
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function formatVtt(captions) {
  const rows = ['WEBVTT', ''];
  for (const c of captions) {
    rows.push(`${formatTimecode(c.start)} --> ${formatTimecode(c.end)}`);
    rows.push(c.text);
    rows.push('');
  }
  return rows.join('\n');
}

function formatTtml(captions) {
  const body = captions
    .map(
      (c) =>
        `<p begin="${formatTimecode(c.start)}" end="${formatTimecode(c.end)}"><span>${escapeXml(c.text)}</span></p>`
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?><tt xmlns="http://www.w3.org/ns/ttml"><body><div>${body}</div></body></tt>`;
}

function escapeXml(input) {
  return String(input)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function assertStream(id) {
  const stream = store.streams.get(id);
  if (!stream) throw clientError('stream_not_found', 'Stream not found');
  return stream;
}

function resolveViewerPreferences(streamId, viewerId) {
  if (!viewerId) return null;
  const viewer = viewerPreferencesService.resolveViewer(viewerId, streamId);
  return viewer.preferences;
}

// Model gateway failures are never papered over with mock output. The first
// failure on a running stream opens one incident and tells connected viewers
// that captions are interrupted; later failures update that incident.
function recordModelProviderFailure(stream, error) {
  const now = store.nowIso();
  const previous = stream.model_provider_status;
  const alreadyInterrupted = previous?.state === 'interrupted';
  const existingIncident = alreadyInterrupted ? store.incidents.get(previous.incident_id) : null;

  let incidentId = existingIncident?.id || null;
  if (existingIncident) {
    existingIncident.failed_requests += 1;
    existingIncident.last_error_at = now;
    existingIncident.updatedAt = now;
  } else if (stream.status === 'running') {
    incidentId = store.nextId('incident');
    store.incidents.set(incidentId, {
      id: incidentId,
      stream_id: stream.id,
      segment_id: null,
      reason: 'model_provider_error',
      error_code: error.code,
      operation: error.details?.operation || null,
      severity: 'high',
      status: 'open',
      confidence: null,
      failed_requests: 1,
      last_error_at: now,
      assigned_to: null,
      resolution: null,
      createdAt: now,
      updatedAt: now
    });
  }

  stream.model_provider_status = {
    state: 'interrupted',
    error_code: error.code,
    since: alreadyInterrupted ? previous.since : now,
    last_error_at: now,
    incident_id: incidentId
  };
  stream.updatedAt = now;

  store.log('stream.model_provider.failed', {
    streamId: stream.id,
    errorCode: error.code,
    operation: error.details?.operation || null,
    incidentId
  });

  if (!alreadyInterrupted && stream.status === 'running') {
    streamEmitter.emit(`stream:${stream.id}`, {
      type: 'captions.interrupted',
      stream_id: stream.id,
      reason: error.code
    });
  }
}

function recordModelProviderSuccess(stream) {
  const wasInterrupted = stream.model_provider_status?.state === 'interrupted';
  stream.model_provider_status = { state: 'ok' };
  if (wasInterrupted) store.log('stream.model_provider.recovered', { streamId: stream.id });
}

async function runPipeline({ stream, timeline, providerConfig }) {
  const provider = createModelProvider(providerConfig);
  const events = [];
  const signScript = [];

  for (const timelineItem of timeline) {
    const perception = await provider.inferPerception({ timelineItem, stream });
    const accessibility = await provider.inferAccessibility({
      timelineItem,
      perception,
      stream
    });
    const sign = await provider.inferSignScript({
      accessibility,
      timelineItem,
      stream
    });

    events.push(accessibility);
    signScript.push(sign);

    streamEmitter.emit(`stream:${stream.id}`, {
      type: 'segment',
      stream_id: stream.id,
      segment: toCaptionSegment(accessibility),
      audio_description: toAudioDescriptionSegment(accessibility),
      sign
    });
  }

  return {
    provider: provider.name,
    events,
    signScript,
    captions: events.map(toCaptionSegment),
    audioDescription: events.map(toAudioDescriptionSegment)
  };
}

export const streamingService = {
  createStream(input = {}) {
    assertRequired(input, ['name']);
    const modelProvider = resolveModelProviderName(input.model_provider);

    const id = store.nextId('stream');
    const now = store.nowIso();
    const stream = {
      id,
      name: String(input.name).trim(),
      language: input.language === 'en-US' ? 'en-US' : 'en-US',
      output_languages: normalizeOutputLanguages(input.output_languages),
      sign_languages: normalizeSignLanguages(input.sign_languages || [input.sign_language || 'ASL']),
      sign_presentation_mode: normalizeSignPresentationMode(input.sign_presentation_mode),
      accessibility_profiles: normalizeProfiles(input.accessibility_profiles),
      signer_profile: input.signer_profile || DEFAULT_SIGNER,
      target_latency_seconds: input.target_latency_seconds || 7,
      status: 'created',
      ingest: null,
      model_provider: modelProvider,
      started_at: null,
      stopped_at: null,
      createdAt: now,
      updatedAt: now
    };
    stream.sign_language = stream.sign_languages[0];

    store.streams.set(id, stream);
    store.streamOutputs.set(id, {
      events: [],
      captions: [],
      captionTranslations: {},
      signScript: [],
      signCards: [],
      audioDescription: []
    });

    store.log('stream.created', {
      streamId: id,
      name: stream.name,
      modelProvider: stream.model_provider
    });
    return stream;
  },

  async startStream(id, input = {}) {
    const stream = assertStream(id);
    assertRequired(input, ['protocol', 'source_url']);

    const protocol = String(input.protocol || '').toLowerCase();
    if (!SUPPORTED_PROTOCOLS.has(protocol)) {
      throw clientError('unsupported_ingest_protocol', 'Unsupported ingest protocol. Use rtmp or srt.');
    }

    const startProvider = input.model_provider
      ? resolveModelProviderName(input.model_provider)
      : stream.model_provider;

    const beforeStart = { status: stream.status, started_at: stream.started_at, ingest: stream.ingest };
    stream.ingest = {
      protocol,
      source_url: input.source_url,
      camera_id: input.camera_id || null,
      transport: input.transport || (protocol === 'srt' ? 'caller' : 'push')
    };
    stream.status = 'running';
    stream.started_at = store.nowIso();
    stream.updatedAt = store.nowIso();

    const anchorMs = new Date(stream.started_at).getTime();
    // A timeline sent with the request is always used. Without one, only the
    // mock provider gets the demo timeline; a real provider starts empty.
    const hasRequestTimeline = Array.isArray(input.mock_timeline) && input.mock_timeline.length > 0;
    let timeline = [];
    if (hasRequestTimeline) {
      timeline = input.mock_timeline.map((item, index) => asTimelineItem(item, index, anchorMs));
    } else if (startProvider === 'mock') {
      timeline = defaultTimeline(anchorMs);
    }

    const providerConfig = {
      provider: startProvider,
      base_url: input.model_base_url,
      api_key: input.model_api_key,
      timeout_ms: input.model_timeout_ms
    };

    const outputs = store.streamOutputs.get(id);
    stream.output_languages = normalizeOutputLanguages(input.output_languages || stream.output_languages);
    stream.sign_languages = normalizeSignLanguages(input.sign_languages || stream.sign_languages);
    stream.sign_language = stream.sign_languages[0];
    stream.sign_presentation_mode = normalizeSignPresentationMode(
      input.sign_presentation_mode || stream.sign_presentation_mode
    );
    stream.accessibility_profiles = normalizeProfiles(input.accessibility_profiles || stream.accessibility_profiles);
    let generated;
    try {
      generated = await runPipeline({ stream, timeline, providerConfig });
    } catch (error) {
      // A stream that could not produce output is not left looking live.
      stream.status = beforeStart.status;
      stream.started_at = beforeStart.started_at;
      stream.ingest = beforeStart.ingest;
      if (isModelProviderError(error)) recordModelProviderFailure(stream, error);
      throw error;
    }
    // With nothing to process the provider was not called, so its status stays as it was.
    if (timeline.length) recordModelProviderSuccess(stream);
    outputs.events = generated.events;
    outputs.captions = generated.captions;
    outputs.captionTranslations = {};
    outputs.audioDescription = generated.audioDescription;
    outputs.signScript = generated.signScript;
    outputs.signCards = buildSignCards(outputs.signScript);
    await translateAndPublish(stream, outputs, outputs.captions);

    outputs.events.forEach((event) => {
      if (event.confidence >= runtimeConfig().lowConfidenceThreshold) return;
      const incidentId = store.nextId('incident');
      store.incidents.set(incidentId, {
        id: incidentId,
        stream_id: id,
        segment_id: event.segment_id,
        reason: 'low_confidence',
        severity: event.confidence < 0.6 ? 'high' : 'medium',
        status: 'open',
        confidence: event.confidence,
        assigned_to: null,
        resolution: null,
        createdAt: store.nowIso(),
        updatedAt: store.nowIso()
      });
    });

    store.log('stream.started', {
      streamId: id,
      protocol,
      eventCount: outputs.events.length,
      modelProvider: generated.provider
    });

    return {
      stream,
      generated: {
        provider: generated.provider,
        events: outputs.events.length,
        captions: outputs.captions.length,
        audioDescription: outputs.audioDescription.length,
        signScript: outputs.signScript.length
      }
    };
  },

  stopStream(id) {
    const stream = assertStream(id);
    stream.status = 'stopped';
    stream.stopped_at = store.nowIso();
    stream.updatedAt = store.nowIso();

    store.log('stream.stopped', { streamId: id });
    streamEmitter.emit(`stream:${id}`, { type: 'stream.stopped', stream_id: id });
    return stream;
  },

  async ingestChunk(id, input = {}) {
    const stream = assertStream(id);
    if (stream.status !== 'running') throw clientError('stream_not_running', 'Stream is not running');

    const providerConfig = { provider: stream.model_provider };
    const outputs = store.streamOutputs.get(id);
    let transcription;
    let accessibility;
    let sign;
    try {
      const provider = createModelProvider(providerConfig);

      transcription = await provider.transcribe({
        audio_base64: input.audio_base64 || null,
        format: input.format || 'wav',
        language: input.language || stream.language || 'en',
        duration_ms: input.duration_ms || 2000
      });

      const anchorMs = Date.now() - (input.duration_ms || 2000);
      const timelineItem = asTimelineItem(
        {
          transcript: transcription.transcript,
          scene: input.scene || transcription.scene || '',
          speaker: input.speaker || 'unknown',
          entities: input.entities || []
        },
        0,
        anchorMs
      );

      const perception = await provider.inferPerception({ timelineItem, stream });
      accessibility = await provider.inferAccessibility({ timelineItem, perception, stream });
      sign = await provider.inferSignScript({ accessibility, timelineItem, stream });
    } catch (error) {
      // Nothing is published for this chunk; see recordModelProviderFailure.
      if (isModelProviderError(error)) recordModelProviderFailure(stream, error);
      throw error;
    }
    recordModelProviderSuccess(stream);

    if (stream.status !== 'running') throw clientError('stream_not_running', 'Stream stopped while processing chunk');
    outputs.events.push(accessibility);
    const captionSegment = toCaptionSegment(accessibility);
    const audioSegment = toAudioDescriptionSegment(accessibility);
    outputs.captions.push(captionSegment);
    outputs.audioDescription.push(audioSegment);
    outputs.signScript.push(sign);
    outputs.signCards = buildSignCards(outputs.signScript);

    if (accessibility.confidence < runtimeConfig().lowConfidenceThreshold) {
      const incidentId = store.nextId('incident');
      store.incidents.set(incidentId, {
        id: incidentId,
        stream_id: id,
        segment_id: accessibility.segment_id,
        reason: 'low_confidence',
        severity: accessibility.confidence < 0.6 ? 'high' : 'medium',
        status: 'open',
        confidence: accessibility.confidence,
        assigned_to: null,
        resolution: null,
        createdAt: store.nowIso(),
        updatedAt: store.nowIso()
      });
    }

    streamEmitter.emit(`stream:${id}`, {
      type: 'segment',
      stream_id: id,
      segment: captionSegment,
      audio_description: audioSegment,
      sign
    });

    await translateAndPublish(stream, outputs, [captionSegment]);

    store.log('stream.chunk.ingested', {
      streamId: id,
      segmentId: accessibility.segment_id,
      confidence: accessibility.confidence
    });

    return {
      segment_id: accessibility.segment_id,
      segment: captionSegment,
      audio_description: audioSegment,
      sign,
      transcript_confidence: transcription.confidence
    };
  },

  getEvents(id) {
    assertStream(id);
    return store.streamOutputs.get(id)?.events || [];
  },

  getLiveEvent(id, data, options = {}) {
    const stream = assertStream(id);
    const viewer = resolveViewerPreferences(id, options.viewer_id);
    const { targetLanguage, captionStyle } = captionSettings(stream, viewer, options.language);
    if (!['segment', 'caption.translation'].includes(data.type)) return { ...data };
    if (data.type === 'caption.translation' && data.target_language !== targetLanguage) return null;
    const caption = data.type === 'segment' ? originalCaption(data.segment, stream, targetLanguage) : data.segment;
    const event = {
      ...data, viewer_id: options.viewer_id || null,
      segment: personalizeCaptions([caption], captionStyle)[0]
    };
    if (data.audio_description) event.audio_description = personalizeAudioSegments([data.audio_description], viewer?.audio_description_style)[0];
    return event;
  },

  getCaptions(id, format = 'vtt', language = null, options = {}) {
    const stream = assertStream(id);
    const viewer = resolveViewerPreferences(id, options.viewer_id);
    const outputs = store.streamOutputs.get(id) || { captions: [], captionTranslations: {} };
    const { targetLanguage, captionStyle, availableLanguages } = captionSettings(stream, viewer, language);
    const translations = new Map((outputs.captionTranslations[targetLanguage] || []).map(segment => [segment.id, segment]));
    const selectedCaptions = outputs.captions.map(segment => translations.get(segment.id) || originalCaption(segment, stream, targetLanguage));
    const personalizedCaptions = personalizeCaptions(selectedCaptions, captionStyle);
    const normalized = String(format || 'vtt').toLowerCase();

    if (normalized === 'ttml') {
      return {
        stream_id: id,
        viewer_id: options.viewer_id || null,
        language: targetLanguage,
        caption_style: captionStyle,
        available_languages: availableLanguages,
        format: 'ttml',
        captions: personalizedCaptions,
        rendered: formatTtml(personalizedCaptions)
      };
    }

    return {
      stream_id: id,
      viewer_id: options.viewer_id || null,
      language: targetLanguage,
      caption_style: captionStyle,
      available_languages: availableLanguages,
      format: 'vtt',
      captions: personalizedCaptions,
      rendered: formatVtt(personalizedCaptions)
    };
  },

  getAudioDescription(id, options = {}) {
    assertStream(id);
    const viewer = resolveViewerPreferences(id, options.viewer_id);
    const outputs = store.streamOutputs.get(id) || { audioDescription: [] };
    const audioDescriptionStyle = SUPPORTED_AUDIO_DESCRIPTION_STYLES.includes(viewer?.audio_description_style)
      ? viewer.audio_description_style
      : 'standard';
    const segments = personalizeAudioSegments(outputs.audioDescription, audioDescriptionStyle);

    return {
      stream_id: id,
      viewer_id: options.viewer_id || null,
      track_kind: 'audio_description',
      audio_description_style: audioDescriptionStyle,
      stream_url: `/v1/streams/${id}/audio-description.m3u8`,
      segments
    };
  },

  getSignOverlay(id, options = {}) {
    const stream = assertStream(id);
    const viewer = resolveViewerPreferences(id, options.viewer_id);
    const outputs = store.streamOutputs.get(id) || { signScript: [] };
    const signPresentationMode = normalizeSignPresentationMode(
      viewer?.sign_presentation_mode || stream.sign_presentation_mode || 'avatar_2d'
    );

    const preferredSignLanguage = String(viewer?.sign_language || stream.sign_language || 'ASL').toUpperCase();
    const availableSignLanguages = stream.sign_languages || [stream.sign_language || 'ASL'];
    const signLanguage = availableSignLanguages.includes(preferredSignLanguage)
      ? preferredSignLanguage
      : stream.sign_language;

    const signerProfile = viewer?.signer_profile || stream.signer_profile;
    const themeId = viewer?.sign_overlay_theme || 'standard';
    const theme = resolveSignOverlayTheme(themeId);

    return {
      stream_id: id,
      viewer_id: options.viewer_id || null,
      sign_language: signLanguage,
      signer_profile: signerProfile,
      sign_presentation_mode: signPresentationMode,
      sign_overlay_theme: theme.id,
      theme,
      overlay_url: `/v1/streams/${id}/sign-overlay.m3u8`,
      chroma_key: '#00FF00',
      segments: outputs.signScript,
      sign_cards: outputs.signCards || [],
      render_strategy: signPresentationMode === 'basic_signs_book' ? 'book_sign_cards' : 'avatar_2d'
    };
  },

  isCaptioningInterrupted(id) {
    const stream = assertStream(id);
    return stream.status === 'running' && stream.model_provider_status?.state === 'interrupted';
  },

  getHealth(id) {
    const stream = assertStream(id);
    const outputs = store.streamOutputs.get(id) || { events: [] };
    const incidents = [...store.incidents.values()].filter((incident) => incident.stream_id === id);

    const openIncidents = incidents.filter((incident) => incident.status === 'open').length;
    const latencies = outputs.events.map((event) => {
      const delta = Math.max(toSeconds(event.ts_end) - toSeconds(event.ts_start), 1);
      return Math.min(delta + 2, 7);
    });
    const p95 = latencies.length ? Math.max(...latencies) : 0;

    return {
      stream_id: id,
      status: stream.status,
      target_latency_seconds: stream.target_latency_seconds,
      model_provider: stream.model_provider,
      // unknown until the provider has been called for this stream.
      model_provider_status: stream.model_provider_status?.state || 'unknown',
      captions_interrupted_since: stream.model_provider_status?.state === 'interrupted'
        ? stream.model_provider_status.since
        : null,
      output_languages: stream.output_languages || ['en-US'],
      sign_languages: stream.sign_languages || [stream.sign_language || 'ASL'],
      sign_presentation_mode: stream.sign_presentation_mode || 'avatar_2d',
      accessibility_profiles: stream.accessibility_profiles || [],
      p95_latency_seconds: p95,
      generated_segments: outputs.events.length,
      open_incidents: openIncidents,
      updated_at: stream.updatedAt
    };
  },

  getAccessibilityCoverage() {
    return {
      supported_output_languages: SUPPORTED_OUTPUT_LANGUAGES,
      supported_sign_languages: SUPPORTED_SIGN_LANGUAGES,
      supported_sign_presentation_modes: SUPPORTED_SIGN_PRESENTATION_MODES,
      supported_accessibility_profiles: SUPPORTED_ACCESSIBILITY_PROFILES,
      supported_impairment_types: SUPPORTED_IMPAIRMENT_TYPES,
      supported_caption_styles: SUPPORTED_CAPTION_STYLES,
      supported_audio_description_styles: SUPPORTED_AUDIO_DESCRIPTION_STYLES,
      supported_ui_modes: SUPPORTED_UI_MODES
    };
  },

  listIncidents({ status } = {}) {
    const normalized = status ? String(status).toLowerCase() : null;
    return [...store.incidents.values()].filter((incident) => {
      if (!normalized) return true;
      return incident.status === normalized;
    });
  },

  async resolveIncident(id, input = {}) {
    const incident = store.incidents.get(id);
    if (!incident) throw clientError('incident_not_found', 'Incident not found');
    if (incident.status !== 'open') throw clientError('incident_already_resolved', 'Incident already resolved');

    assertRequired(input, ['resolution']);

    incident.status = 'resolved';
    incident.assigned_to = input.assigned_to || 'operator';
    incident.resolution = {
      resolution: input.resolution,
      corrected_text: input.corrected_text || null,
      resolved_at: store.nowIso()
    };
    incident.updatedAt = store.nowIso();

    if (input.corrected_text) {
      const outputs = store.streamOutputs.get(incident.stream_id);
      const stream = store.streams.get(incident.stream_id);
      if (outputs) {
        const caption = outputs.captions.find((segment) => segment.id === incident.segment_id);
        if (caption) {
          caption.text = input.corrected_text;
          caption.confidence = 1;
        }

        const event = outputs.events.find((segment) => segment.segment_id === incident.segment_id);
        if (event) {
          event.text = input.corrected_text;
          event.confidence = 1;
        }

        const signSegment = outputs.signScript.find((segment) => segment.id === incident.segment_id);
        if (signSegment) {
          signSegment.fallback_text = input.corrected_text;
        }

        outputs.captionTranslations = await buildCaptionTranslations(
          outputs.captions,
          stream?.output_languages || ['en-US']
        );
        outputs.signCards = buildSignCards(outputs.signScript);
      }
    }

    store.log('incident.resolved', {
      incidentId: incident.id,
      streamId: incident.stream_id,
      assignedTo: incident.assigned_to
    });

    return incident;
  }
};
