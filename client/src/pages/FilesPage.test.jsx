import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { apiError, mockApi, renderPage } from '../test-utils/renderWithApp.jsx';
import { FilesPage } from './FilesPage.jsx';

const user = { id: 'u1', name: 'Alice', email: 'a@example.com', role: 'USER' };
const auth = { user, status: 'authenticated' };
const ok = (data, meta) => ({ data: { success: true, data, ...(meta && { meta }) } });

const DOCS = { id: '11111111-1111-4111-8111-111111111111', name: 'Docs', parentId: null };
const WORK = { id: '22222222-2222-4222-8222-222222222222', name: 'Work', parentId: DOCS.id };
const file = (n, extra = {}) => ({
  id: `f${n}`,
  name: `file-${n}.png`,
  category: 'IMAGE',
  size: 1024 * n,
  createdAt: '2026-11-01T10:00:00.000Z',
  ...extra,
});

/** /files in pages of `pageSize`, like the real API. */
const filesRoute =
  (all, pageSize = 50) =>
  (_body, { page = 1 }) =>
    ok(
      { files: all.slice((page - 1) * pageSize, page * pageSize) },
      {
        page,
        pageSize,
        total: all.length,
        totalPages: Math.max(1, Math.ceil(all.length / pageSize)),
      },
    );

const render = (url) =>
  renderPage('/app/files/:folderId?', FilesPage, { url, auth, guestOnly: false });

const callsTo = (calls, key) => calls.filter((c) => c.key === key);

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('browsing', () => {
  it('shows the root: folders first, then files', async () => {
    const calls = mockApi({
      'GET /folders': () => ok({ folders: [DOCS] }),
      'GET /files': filesRoute([file(1), file(2)]),
    });

    render('/app/files');

    expect(await screen.findByRole('link', { name: 'Docs' })).toBeTruthy();
    expect(screen.getByText('file-1.png')).toBeTruthy();
    expect(screen.getByText('Showing 2 of 2 files')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Docs' }).getAttribute('href')).toBe(
      `/app/files/${DOCS.id}`,
    );
    // Root: no folder IDs sent; default sort is name, ascending.
    expect(callsTo(calls, 'GET /folders')[0].params).toEqual({ sortBy: 'name', sortOrder: 'asc' });
    expect(callsTo(calls, 'GET /files')[0].params).toMatchObject({
      sortBy: 'name',
      sortOrder: 'asc',
    });
    expect(callsTo(calls, 'GET /files')[0].params).not.toHaveProperty('folderId');
  });

  it('shows breadcrumbs inside a folder and asks only for its contents', async () => {
    const calls = mockApi({
      [`GET /folders/${WORK.id}`]: () =>
        ok({ folder: WORK, breadcrumbs: [DOCS, { id: WORK.id, name: 'Work' }] }),
      'GET /folders': () => ok({ folders: [] }),
      'GET /files': filesRoute([file(1)]),
    });

    render(`/app/files/${WORK.id}`);

    const trail = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    expect(within(trail).getByRole('link', { name: 'My Files' }).getAttribute('href')).toBe(
      '/app/files',
    );
    expect(within(trail).getByRole('link', { name: 'Docs' })).toBeTruthy();
    expect(within(trail).getByText('Work').getAttribute('aria-current')).toBe('page');
    await screen.findByText('file-1.png');
    expect(callsTo(calls, 'GET /folders')[0].params).toMatchObject({ parentId: WORK.id });
    expect(callsTo(calls, 'GET /files')[0].params).toMatchObject({ folderId: WORK.id });
  });

  it('says "Folder not found" for a missing, foreign or trashed folder', async () => {
    mockApi({
      [`GET /folders/${DOCS.id}`]: () => apiError(404, 'NOT_FOUND', 'Folder not found.'),
      'GET /folders': () => apiError(404, 'NOT_FOUND', 'Folder not found.'),
      'GET /files': () => apiError(404, 'NOT_FOUND', 'Folder not found.'),
    });

    render(`/app/files/${DOCS.id}`);

    expect(await screen.findByText('Folder not found')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to My Files' })).toBeTruthy();
  });

  it('shows an empty state for an empty folder', async () => {
    mockApi({ 'GET /folders': () => ok({ folders: [] }), 'GET /files': filesRoute([]) });

    render('/app/files');

    expect(await screen.findByText('This folder is empty')).toBeTruthy();
  });

  it('shows the server error with a working "Try again"', async () => {
    let fail = true;
    mockApi({
      'GET /folders': () => ok({ folders: [] }),
      'GET /files': (body, params) =>
        fail
          ? apiError(500, 'INTERNAL_ERROR', 'Database is down.')
          : filesRoute([file(1)])(body, params),
    });

    render('/app/files');

    expect((await screen.findByRole('alert')).textContent).toContain('Database is down.');
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('file-1.png')).toBeTruthy();
  });
});

