// Email contents live here, separate from the logic that decides when to send them.

export function passwordResetEmail({ name, resetUrl, expiresInMinutes }) {
  return {
    subject: 'Reset your CloudDrive password',
    text: [
      `Hi ${name},`,
      '',
      'We received a request to reset your CloudDrive password. Open this link to choose a new one:',
      '',
      resetUrl,
      '',
      `The link expires in ${expiresInMinutes} minutes and can be used only once.`,
      "If you didn't ask for this, you can ignore this email; your password won't change.",
      '',
      '- The CloudDrive team',
    ].join('\n'),
  };
}
