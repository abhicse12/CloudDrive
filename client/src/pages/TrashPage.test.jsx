import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Toaster } from '../components/ui/Toaster.jsx';
import { resetToasts } from '../components/ui/toast.js';
import { apiError, mockApi, renderPage } from '../test-utils/renderWithApp.jsx';
import { TrashPage } from './TrashPage.jsx';

afterEach(() => {
  act(() => resetToasts());
  cleanup();
});

const DAY = 24 * 3600 * 1000;
const auth = { user: { id: 'u1', name: 'Alice', role: 'USER' }, status: 'authenticated' };
const ok = (data, meta) => ({ data: { success: true, data, ...(meta && { meta }) } });
const deleted = { deletedAt: new Date(Date.now() - 3 * DAY).toISOString() };
const purge = { purgesAt: new Date(Date.now() + 2 * DAY).toISOString() };

const FOLDER = { id: 'fo1', name: 'Old projects', parentId: null, ...deleted, ...purge };
const FILE = {
  id: 'fi1',
  name: 'draft.pdf',
  category: 'DOCUMENT',
  size: 2048,
  ...deleted,
  ...purge,
};

const trashPage = (folders, files) =>
  ok(
    { folders, files, retentionDays: 30 },
    { page: 1, pageSize: 50, total: files.length, totalPages: 1 },
  );

function setup(routes) {
  const calls = mockApi({ 'GET /trash': () => trashPage([FOLDER], [FILE]), ...routes });
  renderPage(
    '/app/trash',
    () => (
      <>
        <TrashPage />
        <Toaster />
      </>
    ),
    { auth, guestOnly: false },
  );
  return calls;
}

const row = (name) => screen.getByText(name).closest('li');

describe('Trash page', () => {
  it('lists folders and files with when they were deleted and when they go for good', async () => {
    setup();

    const list = await screen.findByRole('list', { name: 'Items in trash' });

    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(row('draft.pdf').textContent).toContain(
      '2 KB · Deleted 3 days ago · Gone for good in 2 days',
    );
    expect(row('Old projects').textContent).toContain('Folder · Deleted 3 days ago');
    expect(screen.getByRole('status').textContent).toContain('deleted forever 30 days after');
  });

  it('restores an item', async () => {
    const calls = setup({ 'POST /files/fi1/restore': () => ({ status: 204, data: '' }) });
    await screen.findByText('draft.pdf');

    fireEvent.click(screen.getByRole('button', { name: 'Restore draft.pdf' }));

    expect(await screen.findByText('Restored “draft.pdf”')).toBeTruthy();
    expect(calls.some((c) => c.key === 'POST /files/fi1/restore')).toBe(true);
  });

  it('asks before deleting forever, then deletes', async () => {
    const calls = setup({ 'DELETE /files/fi1/permanent': () => ({ status: 204, data: '' }) });
    await screen.findByText('draft.pdf');

    fireEvent.click(screen.getByRole('button', { name: 'Delete draft.pdf forever' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete “draft.pdf” forever?' });
    expect(calls.some((c) => c.key === 'DELETE /files/fi1/permanent')).toBe(false); // not yet

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete forever' }));

    expect(await screen.findByText('Deleted “draft.pdf” forever')).toBeTruthy();
    expect(calls.some((c) => c.key === 'DELETE /files/fi1/permanent')).toBe(true);
  });

  it('shows the server’s reason inside the dialog when it refuses', async () => {
    setup({
      'DELETE /folders/fo1/permanent': () =>
        apiError(409, 'UPLOAD_IN_PROGRESS', 'Wait for uploads in this folder to finish.'),
    });
    await screen.findByText('Old projects');

    fireEvent.click(screen.getByRole('button', { name: 'Delete Old projects forever' }));
    const dialog = await screen.findByRole('dialog', { name: /Old projects/ });
    expect(dialog.textContent).toContain('everything inside it');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete forever' }));

    expect((await within(dialog).findByRole('alert')).textContent).toContain(
      'Wait for uploads in this folder to finish.',
    );
  });

  it('empties the trash after confirmation', async () => {
    const calls = setup({ 'DELETE /trash': () => ok({ folders: 1, files: 3 }) });
    await screen.findByText('draft.pdf');

    fireEvent.click(screen.getByRole('button', { name: 'Empty trash' }));
    const dialog = await screen.findByRole('dialog', { name: 'Empty the trash?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Empty trash' }));

    expect(await screen.findByText('Trash emptied: 4 items deleted forever')).toBeTruthy();
    expect(calls.some((c) => c.key === 'DELETE /trash')).toBe(true);
  });

  it('shows an empty state, and Empty trash is disabled', async () => {
    setup({ 'GET /trash': () => trashPage([], []) });

    expect(await screen.findByText('Trash is empty')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Empty trash' }).disabled).toBe(true),
    );
  });
});
