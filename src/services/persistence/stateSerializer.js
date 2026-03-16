import { store } from '../../data/store.js';

function mapToEntries(map) {
  return [...map.entries()];
}

function entriesToMap(entries) {
  return new Map(entries || []);
}

export function exportState() {
  return {
    streams: mapToEntries(store.streams),
    streamOutputs: mapToEntries(store.streamOutputs),
    viewerProfiles: mapToEntries(store.viewerProfiles),
    incidents: mapToEntries(store.incidents),
    feedback: mapToEntries(store.feedback),
    adSessions: mapToEntries(store.adSessions),
    adEvents: mapToEntries(store.adEvents),
    auditLog: [...store.auditLog]
  };
}

export function importState(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return;

  store.streams = entriesToMap(snapshot.streams);
  store.streamOutputs = entriesToMap(snapshot.streamOutputs);
  store.viewerProfiles = entriesToMap(snapshot.viewerProfiles);
  store.incidents = entriesToMap(snapshot.incidents);
  store.feedback = entriesToMap(snapshot.feedback);
  store.adSessions = entriesToMap(snapshot.adSessions);
  store.adEvents = entriesToMap(snapshot.adEvents);
  store.auditLog = [...(snapshot.auditLog || [])];
}
