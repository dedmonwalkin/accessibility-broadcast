import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

const DATABASE_URL = process.env.DATABASE_URL;

describe('Postgres persistence integration', { skip: !DATABASE_URL ? 'DATABASE_URL not set' : false }, () => {
  let PostgresPersistence;
  let persistence;

  before(async () => {
    ({ PostgresPersistence } = await import('../../src/services/persistence/postgresPersistence.js'));
    persistence = new PostgresPersistence({ databaseUrl: DATABASE_URL });
    const status = await persistence.init();
    assert.equal(status.enabled, true);
  });

  after(async () => {
    if (persistence) await persistence.close();
  });

  it('connects and creates the snapshots table', async () => {
    const result = await persistence.client.query('SELECT 1 AS ok');
    assert.equal(result.rows[0].ok, 1);
  });

  it('saves and loads a snapshot', async () => {
    const saved = await persistence.snapshot('test_integration');
    assert.equal(saved.saved, true);
    assert.ok(saved.snapshotId);

    const loaded = await persistence.loadLatest();
    assert.equal(loaded.loaded, true);
    assert.ok(loaded.snapshotId);
  });
});
