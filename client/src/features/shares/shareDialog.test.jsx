import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetToasts } from '../../components/ui/toast.js';
import { FilesPage } from '../../pages/FilesPage.jsx';
import { apiError, mockApi, renderPage } from '../../test-utils/renderWithApp.jsx';

const auth = { user: { id: 'u1', name: 'Alice', role: 'USER' }, status: 'authenticated' };
const ok = (data, meta) => ({ data: { success: true, data, ...(meta && { meta }) } });
const uuid = (n) => `${String(n).repeat(8)}-1111-4111-8111-111111111111`;

const DOCS = { id: uuid(1), name: 'Docs', parentId: null };
const PLAN = {
  id: uuid(2),
  name: 'plan.pdf',
  category: 'DOCUMENT',
  size: 100,
  createdAt: '2026-11-01T10:00:00.000Z',
  folderId: null,
  isShared: false,
};
const PHOTO = { ...PLAN, id: uuid(3), name: 'photo.png', category: 'IMAGE', isShared: true };
const URL = 'http://localhost:5173/s/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde';

let writeText;
beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});
afterEach(() => {
  act(() => resetToasts());
  cleanup();
});

function setup(shareRoute = () => created('2026-11-24T10:00:00.000Z')) {
  const calls = mockApi({
    'GET /folders': () => ok({ folders: [DOCS] }),
    'GET /files': () =>
      ok({ files: [PLAN, PHOTO] }, { page: 1, pageSize: 50, total: 2, totalPages: 1 }),
    [`POST /files/${PLAN.id}/share`]: shareRoute,
  });
  renderPage('/app/files/:folderId?', FilesPage, { url: '/app/files', auth, guestOnly: false });
  return calls;
}

function created(expiresAt) {
  return {
    status: 201,
    data: { success: true, data: { share: { id: 's1', status: 'active', expiresAt }, url: URL } },
  };
}

const itemOf = (name) => screen.getByText(name).closest('li, tr');

async function openShareDialog() {
  await screen.findByText('plan.pdf');
  fireEvent.click(screen.getByRole('button', { name: 'Actions for plan.pdf' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Share…' }));
  return screen.findByRole('dialog', { name: 'Share link' });
}

describe('share dialog', () => {
  it('creates a link with the chosen expiry and shows it once, ready to copy', async () => {
    const calls = setup();
    const dialog = await openShareDialog();

    // 7 days is preselected; choose 1 day instead.
    expect(within(dialog).getByRole('radio', { name: '7 days' }).checked).toBe(true);
    fireEvent.click(within(dialog).getByRole('radio', { name: '1 day' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create link' }));

    const field = await within(dialog).findByRole('textbox', { name: 'Share link' });
    expect(field.value).toBe(URL);
    expect(calls.find((c) => c.key === `POST /files/${PLAN.id}/share`).body).toEqual({
      expiresIn: '1d',
    });
    expect(within(dialog).getByText(/shown only once/)).toBeTruthy();
    expect(within(dialog).getByText(/^Expires /)).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith(URL);
    expect(await within(dialog).findByRole('button', { name: 'Copied' })).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Share link' })).toBeNull());
  });

  it('says "Never expires" for links without an expiry', async () => {
    setup(() => created(null));
    const dialog = await openShareDialog();
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Never' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create link' }));

    expect(await within(dialog).findByText('Never expires')).toBeTruthy();
  });

  it('selects the link text when the clipboard is not available', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    setup();
    const dialog = await openShareDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create link' }));
    const field = await within(dialog).findByRole('textbox', { name: 'Share link' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy' }));

    await waitFor(() => expect(field.selectionEnd).toBe(URL.length));
    expect(field.selectionStart).toBe(0);
  });

  it('shows the error and stays on the form when creating fails', async () => {
    setup(() => apiError(404, 'NOT_FOUND', 'File not found.'));
    const dialog = await openShareDialog();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Create link' }));

    expect(await within(dialog).findByText('File not found.')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Create link' })).toBeTruthy();
  });
});

describe('where Share is offered', () => {
  it('only for a single file: not for folders or several items', async () => {
    setup();
    await screen.findByText('plan.pdf');

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Docs' }));
    expect(screen.queryByRole('menuitem', { name: /Share/ })).toBeNull();
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });

    // One file selected: the toolbar offers Share.
    fireEvent.click(itemOf('plan.pdf'));
    const toolbar = screen.getByRole('toolbar', { name: 'Selected items' });
    expect(within(toolbar).getByRole('button', { name: 'Share' })).toBeTruthy();

    // Two files: no Share in the toolbar or in the ⋯ menu.
    fireEvent.click(itemOf('photo.png'), { ctrlKey: true });
    expect(within(toolbar).queryByRole('button', { name: 'Share' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Actions for plan.pdf' }));
    expect(screen.queryByRole('menuitem', { name: /Share/ })).toBeNull();
  });

  it('the toolbar Share button opens the dialog for the selected file', async () => {
    setup();
    await screen.findByText('plan.pdf');
    fireEvent.click(itemOf('plan.pdf'));

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    const dialog = await screen.findByRole('dialog', { name: 'Share link' });
    expect(within(dialog).getByText(/“plan\.pdf”/)).toBeTruthy();
  });
});

describe('shared badge', () => {
  it('marks files that have a working link', async () => {
    setup();
    await screen.findByText('plan.pdf');

    expect(within(itemOf('photo.png')).getByText('Shared')).toBeTruthy();
    expect(within(itemOf('plan.pdf')).queryByText('Shared')).toBeNull();
  });
});
