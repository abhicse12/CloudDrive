import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it } from 'vitest';
import { createStore } from '../../store/index.js';
import { mockApi } from '../../test-utils/renderWithApp.jsx';
import { filesApi, useGetFilesInfiniteQuery } from './filesApi.js';

afterEach(cleanup);

const file = (n) => ({ id: `f${n}`, name: `file-${n}.png`, category: 'IMAGE', size: n });

/** A fake /files endpoint with `total` files, served in pages of 2. */
function filesEndpoint(total) {
  return (_body, { page = 1 }) => {
    const all = Array.from({ length: total }, (_, i) => file(i + 1));
    return {
      data: {
        success: true,
        data: { files: all.slice((page - 1) * 2, page * 2) },
        meta: { page, pageSize: 2, total, totalPages: Math.ceil(total / 2) },
      },
    };
  };
}

function renderFiles(arg) {
  const store = createStore({ auth: { user: null, status: 'guest' } });
  const wrapper = ({ children }) => <Provider store={store}>{children}</Provider>;
  const hook = renderHook(() => useGetFilesInfiniteQuery(arg), { wrapper });
  return { store, ...hook };
}

const names = (result) => result.current.data.pages.flatMap((p) => p.files.map((f) => f.name));

describe('files data layer', () => {
  it('keeps pagination meta and loads the next page on "Load more"', async () => {
    const calls = mockApi({ 'GET /files': filesEndpoint(3) });
    const { result } = renderFiles({ folderId: 'abc', sortBy: 'name' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(names(result)).toEqual(['file-1.png', 'file-2.png']);
    expect(result.current.data.pages[0].meta.totalPages).toBe(2);
    expect(result.current.hasNextPage).toBe(true);

    await act(() => result.current.fetchNextPage());

    // The store has page 2 now; wait for React to re-render with it.
    await waitFor(() => expect(names(result)).toEqual(['file-1.png', 'file-2.png', 'file-3.png']));
    expect(result.current.hasNextPage).toBe(false);
    expect(calls.map((c) => c.params)).toEqual([
      { folderId: 'abc', sortBy: 'name', page: 1, pageSize: 50 },
      { folderId: 'abc', sortBy: 'name', page: 2, pageSize: 50 },
    ]);
  });

  it('refetches the list by itself after a file is moved to trash', async () => {
    let total = 2;
    const calls = mockApi({
      'GET /files': (body, params) => filesEndpoint(total)(body, params),
      'DELETE /files/f2': () => {
        total = 1;
        return { status: 204, data: '' };
      },
    });
    const { result, store } = renderFiles({});
    await waitFor(() => expect(names(result)).toHaveLength(2));

    await act(() => store.dispatch(filesApi.endpoints.trashFile.initiate('f2')));

    await waitFor(() => expect(names(result)).toEqual(['file-1.png']));
    expect(calls.filter((c) => c.key === 'GET /files')).toHaveLength(2);
  });
});
