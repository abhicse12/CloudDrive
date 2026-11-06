import { render } from '@testing-library/react';
import { AxiosError } from 'axios';
import { Provider } from 'react-redux';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { RequireGuest } from '../features/auth/guards.jsx';
import { apiClient } from '../services/apiClient.js';
import { createStore } from '../store/index.js';

/**
 * Replaces the network with a fake API server. `routes` maps "METHOD /path" to a
 * function returning { status, data }. Unknown routes answer 404. Returns the list
 * of calls made, so tests can assert what was (or wasn't) sent.
 */
export function mockApi(routes) {
  const calls = [];
  apiClient.defaults.adapter = async (config) => {
    const key = `${config.method.toUpperCase()} ${config.url}`;
    const body = config.data ? JSON.parse(config.data) : undefined;
    calls.push({ key, body });

    const handler =
      key === 'GET /auth/csrf'
        ? () => ({ data: { success: true, data: { csrfToken: 'csrf-test' } } })
        : routes[key];
    const { status = 200, data = { success: true, data: null } } = handler
      ? handler(body)
      : { status: 404, data: { error: { code: 'NOT_FOUND', message: 'Not found' } } };

    const response = { data, status, statusText: String(status), headers: {}, config };
    if (status >= 400) throw new AxiosError(`HTTP ${status}`, 'ERR', config, null, response);
    return response;
  };
  return calls;
}

/** API error body in the server's format. */
export const apiError = (status, code, message, details) => ({
  status,
  data: { success: false, error: { code, message, details } },
});

/**
 * Renders one page inside the real guard + a stub dashboard, with a fresh store.
 * Logged-out by default (status 'guest').
 */
export function renderPage(path, PageComponent, { url = path, state, auth } = {}) {
  const store = createStore({ auth: auth ?? { user: null, status: 'guest' } });
  const [pathname, query] = url.split('?');
  const router = createMemoryRouter(
    [
      { element: <RequireGuest />, children: [{ path, element: <PageComponent /> }] },
      { path: '/app', element: <p>Dashboard</p> },
      // Stub login page as a navigation target, unless the login page is under test.
      ...(path === '/login' ? [] : [{ path: '/login', element: <p>Login page</p> }]),
    ],
    { initialEntries: [{ pathname, search: query ? `?${query}` : '', state }] },
  );
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
  return { router, store };
}
