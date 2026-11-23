import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it } from 'vitest';
import { createStore } from '../../store/index.js';
import { apiError, mockApi } from '../../test-utils/renderWithApp.jsx';
import { useGetStatsQuery } from '../dashboard/dashboardApi.js';
import { adminApi, useGetAdminStatsQuery, useGetAdminUsersQuery } from './adminApi.js';

afterEach(cleanup);

const ok = (data, meta) => ({ data: { success: true, data, ...(meta && { meta }) } });
const usersMeta = { page: 1, pageSize: 20, total: 1, totalPages: 1 };

/** The admin page's two queries, plus the admin's own storage card. */
function renderAdmin(usersArg) {
  const store = createStore({ auth: { user: null, status: 'guest' } });
  const wrapper = ({ children }) => <Provider store={store}>{children}</Provider>;
  const hook = renderHook(
    () => ({
      users: useGetAdminUsersQuery(usersArg),
      stats: useGetAdminStatsQuery(),
      myStats: useGetStatsQuery(),
    }),
    { wrapper },
  );
  return { store, ...hook };
}

const count = (calls, key) => calls.filter((c) => c.key === key).length;

const routes = (extra = {}) => ({
  'GET /admin/users': () => ok({ users: [{ id: 'u1', name: 'Alice' }] }, usersMeta),
  'GET /admin/stats': () => ok({ users: { total: 1 } }),
  'GET /dashboard/stats': () => ok({ storageUsed: 0 }),
  ...extra,
});

describe('admin data layer', () => {
  it('sends filters with a numbered page (default 1) and keeps the meta', async () => {
    const calls = mockApi(routes());
    const { result } = renderAdmin({ q: 'ali', role: 'ADMIN', sortBy: 'storageUsed' });

    await waitFor(() => expect(result.current.users.isSuccess).toBe(true));
    expect(calls.find((c) => c.key === 'GET /admin/users').params).toEqual({
      q: 'ali',
      role: 'ADMIN',
      sortBy: 'storageUsed',
      page: 1,
      pageSize: 20,
    });
    expect(result.current.users.data.meta.total).toBe(1);
  });

  it('a change refreshes the users table, the admin stats and my own storage card', async () => {
    const calls = mockApi(
      routes({ 'PATCH /admin/users/u1': () => ok({ user: { id: 'u1', role: 'ADMIN' } }) }),
    );
    const { result, store } = renderAdmin({});
    await waitFor(() => expect(result.current.myStats.isSuccess).toBe(true));

    await act(() =>
      store.dispatch(adminApi.endpoints.updateAdminUser.initiate({ id: 'u1', storageLimit: 1024 })),
    );

    expect(calls.find((c) => c.key === 'PATCH /admin/users/u1').body).toEqual({
      storageLimit: 1024,
    });
    await waitFor(() => expect(count(calls, 'GET /admin/users')).toBe(2));
    expect(count(calls, 'GET /admin/stats')).toBe(2);
    expect(count(calls, 'GET /dashboard/stats')).toBe(2);
  });

  it('passes the 409 code through, so the dialog can explain it', async () => {
    mockApi(
      routes({
        'PATCH /admin/users/u1': () =>
          apiError(409, 'LAST_ADMIN', 'This is the last active admin.'),
      }),
    );
    const store = createStore({ auth: { user: null, status: 'guest' } });

    const result = await store.dispatch(
      adminApi.endpoints.updateAdminUser.initiate({ id: 'u1', role: 'USER' }),
    );

    expect(result.error).toMatchObject({ status: 409, code: 'LAST_ADMIN' });
  });
});
