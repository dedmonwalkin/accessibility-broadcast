import { normalizeConfidence } from '../../utils/validation.js';

function confidenceFromText(timelineItem) {
  const transcriptScore = Math.min(String(timelineItem.transcript || '').length / 120, 1);
  const sceneScore = Math.min(String(timelineItem.scene || '').length / 100, 1);
  const entityScore = Math.min((timelineItem.entities || []).length / 3, 1);
  return normalizeConfidence(0.55 + transcriptScore * 0.2 + sceneScore * 0.2 + entityScore * 0.05);
}

function normalizeWords(text) {
  return String(text || '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

function asEventType(scene) {
  const normalized = String(scene || '').toLowerCase();
  if (normalized.includes('sprint') || normalized.includes('goal') || normalized.includes('shot')) return 'action';
  return 'commentary';
}

export const mockModelProvider = {
  name: 'mock',

  async inferPerception({ timelineItem }) {
    return {
      transcript: timelineItem.transcript,
      scene: timelineItem.scene,
      speaker: timelineItem.speaker,
      entities: timelineItem.entities,
      source_refs: timelineItem.source_refs,
      confidence: confidenceFromText(timelineItem)
    };
  },

  async inferAccessibility({ timelineItem, perception }) {
    return {
      segment_id: timelineItem.id,
      ts_start: timelineItem.ts_start,
      ts_end: timelineItem.ts_end,
      type: asEventType(perception.scene),
      text: perception.transcript,
      speaker: perception.speaker,
      entities: perception.entities,
      confidence: perception.confidence,
      source_refs: perception.source_refs,
      audio_description: perception.scene
    };
  },

  async inferSignScript({ accessibility }) {
    const glossTokens = normalizeWords(accessibility.text).slice(0, 12);
    return {
      id: accessibility.segment_id,
      start: accessibility.ts_start,
      end: accessibility.ts_end,
      gloss_tokens: glossTokens,
      facial_cues: accessibility.type === 'action' ? ['INTENSE-FOCUS'] : ['NEUTRAL'],
      confidence: accessibility.confidence,
      fallback_text: accessibility.text
    };
  }
};
