import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { apiError, mockApi, renderPage } from '../test-utils/renderWithApp.jsx';
import { SettingsPage } from './SettingsPage.jsx';

afterEach(cleanup);

const user = {
  id: '1',
  name: 'Demo User',
  email: 'demo@x.com',
  role: 'USER',
  storageUsed: 1024 ** 3, // 1 GB
  storageLimit: 5 * 1024 ** 3,
  createdAt: '2026-11-06T10:00:00.000Z',
};

const renderSettings = () =>
  renderPage('/app/settings', SettingsPage, {
    guestOnly: false,
    auth: { user, status: 'authenticated' },
  });

const section = (name) => screen.getByRole('region', { name });
const type = (scope, label, value) =>
  fireEvent.change(within(scope).getByLabelText(label), { target: { value } });
const apiCalls = (calls) => calls.filter((c) => c.key !== 'GET /auth/csrf');

describe('Profile', () => {
  it('enables Save only after a change, then updates the user everywhere', async () => {
    const calls = mockApi({
      'PATCH /auth/me': (body) => ({ data: { data: { user: { ...user, name: body.name } } } }),
    });
    const { store } = renderSettings();
    const profile = section('Profile');
    const save = within(profile).getByRole('button', { name: 'Save changes' });

    expect(save.disabled).toBe(true);
    type(profile, 'Full name', '  New Name ');
    fireEvent.click(save);

    expect(await within(profile).findByText('Profile updated.')).toBeTruthy();
    expect(apiCalls(calls)[0].body).toEqual({ name: 'New Name' });
    expect(store.getState().auth.user.name).toBe('New Name'); // sidebar, menu, dashboard follow
  });

  it('shows the email as read-only', () => {
    mockApi({});
    renderSettings();

    expect(within(section('Profile')).getByLabelText('Email').readOnly).toBe(true);
  });
});

describe('Password', () => {
  it('shows a wrong current password under that field', async () => {
    mockApi({
      'POST /auth/change-password': () =>
        apiError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect.', [
          { field: 'currentPassword', message: 'Current password is incorrect.' },
        ]),
    });
    renderSettings();
    const password = section('Password');

    type(password, 'Current password', 'wrong-password');
    type(password, 'New password', 'brand-new-password');
    fireEvent.click(within(password).getByRole('button', { name: 'Change password' }));

    expect(await within(password).findByText('Current password is incorrect.')).toBeTruthy();
    expect(within(password).getByLabelText('Current password').getAttribute('aria-invalid')).toBe(
      'true',
    );
  });

  it('rejects reusing the current password without calling the API', async () => {
    const calls = mockApi({});
    renderSettings();
    const password = section('Password');

    type(password, 'Current password', 'same-password-123');
    type(password, 'New password', 'same-password-123');
    fireEvent.click(within(password).getByRole('button', { name: 'Change password' }));

    expect(
      await within(password).findByText('New password must be different from the current one.'),
    ).toBeTruthy();
    expect(apiCalls(calls)).toHaveLength(0);
  });

  it('clears both fields after a successful change', async () => {
    mockApi({ 'POST /auth/change-password': () => ({ status: 204, data: '' }) });
    renderSettings();
    const password = section('Password');

    type(password, 'Current password', 'old-password-123');
    type(password, 'New password', 'new-password-456');
    fireEvent.click(within(password).getByRole('button', { name: 'Change password' }));

    expect(await within(password).findByText(/logged out on all your other devices/)).toBeTruthy();
    expect(within(password).getByLabelText('Current password').value).toBe('');
    expect(within(password).getByLabelText('New password').value).toBe('');
  });
});

describe('Storage', () => {
  it('shows used and available space from the account', () => {
    mockApi({});
    renderSettings();
    const storage = section('Storage');

    expect(within(storage).getByText('1 GB')).toBeTruthy();
    expect(within(storage).getByText('4 GB')).toBeTruthy();
  });
});
