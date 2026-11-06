import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { apiError, mockApi, renderPage } from '../../test-utils/renderWithApp.jsx';
import { LoginPage } from './LoginPage.jsx';
import { RegisterPage } from './RegisterPage.jsx';
import { ResetPasswordPage } from './ResetPasswordPage.jsx';

afterEach(cleanup);

const user = { id: '1', name: 'Demo User', email: 'demo@x.com', role: 'USER' };
const VALID_TOKEN = 'a'.repeat(43);

const type = (label, value) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name) => fireEvent.click(screen.getByRole('button', { name }));
const apiCalls = (calls) => calls.filter((c) => c.key !== 'GET /auth/csrf');

describe('LoginPage', () => {
  it('validates in the browser before calling the API', async () => {
    const calls = mockApi({});
    renderPage('/login', LoginPage);

    type('Email', 'not-an-email');
    click('Log in');

    expect(await screen.findByText('Enter a valid email address.')).toBeTruthy();
    expect(screen.getByText('Password is required.')).toBeTruthy();
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true');
    expect(apiCalls(calls)).toHaveLength(0);
  });

  it('logs in and the guard redirects to the dashboard', async () => {
    const calls = mockApi({ 'POST /auth/login': () => ({ data: { data: { user } } }) });
    renderPage('/login', LoginPage);

    type('Email', '  Demo@X.com ');
    type('Password', 'secret-password');
    click('Log in');

    expect(await screen.findByText('Dashboard')).toBeTruthy();
    // Email was normalised by the schema before being sent.
    expect(apiCalls(calls)[0].body).toEqual({ email: 'demo@x.com', password: 'secret-password' });
  });

  it('shows a form-level error for wrong credentials and clears the password', async () => {
    mockApi({
      'POST /auth/login': () => apiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.'),
    });
    renderPage('/login', LoginPage);

    type('Email', 'demo@x.com');
    type('Password', 'wrong-password');
    click('Log in');

    expect((await screen.findByRole('alert')).textContent).toContain('Invalid email or password.');
    expect(screen.getByLabelText('Password').value).toBe('');
  });

  it('shows the notice passed from the reset page', () => {
    mockApi({});
    renderPage('/login', LoginPage, { state: { notice: 'Your password has been changed.' } });

    expect(screen.getByRole('status').textContent).toContain('Your password has been changed.');
  });
});

describe('RegisterPage', () => {
  it('puts "email already taken" under the email field', async () => {
    mockApi({
      'POST /auth/register': () =>
        apiError(409, 'EMAIL_TAKEN', 'An account with this email already exists.'),
    });
    renderPage('/register', RegisterPage);

    type('Full name', 'Demo User');
    type('Email', 'demo@x.com');
    type('Password', 'long-enough-password');
    click('Create account');

    expect(await screen.findByText('An account with this email already exists.')).toBeTruthy();
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true');
    expect(screen.queryByRole('alert')).toBeNull(); // not duplicated at form level
  });

  it('maps server validation details onto their fields', async () => {
    mockApi({
      'POST /auth/register': () =>
        apiError(400, 'VALIDATION_ERROR', 'Some of the submitted data is invalid.', [
          { field: 'password', message: 'Password is too long.' },
        ]),
    });
    renderPage('/register', RegisterPage);

    type('Full name', 'Demo User');
    type('Email', 'demo@x.com');
    type('Password', 'long-enough-password');
    click('Create account');

    expect(await screen.findByText('Password is too long.')).toBeTruthy();
  });
});

describe('ResetPasswordPage', () => {
  it('removes the token from the address bar but keeps it for the request', async () => {
    const calls = mockApi({ 'POST /auth/reset-password': () => ({ status: 204, data: '' }) });
    const { router } = renderPage('/reset-password', ResetPasswordPage, {
      url: `/reset-password?token=${VALID_TOKEN}`,
    });

    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(router.state.location.state.token).toBe(VALID_TOKEN);

    type('New password', 'brand-new-password');
    click('Update password');

    expect(await screen.findByText('Login page')).toBeTruthy();
    expect(apiCalls(calls)[0].body).toEqual({
      token: VALID_TOKEN,
      newPassword: 'brand-new-password',
    });
    expect(router.state.location.state.notice).toMatch(/password has been changed/);
  });

  it('explains when the link is missing or malformed', () => {
    mockApi({});
    renderPage('/reset-password', ResetPasswordPage, { url: '/reset-password?token=short' });

    expect(screen.getByText("This link can't be used")).toBeTruthy();
  });

  it('switches to the "link can\'t be used" view when the server rejects the token', async () => {
    mockApi({
      'POST /auth/reset-password': () =>
        apiError(400, 'INVALID_RESET_TOKEN', 'This reset link is invalid or has expired.'),
    });
    renderPage('/reset-password', ResetPasswordPage, { state: { token: VALID_TOKEN } });

    type('New password', 'brand-new-password');
    click('Update password');

    expect(await screen.findByText("This link can't be used")).toBeTruthy();
  });
});