describe('sort, filter and view', () => {
  beforeEach(() => {
    mockApi({
      'GET /folders': () => ok({ folders: [DOCS] }),
      'GET /files': filesRoute([file(1)]),
    });
  });

  it('sorts by size, descending, and keeps it in the URL', async () => {
    const calls = mockApi({
      'GET /folders': () => ok({ folders: [DOCS] }),
      'GET /files': filesRoute([file(1)]),
    });
    const { router } = render('/app/files');
    await screen.findByText('file-1.png');

    fireEvent.click(screen.getByRole('button', { name: 'Sort by Name' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Size' }));
    fireEvent.click(await screen.findByRole('button', { name: /Sort descending/ }));

    await waitFor(() => expect(router.state.location.search).toBe('?sortBy=size&sortOrder=desc'));
    await waitFor(() =>
      expect(callsTo(calls, 'GET /files').at(-1).params).toMatchObject({
        sortBy: 'size',
        sortOrder: 'desc',
      }),
    );
    // Folders can't be sorted by size: they fall back to name.
    expect(callsTo(calls, 'GET /folders').at(-1).params).toMatchObject({ sortBy: 'name' });
  });

  it('filters by type and hides folders while filtering', async () => {
    const { router } = render('/app/files');
    await screen.findByRole('link', { name: 'Docs' });

    fireEvent.click(screen.getByRole('button', { name: 'Images' }));

    await waitFor(() => expect(router.state.location.search).toBe('?category=IMAGE'));
    expect(screen.getByRole('button', { name: 'Images' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Docs' })).toBeNull());
  });

  it('ignores invalid values typed into the URL', async () => {
    const calls = mockApi({
      'GET /folders': () => ok({ folders: [] }),
      'GET /files': filesRoute([file(1)]),
    });

    render('/app/files?sortBy=password&sortOrder=sideways&category=EXE');

    await screen.findByText('file-1.png');
    expect(callsTo(calls, 'GET /files')[0].params).toEqual({
      sortBy: 'name',
      sortOrder: 'asc',
      page: 1,
      pageSize: 50,
    });
  });

  it('switches to list view and remembers it', async () => {
    render('/app/files');
    await screen.findByText('file-1.png');

    fireEvent.click(screen.getByRole('button', { name: 'List view' }));

    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByRole('cell', { name: '1 KB' })).toBeTruthy();
    expect(localStorage.getItem('clouddrive.viewMode')).toBe('list');
  });
});

describe('search', () => {
  it('searches every folder for files only', async () => {
    const calls = mockApi({
      'GET /folders': () => ok({ folders: [DOCS] }),
      'GET /files': filesRoute([file(7, { name: 'report.pdf', category: 'DOCUMENT' })]),
    });

    render('/app/files?q=report');

    expect(await screen.findByRole('heading', { name: 'Results for “report”' })).toBeTruthy();
    expect(await screen.findByText('report.pdf')).toBeTruthy();
    expect(callsTo(calls, 'GET /folders')).toHaveLength(0);
    expect(callsTo(calls, 'GET /files')[0].params).toMatchObject({ q: 'report' });
    expect(callsTo(calls, 'GET /files')[0].params).not.toHaveProperty('folderId');
  });

  it('says so when nothing matches', async () => {
    mockApi({ 'GET /files': filesRoute([]) });

    render('/app/files?q=zzz');

    expect(await screen.findByText('No files match “zzz”')).toBeTruthy();
  });
});

describe('load more', () => {
  it('fetches the next page and appends it', async () => {
    const all = Array.from({ length: 3 }, (_, i) => file(i + 1));
    const calls = mockApi({
      'GET /folders': () => ok({ folders: [] }),
      'GET /files': filesRoute(all, 2),
    });
    render('/app/files');
    expect(await screen.findByText('Showing 2 of 3 files')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('file-3.png')).toBeTruthy();
    expect(screen.getByText('Showing 3 of 3 files')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    expect(callsTo(calls, 'GET /files').map((c) => c.params.page)).toEqual([1, 2]);
  });
});
