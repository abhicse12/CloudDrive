import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Toaster } from '../../components/ui/Toaster.jsx';
import { resetToasts } from '../../components/ui/toast.js';
import { FilesPage } from '../../pages/FilesPage.jsx';
import { apiError, mockApi, renderPage } from '../../test-utils/renderWithApp.jsx';

afterEach(() => {
  act(() => resetToasts());
  cleanup();
});

const auth = { user: { id: 'u1', name: 'Alice', role: 'USER' }, status: 'authenticated' };
const ok = (data, meta) => ({ data: { success: true, data, ...(meta && { meta }) } });
const uuid = (n) => `${String(n).repeat(8)}-1111-4111-8111-111111111111`;

const DOCS = { id: uuid(1), name: 'Docs', parentId: null };
const PICS = { id: uuid(2), name: 'Pics', parentId: null };
const WORK = { id: uuid(3), name: 'Work', parentId: DOCS.id };
const FILES = ['a.png', 'b.pdf', 'report.txt'].map((name, i) => ({
  id: uuid(i + 4),
  name,
  category: 'DOCUMENT',
  size: 100,
  createdAt: '2026-11-01T10:00:00.000Z',
  folderId: null,
}));

function FilesWithToasts() {
  return (
    <>
      <FilesPage />
      <Toaster />
    </>
  );
}

function setup(extraRoutes = {}) {
  const calls = mockApi({
    'GET /folders': () => ok({ folders: [DOCS, PICS] }),
    'GET /files': () =>
      ok({ files: FILES }, { page: 1, pageSize: 50, total: FILES.length, totalPages: 1 }),
    'GET /folders/tree': () => ok({ folders: [DOCS, PICS, WORK] }),
    'POST /files/bulk': (body) => ok({ action: body.action, affected: body.ids.length }),
    [`DELETE /folders/${DOCS.id}`]: () => ({ status: 204, data: '' }),
    [`POST /folders/${DOCS.id}/restore`]: () => ok({ folder: DOCS }),
    ...extraRoutes,
  });
  const { router } = renderPage('/app/files/:folderId?', FilesWithToasts, {
    url: '/app/files',
    auth,
    guestOnly: false,
  });
  return { calls, router };
}

/** The card or row around an item's name: what a mouse user clicks. */
const itemOf = (name) => screen.getByText(name).closest('li, tr, div.group');
const selectedCount = () => screen.queryByRole('toolbar', { name: 'Selected items' });
const sent = (calls, key) => calls.filter((c) => c.key === key);

describe('selecting', () => {
  it('click selects one; Ctrl-click adds; Shift-click selects a range; Esc clears', async () => {
    setup();
    await screen.findByText('report.txt');

    fireEvent.click(itemOf('Docs'));
    expect(selectedCount().textContent).toContain('1 selected');

    fireEvent.click(itemOf('b.pdf'), { ctrlKey: true });
    expect(selectedCount().textContent).toContain('2 selected');

    // Range from the anchor (b.pdf) to Pics, in screen order: Pics, a.png, b.pdf.
    fireEvent.click(itemOf('Pics'), { shiftKey: true });
    expect(selectedCount().textContent).toContain('3 selected');
    expect(screen.getByRole('checkbox', { name: 'Select Docs' }).checked).toBe(false);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(selectedCount()).toBeNull(); // the filter bar is back
    expect(screen.getByRole('group', { name: 'Filter by type' })).toBeTruthy();
  });

  it('checkboxes toggle items (keyboard users), and Ctrl+A selects everything', async () => {
    setup();
    await screen.findByText('report.txt');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select a.png' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Pics' }));
    expect(selectedCount().textContent).toContain('2 selected');

    fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
    expect(selectedCount().textContent).toContain('5 selected');
  });

  it('shortcuts are ignored while typing in a text field', async () => {
    setup();
    await screen.findByText('report.txt');
    const field = document.createElement('input');
    document.body.append(field);

    fireEvent.keyDown(field, { key: 'a', ctrlKey: true });

    expect(selectedCount()).toBeNull();
    field.remove();
  });
});

