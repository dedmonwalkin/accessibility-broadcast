import crypto from 'node:crypto';

export class InMemoryStore {
  constructor() {
    this.streams = new Map();
    this.streamOutputs = new Map();
    this.viewerProfiles = new Map();
    this.incidents = new Map();
    this.feedback = new Map();
    this.adSessions = new Map();
    this.adEvents = new Map();
    this.auditLog = [];
  }

  nextId(prefix) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  nowIso() {
    return new Date().toISOString();
  }

  log(action, payload = {}) {
    const record = {
      id: this.nextId('audit'),
      action,
      payload,
      createdAt: this.nowIso()
    };
    this.auditLog.push(record);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ts: record.createdAt, action, ...payload }));
    return record;
  }
}

export const store = new InMemoryStore();
