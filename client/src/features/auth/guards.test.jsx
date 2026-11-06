import { cleanup, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { createStore } from '../../store/index.js';
import { RequireAuth, RequireGuest, RequireRole } from './guards.jsx';
import { safeRedirectPath } from './redirect.js';

afterEach(cleanup);

const alice = { id: '1', name: 'Alice', email: 'a@x.com', role: 'USER' };

/** Renders a tiny app with the real guards, starting at `url` with the given auth state. */
function renderAt(url, auth, { state } = {}) {
  const store = createStore({ auth });
  const router = createMemoryRouter(
    [
      {
        path: '/login',
        element: <RequireGuest />,
        children: [{ index: true, element: <p>Login page</p> }],
      },
      {
        path: '/app',
        element: <RequireAuth />,
        children: [
          { index: true, element: <p>Dashboard</p> },
          { path: 'settings', element: <p>Settings</p> },
          {
            path: 'admin',
            element: <RequireRole roles={['ADMIN']} />,
            children: [{ index: true, element: <p>Admin panel</p> }],
          },
        ],
      },
    ],
    { initialEntries: [{ pathname: url, state }] },
  );
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
  return router;
}

describe('RequireAuth', () => {
  it('shows a spinner while the login status is still unknown', () => {
    renderAt('/app', { user: null, status: 'unknown' });

    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByText('Dashboard')).toBeNull();
  });

  it('sends guests to /login and remembers where they wanted to go', () => {
    const router = renderAt('/app/settings', { user: null, status: 'guest' });

    expect(screen.getByText('Login page')).toBeTruthy();
    expect(router.state.location.state.from.pathname).toBe('/app/settings');
  });

  it('lets logged-in users through', () => {
    renderAt('/app', { user: alice, status: 'authenticated' });

    expect(screen.getByText('Dashboard')).toBeTruthy();
  });
});

describe('RequireGuest', () => {
  it('sends logged-in users back to the page they originally wanted', () => {
    renderAt(
      '/login',
      { user: alice, status: 'authenticated' },
      { state: { from: { pathname: '/app/settings' } } },
    );

    expect(screen.getByText('Settings')).toBeTruthy();
  });

  it('ignores a malicious "from" and goes to the dashboard', () => {
    renderAt(
      '/login',
      { user: alice, status: 'authenticated' },
      { state: { from: { pathname: '//evil.example/phish' } } },
    );

    expect(screen.getByText('Dashboard')).toBeTruthy();
  });
});

describe('RequireRole', () => {
  it('keeps normal users out of admin pages', () => {
    renderAt('/app/admin', { user: alice, status: 'authenticated' });

    expect(screen.getByText('Dashboard')).toBeTruthy();
  });

  it('lets admins in', () => {
    renderAt('/app/admin', { user: { ...alice, role: 'ADMIN' }, status: 'authenticated' });

    expect(screen.getByText('Admin panel')).toBeTruthy();
  });
});

describe('safeRedirectPath', () => {
  it.each([
    ['/app', '/app'],
    ['/app/settings', '/app/settings'],
    ['//evil.example', '/app'],
    ['https://evil.example', '/app'],
    ['/application', '/app'],
    [undefined, '/app'],
  ])('%s → %s', (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });
});
