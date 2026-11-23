import { AxiosError, CanceledError } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../services/apiClient.js';
import { createStore } from '../../store/index.js';
import { authApi } from '../auth/authApi.js';
import { sessionExpired } from '../auth/authSlice.js';
import { dashboardApi } from '../dashboard/dashboardApi.js';
import { filesApi } from '../files/filesApi.js';
import { cancelUpload, MAX_PARALLEL, startUploads } from './uploadQueue.js';

const MB = 1024 * 1024;

/**
 * A fake server whose upload requests stay open until the test answers them, so we
 * can watch the queue: how many run at once, progress, cancel mid-way.
 */
function fakeServer() {
  const uploads = [];
  const other = [];
  apiClient.defaults.adapter = (config) =>
    new Promise((resolve, reject) => {
      const reply = (status, data) => {
        const response = { status, data, statusText: '', headers: {}, config };
        if (status >= 400) reject(new AxiosError('HTTP', 'ERR', config, null, response));
        else resolve(response);
      };
      if (config.url === '/auth/csrf')
        return reply(200, { success: true, data: { csrfToken: 't' } });
      if (config.url !== '/files/upload') {
        other.push(config.url);
        return reply(200, { success: true, data: { files: [] }, meta: { page: 1, totalPages: 1 } });
      }
      // Like the real browser adapter: aborting rejects with a CanceledError.
      config.signal.addEventListener('abort', () => reject(new CanceledError(null, null, config)));
      const form = config.data;
      uploads.push({
        name: form.get('files').name,
        folderId: form.get('folderId'),
        progress: (loaded) => config.onUploadProgress({ loaded }),
        succeed: () =>
          reply(201, {
            success: true,
            data: { uploaded: [{ id: `id-${form.get('files').name}` }] },
          }),
        fail: (status, code, message) =>
          reply(status, { success: false, error: { code, message } }),
        networkError: () => reject(new AxiosError('Network Error', 'ERR_NETWORK', config)),
        aborted: () => config.signal.aborted,
      });
    });
  return { uploads, other };
}

const makeFile = (name, size = 10) => {
  const file = new File(['x'.repeat(Math.min(size, 10))], name, { type: 'text/plain' });
  Object.defineProperty(file, 'size', { value: size }); // pretend size, no real bytes
  return file;
};

const setup = () => {
  const store = createStore({ auth: { user: null, status: 'guest' } });
  const item = (name) => store.getState().uploads.items.find((i) => i.name === name);
  return { store, item };
};

describe('when the session ends', () => {
  it.each([
    ['logging out', (store) => store.dispatch(authApi.endpoints.logout.initiate())],
    ['the session expiring', (store) => store.dispatch(sessionExpired())],
  ])('%s aborts running uploads, drops queued ones and forgets the list', async (_label, end) => {
    const server = fakeServer();
    const { store } = setup();
    store.dispatch(
      startUploads(
        ['a', 'b', 'c', 'd', 'e'].map((n) => makeFile(`${n}.txt`)),
        null,
      ),
    );
    await vi.waitFor(() => expect(server.uploads).toHaveLength(MAX_PARALLEL));

    await end(store);

    // The next person on this browser sees no file names from the previous user...
    expect(store.getState().uploads.items).toEqual([]);
    // ...and nothing keeps sending the previous user's files.
    expect(server.uploads.every((u) => u.aborted())).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(server.uploads).toHaveLength(MAX_PARALLEL); // the 2 queued ones never started
  });
});

