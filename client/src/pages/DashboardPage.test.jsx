import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Sidebar } from '../layouts/app/Sidebar.jsx';
import { mockApi, renderPage } from '../test-utils/renderWithApp.jsx';
import { DashboardPage } from './DashboardPage.jsx';

afterEach(cleanup);

const KB = 1024;
const GB = 1024 ** 3;
const auth = {
  // storageUsed from login time: stale on purpose, the live stats must win.
  user: { id: 'u1', name: 'Alice Smith', role: 'USER', storageUsed: 0, storageLimit: 5 * GB },
  status: 'authenticated',
};
const ok = (data) => ({ data: { success: true, data } });

const STATS = {
  storageUsed: 6 * KB,
  storageLimit: 5 * GB,
  remaining: 5 * GB - 6 * KB,
  percentUsed: 0,
  fileCount: 3,
  folderCount: 1,
  byCategory: [
    { category: 'IMAGE', count: 2, bytes: 4 * KB },
    { category: 'VIDEO', count: 0, bytes: 0 },
    { category: 'AUDIO', count: 0, bytes: 0 },
    { category: 'DOCUMENT', count: 1, bytes: 1 * KB },
    { category: 'ARCHIVE', count: 0, bytes: 0 },
    { category: 'OTHER', count: 0, bytes: 0 },
  ],
  trashBytes: 1 * KB,
  trashFileCount: 1,
};
const RECENT = [
  {
    id: 'f1',
    name: 'holiday.png',
    mimeType: 'image/png',
    category: 'IMAGE',
    size: 2 * KB,
    createdAt: new Date().toISOString(),
  },
];
const entry = (n, action, metadata) => ({
  id: `a${n}`,
  action,
  targetType: 'FILE',
  targetId: 'f1',
  metadata,
  createdAt: new Date().toISOString(),
});

function routes(extra = {}) {
  return {
    'GET /dashboard/stats': () => ok(STATS),
    'GET /dashboard/recent-files': () => ok({ files: RECENT }),
    'GET /dashboard/activity': (_body, { cursor }) =>
      cursor === 'a2'
        ? ok({ activity: [entry(3, 'FOLDER_CREATED', { name: 'Docs' })], nextCursor: null })
        : ok({
            activity: [
              entry(1, 'FILE_RENAMED', { name: 'holiday.png', previousName: 'IMG_001.png' }),
              entry(2, 'FILE_UPLOADED', { name: 'IMG_001.png' }),
            ],
            nextCursor: 'a2',
          }),
    'GET /files/f1/download': () =>
      ok({ url: '/api/storage/holiday', disposition: 'inline', expiresAt: 'x' }),
    ...extra,
  };
}

const renderDashboard = () => renderPage('/app', DashboardPage, { auth, guestOnly: false });

describe('dashboard', () => {
  it('shows storage by type, the totals and a way to free trash space', async () => {
    mockApi(routes());
    renderDashboard();

    const card = (await screen.findByRole('heading', { name: 'Storage' })).closest('section');
    const legend = await within(card).findByRole('list', { name: 'Usage by type' });

    // Only types that use space, plus trash, each with its exact size.
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Images4 KB', 'Documents1 KB', 'Trash1 KB']);
    expect(within(card).getByRole('img').getAttribute('aria-label')).toBe('6 KB of 5 GB used');
    expect(card.textContent).toContain('3 files · 1 folder');
    expect(
      within(card).getByRole('link', { name: 'Empty trash to free 1 KB' }).getAttribute('href'),
    ).toBe('/app/trash');
  });

  it('lists recent files; clicking one opens its preview', async () => {
    mockApi(routes());
    renderDashboard();

    fireEvent.click(await screen.findByRole('button', { name: /holiday\.png/ }));

    const dialog = await screen.findByRole('dialog', { name: 'holiday.png' });
    expect(
      (await within(dialog).findByRole('img', { name: 'holiday.png' })).getAttribute('src'),
    ).toBe('/api/storage/holiday');
  });

  it('describes activity in plain words and loads older entries on demand', async () => {
    const calls = mockApi(routes());
    renderDashboard();

    expect(await screen.findByText('Renamed “IMG_001.png” to “holiday.png”')).toBeTruthy();
    expect(screen.getByText('Uploaded “IMG_001.png”')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('Created folder “Docs”')).toBeTruthy();
    expect(calls.filter((c) => c.key === 'GET /dashboard/activity').at(-1).params).toMatchObject({
      cursor: 'a2',
    });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull());
  });

  it('Quick upload opens the upload dialog for My Files', async () => {
    mockApi(routes());
    const { store } = renderDashboard();

    fireEvent.click(await screen.findByRole('button', { name: 'Upload files' }));

    expect(store.getState().uploads).toMatchObject({
      dialogOpen: true,
      target: { folderId: null, folderName: 'My Files' },
    });
  });
});

describe('sidebar storage meter', () => {
  it('shows live numbers, not the ones from login time', async () => {
    mockApi(routes({ 'GET /dashboard/stats': () => ok({ ...STATS, storageUsed: 2.5 * GB }) }));

    renderPage('/app', Sidebar, { auth, guestOnly: false });

    const meter = screen.getByRole('progressbar', { name: 'Storage used' });
    await waitFor(() => expect(meter.getAttribute('aria-valuenow')).toBe('50'));
    expect(screen.getByRole('link', { name: 'Trash' })).toBeTruthy(); // enabled now
  });
});
