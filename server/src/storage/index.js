import { env } from '../config/env.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';

// Picks the storage backend from configuration. The rest of the app imports only this.
function createStorageProvider() {
  switch (env.STORAGE_DRIVER) {
    case 'local':
      return new LocalStorageProvider({
        root: env.STORAGE_LOCAL_ROOT,
        signingSecret: env.STORAGE_SIGNING_SECRET,
      });
  }
}

export const storage = createStorageProvider();
