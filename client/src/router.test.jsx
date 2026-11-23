import { act, cleanup, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { router } from './router.jsx';
import { createStore } from './store/index.js';
import { mockApi } from './test-utils/renderWithApp.jsx';
import { ThemeProvider } from './theme/ThemeProvider.jsx';

afterEach(cleanup);

const ALICE = {
  id: 'u1',
  name: 'Alice',
  email: 'a@x.com',
  role: 'USER',
  storageUsed: 0,
  storageLimit: 1,
};
// Lazy routes import their code on first use, which can take a while under a full test run.
const LAZY = { timeout: 5000 };
const ok = (data, meta) => () => ({ data: { success: true, data, ...(meta && { meta }) } });

/** The REAL route tree (lazy pages and the lazy app shell), as main.jsx renders it. */
async function openAt(path, { loggedIn }) {
  mockApi({
    'GET /auth/me': loggedIn
      ? ok({ user: ALICE })
      : () => ({ status: 401, data: { error: { code: 'UNAUTHORIZED', message: 'No.' } } }),
    'POST /auth/refresh': () => ({ status: 401, data: { error: { code: 'UNAUTHORIZED' } } }),
    'GET /dashboard/stats': ok({ storageUsed: 0, storageLimit: 1 }),
    'GET /config': ok({ maxFileSizeBytes: 1, maxFilesPerUpload: 1, trashRetentionDays: 30 }),
    'GET /trash': ok(
      { folders: [], files: [], retentionDays: 30 },
      { page: 1, pageSize: 50, total: 0, totalPages: 0 },
    ),
  });
  await act(() => router.navigate(path));
  render(
    <Provider store={createStore()}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </Provider>,
  );
}

describe('route tree', () => {
  it('loads the lazy app shell and a page inside it for a logged-in user', async () => {
    await openAt('/app/trash', { loggedIn: true });

    expect(await screen.findByRole('heading', { name: 'Trash' }, LAZY)).toBeTruthy();
    // The shell (sidebar) came with it.
    expect(screen.getByRole('navigation', { name: 'App' })).toBeTruthy();
  });

  it('sends a logged-out visitor from the app to the login page', async () => {
    await openAt('/app/trash', { loggedIn: false });

    expect(await screen.findByRole('heading', { name: 'Welcome back' }, LAZY)).toBeTruthy();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('shows the 404 page for unknown URLs', async () => {
    await openAt('/no/such/page', { loggedIn: false });

    expect(await screen.findByRole('heading', { name: 'Page not found' }, LAZY)).toBeTruthy();
  });
});
