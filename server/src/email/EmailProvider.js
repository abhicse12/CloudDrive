/**
 * The contract every email provider implements. Services only ever call
 * `emailProvider.send(...)`, so switching from the console to AWS SES (Phase 8) means
 * writing one new class and changing EMAIL_PROVIDER, nothing else.
 *
 * @typedef {object} EmailMessage
 * @property {string} to
 * @property {string} subject
 * @property {string} text   Plain-text body
 */
export class EmailProvider {
  /** @param {EmailMessage} _message */
  async send(_message) {
    throw new Error('EmailProvider.send() must be implemented by a subclass');
  }
}