describe('trash with undo', () => {
  it('trashes files in one bulk request and folders one by one, then Undo restores', async () => {
    const { calls } = setup();
    await screen.findByText('report.txt');
    fireEvent.click(itemOf('Docs'));
    fireEvent.click(itemOf('a.png'), { ctrlKey: true });
    fireEvent.click(itemOf('b.pdf'), { ctrlKey: true });

    fireEvent.click(screen.getByRole('button', { name: 'Move to trash' }));

    await screen.findByText('Moved 3 items to trash');
    expect(sent(calls, 'POST /files/bulk')[0].body).toEqual({
      action: 'trash',
      ids: [FILES[0].id, FILES[1].id],
    });
    expect(sent(calls, `DELETE /folders/${DOCS.id}`)).toHaveLength(1);
    expect(selectedCount()).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    await screen.findByText('Restored 3 items');
    expect(sent(calls, 'POST /files/bulk')[1].body).toEqual({
      action: 'restore',
      ids: [FILES[0].id, FILES[1].id],
    });
    expect(sent(calls, `POST /folders/${DOCS.id}/restore`)).toHaveLength(1);
  });

  it('the Delete key trashes the selection', async () => {
    const { calls } = setup();
    await screen.findByText('report.txt');
    fireEvent.click(itemOf('report.txt'));

    fireEvent.keyDown(window, { key: 'Delete' });

    await screen.findByText('Moved “report.txt” to trash');
    expect(sent(calls, 'POST /files/bulk')[0].body.ids).toEqual([FILES[2].id]);
  });

  it('says what failed when part of it fails', async () => {
    setup({
      [`DELETE /folders/${DOCS.id}`]: () => apiError(500, 'INTERNAL_ERROR', 'Server hiccup.'),
    });
    await screen.findByText('report.txt');
    fireEvent.click(itemOf('Docs'));
    fireEvent.click(itemOf('a.png'), { ctrlKey: true });

    fireEvent.click(screen.getByRole('button', { name: 'Move to trash' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      "Couldn't move to trash some items: Server hiccup.",
    );
  });
});

describe('menus', () => {
  it('right-click on an item selects it and opens its menu; Open enters the folder', async () => {
    const { router } = setup();
    await screen.findByText('report.txt');
    fireEvent.click(itemOf('a.png')); // something else selected first

    fireEvent.contextMenu(itemOf('Docs'), { clientX: 100, clientY: 100 });

    const menu = screen.getByRole('menu');
    expect(selectedCount().textContent).toContain('1 selected');
    expect(screen.getByRole('checkbox', { name: 'Select Docs' }).checked).toBe(true);
    expect(
      within(menu).getByRole('menuitem', { name: /Share/ }).getAttribute('aria-disabled'),
    ).toBe('true');

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Open' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/app/files/${DOCS.id}`));
  });

  it('⋯ on a selected item acts on the whole selection', async () => {
    setup();
    await screen.findByText('report.txt');
    fireEvent.click(itemOf('a.png'));
    fireEvent.click(itemOf('b.pdf'), { ctrlKey: true });

    fireEvent.click(screen.getByRole('button', { name: 'Actions for a.png' }));

    expect(screen.getByRole('menuitem', { name: 'Move 2 items…' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /Rename/ })).toBeNull(); // single only
  });
});

describe('rename', () => {
  it('renames a file; the extension is not selected, so typing keeps it', async () => {
    const { calls } = setup({
      [`PATCH /files/${FILES[2].id}`]: (body) => ok({ file: { ...FILES[2], ...body } }),
    });
    await screen.findByText('report.txt');
    fireEvent.click(itemOf('report.txt'));

    fireEvent.keyDown(window, { key: 'F2' });

    const input = await screen.findByLabelText('Name');
    expect(input.value).toBe('report.txt');
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 'report'.length]);
    fireEvent.change(input, { target: { value: 'final.txt' } });
    // Inside the dialog: the selection toolbar behind it has a Rename button too.
    const dialog = screen.getByRole('dialog', { name: 'Rename' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));

    await screen.findByText('Renamed to “final.txt”');
    expect(sent(calls, `PATCH /files/${FILES[2].id}`)[0].body).toEqual({ name: 'final.txt' });
  });

  it('shows "name taken" on the field for folders', async () => {
    setup({
      [`PATCH /folders/${DOCS.id}`]: () =>
        apiError(409, 'FOLDER_NAME_TAKEN', 'A folder with this name already exists here.', [
          { field: 'name', message: 'A folder with this name already exists here.' },
        ]),
    });
    await screen.findByText('report.txt');

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Docs' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Rename/ }));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Pics' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    expect(await screen.findByText('A folder with this name already exists here.')).toBeTruthy();
    expect(screen.getByLabelText('Name').getAttribute('aria-invalid')).toBe('true');
  });
});

describe('move', () => {
  it('greys out the folder itself and everything inside it, then moves', async () => {
    const { calls } = setup({
      [`PATCH /folders/${DOCS.id}`]: (body) => ok({ folder: { ...DOCS, ...body } }),
    });
    await screen.findByText('report.txt');
    fireEvent.click(itemOf('Docs'));
    fireEvent.click(itemOf('a.png'), { ctrlKey: true });

    fireEvent.click(screen.getByRole('button', { name: 'Move' }));

    const dialog = await screen.findByRole('dialog', { name: 'Move 2 items' });
    const tree = await within(dialog).findByRole('list', { name: 'Folders' });
    const option = (name) => within(tree).getByRole('button', { name: new RegExp(`^${name}`) });
    expect(option('My Files').disabled).toBe(true); // already here ("Current")
    expect(option('Docs').disabled).toBe(true); // can't go into itself
    fireEvent.click(within(tree).getByRole('button', { name: 'Expand Docs' }));
    expect(option('Work').disabled).toBe(true); // ...or inside itself

    fireEvent.click(option('Pics'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move to Pics' }));

    await screen.findByText('Moved 2 items to Pics');
    expect(sent(calls, `PATCH /folders/${DOCS.id}`)[0].body).toEqual({ parentId: PICS.id });
    expect(sent(calls, 'POST /files/bulk')[0].body).toEqual({
      action: 'move',
      ids: [FILES[0].id],
      folderId: PICS.id,
    });
  });
});
