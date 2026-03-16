import { store } from '../../data/store.js';
import { PostgresPersistence } from './postgresPersistence.js';

class NoopPersistence {
  async init() { return { enabled: false, reason: 'noop' }; }
  async loadLatest() { return { loaded: false, reason: 'noop' }; }
  async snapshot() { return { saved: false, reason: 'noop' }; }
  async close() {}
}

let active = new NoopPersistence();

export const persistenceService = {
  async configure(runtime) {
    if (runtime.enablePostgres) {
      const postgres = new PostgresPersistence({ databaseUrl: runtime.databaseUrl });
      const status = await postgres.init();
      if (status.enabled) {
        active = postgres;
      } else {
        store.log('persistence.postgres.disabled', { reason: status.reason });
      }
      return status;
    }

    store.log('persistence.disabled', { reason: 'ENABLE_POSTGRES=false' });
    active = new NoopPersistence();
    return active.init();
  },

  async loadLatest() { return active.loadLatest(); },
  async snapshot(reason) { return active.snapshot(reason); },
  async close() { return active.close(); }
};
