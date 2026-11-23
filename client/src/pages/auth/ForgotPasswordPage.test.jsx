import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { apiError, mockApi, renderPage } from '../../test-utils/renderWithApp.jsx';
import { ForgotPasswordPage } from './ForgotPasswordPage.jsx';

afterEach(cleanup);

function setup(route = () => ({ status: 202, data: { success: true, data: null } })) {
  const calls = mockApi({ 'POST /auth/forgot-password': route });
  renderPage('/forgot-password', ForgotPasswordPage);
  return calls;
}

const submit = (email) => {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
};

describe('forgot password', () => {
  it('sends the email and shows the same answer whether or not the account exists', async () => {
    const calls = setup();

    submit('someone@example.com');

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeTruthy();
    expect(screen.getByText(/If an account exists for/)).toBeTruthy();
    expect(calls.find((c) => c.key === 'POST /auth/forgot-password').body).toEqual({
      email: 'someone@example.com',
    });
  });

  it('checks the email before sending anything', async () => {
    const calls = setup();

    submit('not-an-email');

    expect(await screen.findByText(/valid email/i)).toBeTruthy();
    expect(calls.some((c) => c.key === 'POST /auth/forgot-password')).toBe(false);
  });

  it('shows the rate-limit message from the server', async () => {
    setup(() => apiError(429, 'RATE_LIMITED', 'Too many password reset requests.'));

    submit('someone@example.com');

    expect(await screen.findByText('Too many password reset requests.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Check your email' })).toBeNull();
  });
});
