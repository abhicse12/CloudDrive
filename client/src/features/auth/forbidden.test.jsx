import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { AdminPage } from '../../pages/AdminPage.jsx';
import { createStore } from '../../store/index.js';
import { apiError, mockApi } from '../../test-utils/renderWithApp.jsx';
import { ThemeProvider } from '../../theme/ThemeProvider.jsx';
import { adminApi } from '../admin/adminApi.js';
import { RequireRole } from './guards.jsx';

afterEach(cleanup);

const ADMIN = { id: 'u1', name: 'Root', email: 'root@x.com', role: 'ADMIN' };
const me = (user) => () => ({ data: { success: true, data: { user } } });
const forbidden = () =>
  apiError(403, 'FORBIDDEN', 'You do not have permission to perform this action.');
const meCalls = (calls) => calls.filter((c) => c.key === 'GET /auth/me');

describe('a 403 from the API refreshes who the user is', () => {
  it('a demoted admin on the admin page gets the 404 page as soon as the API says no', async () => {
    const calls = mockApi({
      'GET /admin/stats': forbidden,
      'GET /admin/users': forbidden,
      'GET /auth/me': me({ ...ADMIN, role: 'USER' }), // the server's truth now
    });
    const store = createStore({ auth: { user: ADMIN, status: 'authenticated' } });
    const router = createMemoryRouter(
      [
        {
          path: '/app/admin',
          element: <RequireRole roles={['ADMIN']} />,
          children: [{ index: true, element: <AdminPage /> }],
        },
      ],
      { initialEntries: ['/app/admin'] },
    );
    render(
      <Provider store={store}>
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </Provider>,
    );

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy();
    expect(store.getState().auth.user.role).toBe('USER');
    // Two 403s at once still mean ONE /me request.
    expect(meCalls(calls)).toHaveLength(1);
  });

  it('ignores 403s that are not about the role (CSRF) and 401s', async () => {
    const calls = mockApi({
      'PATCH /admin/users/x': () =>
        apiError(403, 'CSRF_INVALID', 'Missing or invalid security token.'),
      'GET /admin/stats': () => apiError(401, 'UNAUTHORIZED', 'Authentication required.'),
      'POST /auth/refresh': () => apiError(401, 'UNAUTHORIZED', 'No session.'),
      'GET /auth/me': me(ADMIN),
    });
    const store = createStore({ auth: { user: ADMIN, status: 'authenticated' } });

    await store.dispatch(adminApi.endpoints.updateAdminUser.initiate({ id: 'x', role: 'USER' }));
    await store.dispatch(adminApi.endpoints.getAdminStats.initiate());

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(meCalls(calls)).toHaveLength(0);
  });

  it('keeps the user logged in and up to date (not a logout)', async () => {
    mockApi({ 'GET /admin/stats': forbidden, 'GET /auth/me': me({ ...ADMIN, name: 'Renamed' }) });
    const store = createStore({ auth: { user: ADMIN, status: 'authenticated' } });

    await store.dispatch(adminApi.endpoints.getAdminStats.initiate());

    await waitFor(() => expect(store.getState().auth.user.name).toBe('Renamed'));
    expect(store.getState().auth.status).toBe('authenticated');
  });
});
