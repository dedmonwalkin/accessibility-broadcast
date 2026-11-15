import { test } from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../src/data/store.js';
import { cleanupService } from '../src/services/cleanupService.js';

function resetStore() {
  store.streams.clear();
  store.streamOutputs.clear();
  store.incidents.clear();
  store.feedback.clear();
  store.adSessions.clear();
  store.adEvents.clear();
  store.auditLog.length = 0;
}

test('cleanupService removes stopped streams past TTL', () => {
  resetStore();
  const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const fresh = new Date().toISOString();

  store.streams.set('stream_old', { id: 'stream_old', status: 'stopped', stoppedAt: old });
  store.streamOutputs.set('stream_old', { events: [] });
  store.streams.set('stream_fresh', { id: 'stream_fresh', status: 'stopped', stoppedAt: fresh });
  store.streams.set('stream_running', { id: 'stream_running', status: 'running', createdAt: old });

  const removed = cleanupService.run({ streamTtlMs: 24 * 60 * 60 * 1000 });

  assert.equal(removed.streams, 1);
  assert.equal(removed.streamOutputs, 1);
  assert.ok(!store.streams.has('stream_old'));
  assert.ok(store.streams.has('stream_fresh'));
  assert.ok(store.streams.has('stream_running'), 'running streams must never be swept');
});

test('cleanupService removes resolved incidents past TTL only', () => {
  resetStore();
  const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

  store.incidents.set('inc_old', { id: 'inc_old', status: 'resolved', resolvedAt: old });
  store.incidents.set('inc_open', { id: 'inc_open', status: 'open', createdAt: old });

  const removed = cleanupService.run({ incidentTtlMs: 7 * 24 * 60 * 60 * 1000 });

  assert.equal(removed.incidents, 1);
  assert.ok(!store.incidents.has('inc_old'));
  assert.ok(store.incidents.has('inc_open'), 'open incidents must never be swept');
});

test('cleanupService caps audit log size', () => {
  resetStore();
  for (let i = 0; i < 50; i += 1) {
    store.auditLog.push({ id: `audit_${i}`, action: 'test', createdAt: new Date().toISOString() });
  }
  const removed = cleanupService.run({ auditLogMaxEntries: 10 });
  assert.equal(removed.auditLog, 40);
  assert.equal(store.auditLog.length, 10);
});

test('cleanupService sweeps ad sessions and their events', () => {
  resetStore();
  const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  store.adSessions.set('ad_old', { id: 'ad_old', createdAt: old });
  store.adEvents.set('ev1', { id: 'ev1', ad_session_id: 'ad_old', createdAt: old });
  store.adEvents.set('ev2', { id: 'ev2', ad_session_id: 'ad_old', createdAt: old });
  store.adEvents.set('ev3', { id: 'ev3', ad_session_id: 'ad_keep', createdAt: old });
  store.adSessions.set('ad_keep', { id: 'ad_keep', createdAt: new Date().toISOString() });

  const removed = cleanupService.run({ adSessionTtlMs: 24 * 60 * 60 * 1000 });

  assert.equal(removed.adSessions, 1);
  assert.equal(removed.adEvents, 2);
  assert.ok(!store.adSessions.has('ad_old'));
  assert.ok(store.adSessions.has('ad_keep'));
  assert.ok(!store.adEvents.has('ev1'));
  assert.ok(store.adEvents.has('ev3'));
});
