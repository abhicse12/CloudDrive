import pino from 'pino';
import { env } from './env.js';

// Structured JSON logs: one JSON object per line. CloudWatch can search and filter
// these by field (e.g. all logs with a given requestId) instead of plain-text grepping.
export const logger = pino({
  level: env.LOG_LEVEL,
  // Never write secrets into logs, even by accident.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-csrf-token"]',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.token',
    ],
    censor: '[REDACTED]',
  },
  // In development, print colourful human-readable lines instead of raw JSON.
  ...(env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
    },
  }),
});
