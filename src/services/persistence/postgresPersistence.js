import { store } from '../../data/store.js';
import { exportState, importState } from './stateSerializer.js';

export class PostgresPersistence {
  constructor({ databaseUrl, ssl }) {
    this.databaseUrl = databaseUrl;
    this.sslMode = String(ssl || 'prefer').toLowerCase();
    this.client = null;
    this.enabled = false;
  }

  sslOption() {
    // Mirrors libpq's sslmode semantics for the pg driver.
    //   disable: never use TLS
    //   allow / prefer: let the driver negotiate (node-pg: default behavior)
    //   require: must use TLS; do not verify CA
    //   verify-ca / verify-full: must use TLS and verify the server cert
    if (this.sslMode === 'disable') return false;
    if (this.sslMode === 'allow' || this.sslMode === 'prefer') return undefined;
    if (this.sslMode === 'require') return { rejectUnauthorized: false };
    if (this.sslMode === 'verify-ca' || this.sslMode === 'verify-full') {
      return { rejectUnauthorized: true };
    }
    return undefined;
  }

  async init() {
    if (!this.databaseUrl) {
      return { enabled: false, reason: 'DATABASE_URL missing' };
    }

    let pg;
    try {
      pg = await import('pg');
    } catch {
      return { enabled: false, reason: 'pg package not installed' };
    }

    const { Client } = pg;
    const sslOption = this.sslOption();
    this.client = new Client({
      connectionString: this.databaseUrl,
      ...(sslOption !== undefined ? { ssl: sslOption } : {})
    });
    await this.client.connect();

    await this.client.query(`
      CREATE TABLE IF NOT EXISTS app_state_snapshots (
        id BIGSERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        reason TEXT NOT NULL,
        state JSONB NOT NULL
      );
    `);

    this.enabled = true;
    store.log('persistence.postgres.ready', {});
    return { enabled: true, reason: 'connected' };
  }

  async loadLatest() {
    if (!this.enabled) return { loaded: false, reason: 'disabled' };

    const result = await this.client.query(
      'SELECT id, created_at, state FROM app_state_snapshots ORDER BY id DESC LIMIT 1'
    );

    if (!result.rows.length) {
      return { loaded: false, reason: 'no_snapshots' };
    }

    const row = result.rows[0];
    importState(row.state);
    store.log('persistence.postgres.loaded', { snapshotId: row.id, createdAt: row.created_at });
    return { loaded: true, snapshotId: row.id, createdAt: row.created_at };
  }

  async snapshot(reason = 'manual') {
    if (!this.enabled) return { saved: false, reason: 'disabled' };

    const state = exportState();
    const result = await this.client.query(
      'INSERT INTO app_state_snapshots (reason, state) VALUES ($1, $2) RETURNING id, created_at',
      [reason, state]
    );

    const row = result.rows[0];
    store.log('persistence.postgres.snapshot', { snapshotId: row.id, reason });
    return { saved: true, snapshotId: row.id, createdAt: row.created_at, reason };
  }

  async close() {
    if (!this.client) return;
    await this.client.end();
  }
}
