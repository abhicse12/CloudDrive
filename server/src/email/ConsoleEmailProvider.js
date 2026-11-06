import { EmailProvider } from './EmailProvider.js';

/**
 * Development provider: instead of sending, writes the email to the server log, so you
 * can copy links (e.g. password reset) straight from the terminal.
 * Never used in production: emails can contain secrets such as reset links.
 */
export class ConsoleEmailProvider extends EmailProvider {
  constructor(logger) {
    super();
    this.logger = logger;
  }

  async send({ to, subject, text }) {
    this.logger.info(
      `\n──────── EMAIL (not actually sent) ────────\nTo: ${to}\nSubject: ${subject}\n\n${text}\n───────────────────────────────────────────`,
    );
  }
}
