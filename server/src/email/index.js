import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ConsoleEmailProvider } from './ConsoleEmailProvider.js';

// Picks the email provider from configuration. The rest of the app imports only this.
function createEmailProvider() {
  switch (env.EMAIL_PROVIDER) {
    case 'console':
      return new ConsoleEmailProvider(logger);
  }
}

export const emailProvider = createEmailProvider();
