import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seams, registerSeams, resetSeams, resolveTenantFromHeaders } from '../src/services/seams/index.js';

test('Noop seams swallow all calls and never throw', async () => {
  resetSeams();
  seams.usage.record({ kind: 'request' });
  seams.telemetry.onRequest({ method: 'GET' });
  seams.telemetry.onSse({ streamId: 'x' });
  seams.audit.record({ id: 'a', action: 'x' });
  const id = await seams.identity.resolveApiKey('tok');
  assert.equal(id, null);
});

test('registerSeams swaps sinks and receives events', async () => {
  resetSeams();
  const usageEvents = [];
  const auditEvents = [];
  const telemetryEvents = [];
  registerSeams({
    usage: { record: (e) => usageEvents.push(e) },
    audit: { record: (e) => auditEvents.push(e) },
    telemetry: {
      onRequest: (e) => telemetryEvents.push(['req', e]),
      onSse: (e) => telemetryEvents.push(['sse', e])
    },
    identity: {
      async resolveApiKey(token) {
        return token === 'good' ? { orgId: 'org_1', projectId: 'proj_1' } : null;
      }
    }
  });

  seams.usage.record({ kind: 'request', method: 'GET' });
  seams.audit.record({ id: 'a1', action: 'stream.started' });
  seams.telemetry.onRequest({ method: 'POST' });
  seams.telemetry.onSse({ streamId: 'stream_1' });

  assert.equal(usageEvents.length, 1);
  assert.equal(auditEvents.length, 1);
  assert.equal(telemetryEvents.length, 2);

  const ok = await seams.identity.resolveApiKey('good');
  assert.deepEqual(ok, { orgId: 'org_1', projectId: 'proj_1' });
  const miss = await seams.identity.resolveApiKey('bad');
  assert.equal(miss, null);

  resetSeams();
});

test('seams facade swallows sink errors, never propagates', async () => {
  resetSeams();
  registerSeams({
    usage: { record: () => { throw new Error('boom'); } },
    identity: { async resolveApiKey() { throw new Error('kaboom'); } }
  });

  assert.doesNotThrow(() => seams.usage.record({ kind: 'request' }));
  const id = await seams.identity.resolveApiKey('x');
  assert.equal(id, null);
  resetSeams();
});

test('resolveTenantFromHeaders only honored when identity is noop', async () => {
  resetSeams();
  const req = { headers: { 'x-org-id': 'org_headers', 'x-project-id': 'proj_headers' } };
  assert.deepEqual(resolveTenantFromHeaders(req), { orgId: 'org_headers', projectId: 'proj_headers' });

  registerSeams({ identity: { async resolveApiKey() { return null; } } });
  assert.equal(resolveTenantFromHeaders(req), null,
    'once a real identity provider is registered, header tenant must be ignored');

  resetSeams();
});

test('resolveTenantFromHeaders returns null when no headers set', () => {
  resetSeams();
  assert.equal(resolveTenantFromHeaders({ headers: {} }), null);
  assert.equal(resolveTenantFromHeaders({}), null);
});
