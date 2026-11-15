import { clientError } from './errors.js';

export function assertRequired(body, required) {
  for (const key of required) {
    if (body[key] === undefined || body[key] === null || body[key] === '') {
      throw clientError('missing_required_field', `Missing required field: ${key}`, { field: key });
    }
  }
}

export function normalizeConfidence(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(2));
}

export function computeCompletenessScore(event) {
  const required = [
    'source_event_id',
    'entity_id',
    'title',
    'start_at',
    'end_at',
    'location_name'
  ];
  const populated = required.filter((k) => Boolean(event[k])).length;
  return normalizeConfidence(populated / required.length);
}
