import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { dashboardApi } from '../../features/dashboard/dashboardApi.js';
import { apiError, mockApi, renderPage } from '../../test-utils/renderWithApp.jsx';
import { UserMenu } from './UserMenu.jsx';

afterEach(cleanup);

const ALICE = { id: 'u1', name: 'Alice Smith', email: 'alice@x.com', role: 'USER' };
const auth = (user = ALICE) => ({ user, status: 'authenticated' });

function setup({ user, logout = () => ({ status: 204, data: '' }) } = {}) {
  const calls = mockApi({
    'POST /auth/logout': logout,
    'GET /dashboard/stats': () => ({ data: { success: true, data: { storageUsed: 1 } } }),
  });
  const { router, store } = renderPage('/app', UserMenu, {
    url: '/app',
    auth: auth(user),
    guestOnly: false,
  });
  return { calls, router, store };
}

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));

describe('account menu', () => {
  it('shows who is logged in, and an ADMIN badge only for admins', () => {
    setup();
    expect(screen.getByText('AS')).toBeTruthy(); // initials
    openMenu();
    expect(screen.getByText('alice@x.com')).toBeTruthy();
    expect(screen.queryByText('ADMIN')).toBeNull();
    cleanup();

    setup({ user: { ...ALICE, role: 'ADMIN' } });
    openMenu();
    expect(screen.getByText('ADMIN')).toBeTruthy();
  });

  it('closes with Escape and with a click outside', () => {
    setup();
    openMenu();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();

    openMenu();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('logs out: tells the server, forgets every cached response, goes to /login', async () => {
    const { calls, router, store } = setup();
    // Something of this user's is in the cache.
    await store.dispatch(dashboardApi.endpoints.getStats.initiate());
    expect(Object.keys(store.getState().api.queries)).not.toHaveLength(0);

    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Log out' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(calls.some((c) => c.key === 'POST /auth/logout')).toBe(true);
    expect(store.getState().auth.status).toBe('guest');
    // The next person on this browser can't see the previous user's data.
    expect(store.getState().api.queries).toEqual({});
  });

  it('still logs out locally when the server cannot be reached', async () => {
    const { router, store } = setup({
      logout: () => apiError(503, 'SERVICE_UNAVAILABLE', 'Down for maintenance.'),
    });

    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Log out' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(store.getState().auth.status).toBe('guest');
  });
});
