export type StreamProtocol = 'rtmp' | 'srt';
export type ModelProvider = 'mock' | 'http';

export interface CreateStreamRequest {
  name: string;
  language?: string;
  sign_language?: string;
  sign_presentation_mode?: 'avatar_2d' | 'basic_signs_book';
  signer_profile?: string;
  target_latency_seconds?: number;
  model_provider?: ModelProvider;
  output_languages?: string[];
  sign_languages?: string[];
  accessibility_profiles?: string[];
}

export interface StartStreamRequest {
  protocol: StreamProtocol;
  source_url: string;
  transport?: string;
  camera_id?: string;
  model_provider?: ModelProvider;
  model_base_url?: string;
  model_api_key?: string;
  model_timeout_ms?: number;
  sign_presentation_mode?: 'avatar_2d' | 'basic_signs_book';
  mock_timeline?: Array<Record<string, unknown>>;
}

export interface CaptionSegment {
  id: string;
  start: string;
  end: string;
  text: string;
  speaker: string;
  confidence: number;
}

export interface SignScriptSegment {
  id: string;
  start: string;
  end: string;
  gloss_tokens: string[];
  facial_cues: string[];
  confidence: number;
  fallback_text: string;
}

export interface SignCardSegment {
  id: string;
  start: string;
  end: string;
  signs: Array<{ token: string; visual_hint: string }>;
  confidence: number;
  fallback_text: string;
}

export interface AudioDescriptionSegment {
  id: string;
  start: string;
  end: string;
  text: string;
  confidence: number;
}

export interface Incident {
  id: string;
  stream_id: string;
  segment_id: string;
  reason: string;
  severity: string;
  status: string;
  confidence: number;
  assigned_to: string | null;
  resolution: Record<string, unknown> | null;
}

export interface FeedbackInput {
  stream_id: string;
  ad_session_id?: string;
  viewer_id?: string;
  source?: 'viewer' | 'overlay' | 'onsite_qr' | string;
  rating?: number;
  issue_type?: 'captions' | 'audio_description' | 'sign_overlay' | 'latency' | 'translation' | 'other';
  impairment_type?:
    | 'deaf'
    | 'hard_of_hearing'
    | 'blind'
    | 'low_vision'
    | 'deafblind'
    | 'cognitive'
    | 'neurodivergent'
    | 'dyslexia'
    | 'motor_mobility'
    | 'speech_communication'
    | 'photosensitive'
    | 'other';
  message: string;
  contact?: string;
}

export interface ViewerPreferences {
  caption_language: string;
  caption_style: 'standard' | 'simplified' | 'verbatim';
  audio_description_style: 'standard' | 'concise' | 'detailed';
  sign_language: string;
  sign_presentation_mode: 'avatar_2d' | 'basic_signs_book';
  signer_profile: string;
  ui_mode: 'default' | 'high_contrast' | 'dyslexia_friendly' | 'reduced_motion';
  impairment_tags: string[];
}

export interface ViewerProfileInput {
  stream_id: string;
  display_name?: string;
  preferences?: Partial<ViewerPreferences>;
}

export interface ViewerProfile {
  id: string;
  stream_id: string;
  display_name: string | null;
  preferences: ViewerPreferences;
  createdAt: string;
  updatedAt: string;
}

export interface ViewerPreferencesResponse {
  viewer_id: string;
  stream_id: string;
  preferences: ViewerPreferences;
  supported: Record<string, string[]>;
}

export interface AdSessionInput {
  stream_id: string;
  ad_campaign_id: string;
  ad_break_id?: string;
  creative_id?: string;
  placement_id?: string;
  platform_type?: 'vast_vmap' | 'ssai' | 'csai' | 'web_sdk' | 'ctv_sdk' | 'other';
  locale?: string;
  overlay_mode?: string;
  safe_zone?: Record<string, unknown>;
}

export interface AccessibilityClientOptions {
  baseUrl?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export class AccessibilityClient {
  constructor(options?: AccessibilityClientOptions);

  health(): Promise<{ ok: boolean; service: string }>;
  createStream(input: CreateStreamRequest): Promise<Record<string, unknown>>;
  createViewer(input: ViewerProfileInput): Promise<ViewerProfile>;
  getViewer(viewerId: string): Promise<ViewerProfile>;
  getViewerPreferences(viewerId: string): Promise<ViewerPreferencesResponse>;
  updateViewerPreferences(viewerId: string, input: Partial<ViewerPreferences> | { preferences: Partial<ViewerPreferences>; display_name?: string }): Promise<ViewerProfile>;
  startStream(streamId: string, input: StartStreamRequest): Promise<Record<string, unknown>>;
  stopStream(streamId: string): Promise<Record<string, unknown>>;
  getCaptions(streamId: string, format?: 'vtt' | 'ttml', language?: string, viewerId?: string): Promise<{ captions: CaptionSegment[]; rendered: string; viewer_id?: string; caption_style?: string; language?: string }>;
  getAudioDescription(streamId: string, viewerId?: string): Promise<{ segments: AudioDescriptionSegment[]; stream_url: string; viewer_id?: string; audio_description_style?: string }>;
  getSignOverlay(streamId: string, viewerId?: string): Promise<{
    segments: SignScriptSegment[];
    sign_cards: SignCardSegment[];
    overlay_url: string;
    viewer_id?: string;
    sign_presentation_mode: 'avatar_2d' | 'basic_signs_book';
    render_strategy: 'avatar_2d' | 'book_sign_cards';
  }>;
  getEvents(streamId: string): Promise<{ events: Array<Record<string, unknown>> }>;
  getStreamHealth(streamId: string): Promise<Record<string, unknown>>;
  getAccessibilityCoverage(): Promise<Record<string, unknown>>;
  getFeedbackSummary(streamId: string): Promise<Record<string, unknown>>;
  createFeedback(input: FeedbackInput): Promise<Record<string, unknown>>;
  listIncidents(status?: 'open' | 'resolved'): Promise<{ incidents: Incident[] }>;
  resolveIncident(incidentId: string, input: { resolution: string; assigned_to?: string; corrected_text?: string }): Promise<Incident>;
  createAdSession(input: AdSessionInput): Promise<Record<string, unknown>>;
  logAdEvent(adSessionId: string, input: { event_type: string; at?: string; metadata?: Record<string, unknown> }): Promise<Record<string, unknown>>;
  getAdSession(adSessionId: string): Promise<Record<string, unknown>>;
  getAdTag(adSessionId: string): Promise<Record<string, unknown>>;
  getAdSessionReport(adSessionId: string): Promise<Record<string, unknown>>;
  getAdCampaignReport(campaignId: string): Promise<Record<string, unknown>>;
}