describe('upload queue', () => {
  it(`sends one request per file, at most ${MAX_PARALLEL} at a time`, async () => {
    const server = fakeServer();
    const { store, item } = setup();
    const files = ['a', 'b', 'c', 'd', 'e'].map((n) => makeFile(`${n}.txt`));

    store.dispatch(startUploads(files, 'folder-1'));

    await vi.waitFor(() => expect(server.uploads).toHaveLength(MAX_PARALLEL));
    expect(item('d.txt').status).toBe('queued');
    expect(server.uploads[0]).toMatchObject({ name: 'a.txt', folderId: 'folder-1' });

    server.uploads[0].succeed(); // a slot frees up → "d" starts
    await vi.waitFor(() => expect(server.uploads).toHaveLength(4));
    expect(item('a.txt')).toMatchObject({ status: 'done', fileId: 'id-a.txt' });

    server.uploads.slice(1).forEach((u) => u.succeed());
    await vi.waitFor(() => expect(server.uploads).toHaveLength(5));
    server.uploads[4].succeed();
    await vi.waitFor(() =>
      expect(store.getState().uploads.items.every((i) => i.status === 'done')).toBe(true),
    );
  });

  it('reports progress', async () => {
    const server = fakeServer();
    const { store, item } = setup();
    store.dispatch(startUploads([makeFile('big.bin', 4 * MB)], null));
    await vi.waitFor(() => expect(server.uploads).toHaveLength(1));

    server.uploads[0].progress(1 * MB);

    expect(item('big.bin')).toMatchObject({ status: 'uploading', loaded: 1 * MB });
    expect(server.uploads[0].folderId).toBeNull(); // root: no folderId field sent
  });

  it('cancel aborts a running upload and drops a queued one before it is sent', async () => {
    const server = fakeServer();
    const { store, item } = setup();
    const files = ['1', '2', '3', '4'].map((n) => makeFile(`${n}.txt`));
    const ids = store.dispatch(startUploads(files, null));
    await vi.waitFor(() => expect(server.uploads).toHaveLength(3));

    store.dispatch(cancelUpload(ids[3])); // still queued
    store.dispatch(cancelUpload(ids[0])); // running

    await vi.waitFor(() => expect(item('1.txt').status).toBe('canceled'));
    expect(item('4.txt').status).toBe('canceled');
    // Neither the cancelled queued file nor anything else got sent in their place.
    expect(server.uploads.map((u) => u.name)).toEqual(['1.txt', '2.txt', '3.txt']);
  });

  it('turns server and network errors into readable messages', async () => {
    const server = fakeServer();
    const { store, item } = setup();
    store.dispatch(startUploads([makeFile('x.exe'), makeFile('y.txt')], null));
    await vi.waitFor(() => expect(server.uploads).toHaveLength(2));

    server.uploads[0].fail(415, 'UNSUPPORTED_FILE_TYPE', 'This file type is not supported.');
    server.uploads[1].networkError();

    await vi.waitFor(() => expect(item('y.txt').status).toBe('error'));
    expect(item('x.exe').error).toBe("This file type isn't supported.");
    expect(item('y.txt').error).toMatch(/Connection lost/);
  });

  it('refuses too-big files and files that won’t fit, without sending them', async () => {
    const server = fakeServer();
    const { store, item } = setup();
    // Pretend the dashboard stats are loaded: 5 MB free.
    await store.dispatch(
      dashboardApi.util.upsertQueryData('getStats', undefined, { remaining: 5 * MB }),
    );

    store.dispatch(
      startUploads(
        [
          makeFile('huge.iso', 101 * MB),
          makeFile('fits.bin', 3 * MB),
          makeFile('no-room.bin', 3 * MB),
        ],
        null,
      ),
    );

    expect(item('huge.iso')).toMatchObject({
      status: 'error',
      error: 'Larger than the 100 MB limit.',
    });
    // 5 MB free: the first 3 MB file fits, the second no longer does.
    expect(item('no-room.bin')).toMatchObject({
      status: 'error',
      error: 'Not enough storage space.',
    });
    await vi.waitFor(() => expect(server.uploads.map((u) => u.name)).toEqual(['fits.bin']));
  });

  it('refreshes file lists once uploads finish', async () => {
    const server = fakeServer();
    const { store } = setup();
    store.dispatch(filesApi.endpoints.getFiles.initiate({}));
    await vi.waitFor(() => expect(server.other).toEqual(['/files']));

    store.dispatch(startUploads([makeFile('a.txt'), makeFile('b.txt')], null));
    await vi.waitFor(() => expect(server.uploads).toHaveLength(2));
    server.uploads.forEach((u) => u.succeed());

    // Both finished close together → ONE refetch, not one per file.
    await vi.waitFor(() => expect(server.other).toEqual(['/files', '/files']));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(server.other).toEqual(['/files', '/files']);
  });
});
