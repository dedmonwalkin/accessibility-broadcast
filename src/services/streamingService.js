import { store } from '../data/store.js';
import { assertRequired } from '../utils/validation.js';
import { createModelProvider } from './providers/modelProvider.js';
import {
  SUPPORTED_ACCESSIBILITY_PROFILES,
  SUPPORTED_AUDIO_DESCRIPTION_STYLES,
  SUPPORTED_CAPTION_STYLES,
  SUPPORTED_IMPAIRMENT_TYPES,
  SUPPORTED_OUTPUT_LANGUAGES,
  SUPPORTED_SIGN_LANGUAGES,
  SUPPORTED_SIGN_PRESENTATION_MODES,
  SUPPORTED_UI_MODES
} from '../config/accessibilityCatalog.js';
import { viewerPreferencesService } from './viewerPreferencesService.js';

const SUPPORTED_PROTOCOLS = new Set(['rtmp', 'srt']);
const DEFAULT_SIGNER = 'avatar-hope';
const LOW_CONFIDENCE_THRESHOLD = 0.72;

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
    id: `seg_${index + 1}`,
    ts_start: new Date(startMs).toISOString(),
    ts_end: new Date(endMs).toISOString(),
    transcript,
    scene,
    speaker,
    entities: Array.isArray(item.entities) ? item.entities : [],
    source_refs: Array.isArray(item.source_refs) ? item.source_refs : ['vision:v1', 'speech:v1']
  };
}

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

function pseudoTranslate(text, language) {
  if (language === 'en-US') return text;
  return `[${language}] ${text}`;
}

function buildCaptionTranslations(captions, outputLanguages) {
  const map = {};
  outputLanguages.forEach((language) => {
    map[language] = captions.map((segment) => ({
      ...segment,
      text: pseudoTranslate(segment.text, language)
    }));
  });
  return map;
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
  if (!stream) throw new Error('Stream not found');
  return stream;
}

function resolveViewerPreferences(streamId, viewerId) {
  if (!viewerId) return null;
  const viewer = viewerPreferencesService.resolveViewer(viewerId, streamId);
  return viewer.preferences;
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
      model_provider: String(input.model_provider || process.env.MODEL_PROVIDER || 'mock').toLowerCase(),
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
      throw new Error('Unsupported ingest protocol. Use rtmp or srt.');
    }

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
    const timeline = Array.isArray(input.mock_timeline) && input.mock_timeline.length
      ? input.mock_timeline.map((item, index) => asTimelineItem(item, index, anchorMs))
      : defaultTimeline(anchorMs);

    const providerConfig = {
      provider: input.model_provider || stream.model_provider,
      base_url: input.model_base_url,
      api_key: input.model_api_key,
      timeout_ms: input.model_timeout_ms
    };

    const generated = await runPipeline({
      stream,
      timeline,
      providerConfig
    });

    const outputs = store.streamOutputs.get(id);
    stream.output_languages = normalizeOutputLanguages(input.output_languages || stream.output_languages);
    stream.sign_languages = normalizeSignLanguages(input.sign_languages || stream.sign_languages);
    stream.sign_language = stream.sign_languages[0];
    stream.sign_presentation_mode = normalizeSignPresentationMode(
      input.sign_presentation_mode || stream.sign_presentation_mode
    );
    stream.accessibility_profiles = normalizeProfiles(input.accessibility_profiles || stream.accessibility_profiles);
    outputs.events = generated.events;
    outputs.captions = generated.captions;
    outputs.captionTranslations = buildCaptionTranslations(outputs.captions, stream.output_languages);
    outputs.audioDescription = generated.audioDescription;
    outputs.signScript = generated.signScript;
    outputs.signCards = buildSignCards(outputs.signScript);

    outputs.events.forEach((event) => {
      if (event.confidence >= LOW_CONFIDENCE_THRESHOLD) return;
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
    return stream;
  },

  getEvents(id) {
    assertStream(id);
    return store.streamOutputs.get(id)?.events || [];
  },

  getCaptions(id, format = 'vtt', language = null, options = {}) {
    const stream = assertStream(id);
    const viewer = resolveViewerPreferences(id, options.viewer_id);
    const outputs = store.streamOutputs.get(id) || { captions: [], captionTranslations: {} };
    const availableLanguages = stream.output_languages || ['en-US'];
    const fallbackLanguage = availableLanguages.includes('en-US')
      ? 'en-US'
      : availableLanguages[0] || 'en-US';
    const preferredLanguage = availableLanguages.includes(viewer?.caption_language)
      ? viewer.caption_language
      : fallbackLanguage;
    const hasRequestedLanguage = SUPPORTED_OUTPUT_LANGUAGES.includes(language) && availableLanguages.includes(language);
    const targetLanguage = hasRequestedLanguage ? language : preferredLanguage;
    const selectedCaptions = outputs.captionTranslations[targetLanguage] || outputs.captions;
    const captionStyle = SUPPORTED_CAPTION_STYLES.includes(viewer?.caption_style)
      ? viewer.caption_style
      : 'standard';
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

    return {
      stream_id: id,
      viewer_id: options.viewer_id || null,
      sign_language: signLanguage,
      signer_profile: signerProfile,
      sign_presentation_mode: signPresentationMode,
      overlay_url: `/v1/streams/${id}/sign-overlay.m3u8`,
      chroma_key: '#00FF00',
      segments: outputs.signScript,
      sign_cards: outputs.signCards || [],
      render_strategy: signPresentationMode === 'basic_signs_book' ? 'book_sign_cards' : 'avatar_2d'
    };
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

  resolveIncident(id, input = {}) {
    const incident = store.incidents.get(id);
    if (!incident) throw new Error('Incident not found');
    if (incident.status !== 'open') throw new Error('Incident already resolved');

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

        outputs.captionTranslations = buildCaptionTranslations(
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
