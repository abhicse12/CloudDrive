import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it } from 'vitest';
import { createStore } from '../../store/index.js';
import { mockApi } from '../../test-utils/renderWithApp.jsx';
import { useGetFilesInfiniteQuery } from '../files/filesApi.js';
import { filesApi } from '../files/filesApi.js';
import { publicDownloadUrl, sharesApi, useGetSharesInfiniteQuery } from './sharesApi.js';

afterEach(cleanup);

const share = (id, overrides = {}) => ({
  id,
  status: 'active',
  fileAvailable: true,
  accessCount: 0,
  file: { id: 'f1', name: 'plan.pdf' },
  ...overrides,
});

const page = (data, meta = { page: 1, pageSize: 50, total: 1, totalPages: 1 }) => ({
  data: { success: true, data, meta },
});

/** Renders the shares list AND the file list, like a user who visited both pages. */
function renderLists(sharesArg = {}) {
  const store = createStore({ auth: { user: null, status: 'guest' } });
  const wrapper = ({ children }) => <Provider store={store}>{children}</Provider>;
  const hook = renderHook(
    () => ({
      shares: useGetSharesInfiniteQuery(sharesArg),
      files: useGetFilesInfiniteQuery({}),
    }),
    { wrapper },
  );
  return { store, ...hook };
}

const count = (calls, key) => calls.filter((c) => c.key === key).length;

describe('shares data layer', () => {
  it('asks for one status at a time and keeps the paging meta', async () => {
    const calls = mockApi({
      'GET /shares': () => page({ shares: [share('s1')] }),
      'GET /files': () => page({ files: [] }),
    });
    const { result } = renderLists({ status: 'expired' });

    await waitFor(() => expect(result.current.shares.isSuccess).toBe(true));
    expect(calls.find((c) => c.key === 'GET /shares').params).toEqual({
      status: 'expired',
      page: 1,
      pageSize: 50,
    });
    expect(result.current.shares.data.pages[0].meta.totalPages).toBe(1);
  });

  it('creating a link returns the url once and refreshes the shares AND file lists', async () => {
    const calls = mockApi({
      'GET /shares': () => page({ shares: [] }),
      'GET /files': () => page({ files: [] }),
      'POST /files/f1/share': () => ({
        status: 201,
        data: { success: true, data: { share: share('s1'), url: 'http://app/s/tok' } },
      }),
    });
    const { result, store } = renderLists();
    await waitFor(() => expect(result.current.files.isSuccess).toBe(true));

    const created = await act(() =>
      store
        .dispatch(sharesApi.endpoints.createShare.initiate({ fileId: 'f1', expiresIn: '1d' }))
        .unwrap(),
    );

    expect(created.url).toBe('http://app/s/tok');
    expect(calls.find((c) => c.key === 'POST /files/f1/share').body).toEqual({ expiresIn: '1d' });
    // The Shared page gets the new link; file cards get their "shared" badge.
    await waitFor(() => expect(count(calls, 'GET /shares')).toBe(2));
    await waitFor(() => expect(count(calls, 'GET /files')).toBe(2));
  });

  it.each([
    ['trashing a file (its links pause)', 'trashFile', 'DELETE /files/f1', 'f1'],
    [
      'deleting a file forever (its links go)',
      'deleteFileForever',
      'DELETE /files/f1/permanent',
      'f1',
    ],
    [
      'renaming a file (the list shows its name)',
      'updateFile',
      'PATCH /files/f1',
      { id: 'f1', name: 'x.pdf' },
    ],
  ])('%s refreshes the shares list', async (_label, endpoint, route, arg) => {
    const calls = mockApi({
      'GET /shares': () => page({ shares: [share('s1')] }),
      'GET /files': () => page({ files: [] }),
      [route]: () => ({ status: 204, data: '' }),
    });
    const { result, store } = renderLists();
    await waitFor(() => expect(result.current.shares.isSuccess).toBe(true));

    await act(() => store.dispatch(filesApi.endpoints[endpoint].initiate(arg)));

    await waitFor(() => expect(count(calls, 'GET /shares')).toBe(2));
  });

  it('revoking and regenerating refresh the list', async () => {
    const calls = mockApi({
      'GET /shares': () => page({ shares: [share('s1')] }),
      'GET /files': () => page({ files: [] }),
      'DELETE /shares/s1': () => ({ status: 204, data: '' }),
      'POST /shares/s2/regenerate': () => ({
        status: 201,
        data: { success: true, data: { share: share('s3'), url: 'http://app/s/new' } },
      }),
    });
    const { result, store } = renderLists();
    await waitFor(() => expect(result.current.shares.isSuccess).toBe(true));

    await act(() => store.dispatch(sharesApi.endpoints.revokeShare.initiate('s1')));
    await waitFor(() => expect(count(calls, 'GET /shares')).toBe(2));

    const next = await act(() =>
      store.dispatch(sharesApi.endpoints.regenerateShare.initiate('s2')).unwrap(),
    );
    expect(next.url).toBe('http://app/s/new');
    await waitFor(() => expect(count(calls, 'GET /shares')).toBe(3));
  });

  it('builds public URLs with the token safely encoded', async () => {
    const calls = mockApi({
      'GET /public/shares/a%2Fb': () => ({ data: { success: true, data: { share: {} } } }),
    });
    const store = createStore({ auth: { user: null, status: 'guest' } });

    await store.dispatch(sharesApi.endpoints.getPublicShare.initiate('a/b'));

    expect(calls.map((c) => c.key)).toContain('GET /public/shares/a%2Fb');
    expect(publicDownloadUrl('tok')).toBe('/api/public/shares/tok/download');
    expect(publicDownloadUrl('tok', { inline: true })).toBe(
      '/api/public/shares/tok/download?disposition=inline',
    );
  });
});
