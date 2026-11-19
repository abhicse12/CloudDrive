import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FilesPage } from '../../pages/FilesPage.jsx';
import { apiError, mockApi, renderPage } from '../../test-utils/renderWithApp.jsx';
import { UploadDialog } from './UploadDialog.jsx';

afterEach(cleanup);

const auth = { user: { id: 'u1', name: 'Alice', role: 'USER' }, status: 'authenticated' };
const ok = (data, meta) => ({ data: { success: true, data, ...(meta && { meta }) } });
const DOCS = { id: '11111111-1111-4111-8111-111111111111', name: 'Docs', parentId: null };
const emptyFiles = () => ok({ files: [] }, { page: 1, pageSize: 50, total: 0, totalPages: 1 });

// In the app, the dialog lives in AppLayout; here we render it next to the page.
function FilesWithUploads() {
  return (
    <>
      <FilesPage />
      <UploadDialog />
    </>
  );
}

const render = (url = '/app/files') =>
  renderPage('/app/files/:folderId?', FilesWithUploads, { url, auth, guestOnly: false });

function routes(extra = {}) {
  return {
    'GET /folders': () => ok({ folders: [] }),
    'GET /files': emptyFiles,
    'GET /config': () =>
      ok({ maxFileSizeBytes: 100 * 1024 * 1024, maxFilesPerUpload: 20, trashRetentionDays: 30 }),
    'GET /dashboard/stats': () => ok({ remaining: 10 * 1024 * 1024 }),
    'POST /files/upload': () => ({ status: 201, data: ok({ uploaded: [{ id: 'new' }] }).data }),
    ...extra,
  };
}

const textFile = (name) => new File(['hello'], name, { type: 'text/plain' });

describe('uploading from the Files page', () => {
  it('New → Upload files opens the dialog; chosen files upload into this folder', async () => {
    const calls = mockApi(
      routes({
        [`GET /folders/${DOCS.id}`]: () => ok({ folder: DOCS, breadcrumbs: [DOCS] }),
      }),
    );
    render(`/app/files/${DOCS.id}`);
    await screen.findByText('This folder is empty');

    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Upload files' }));

    const dialog = await screen.findByRole('dialog', { name: 'Upload files' });
    expect(dialog.textContent).toContain('To Docs');
    fireEvent.change(dialog.querySelector('input[type="file"]'), {
      target: { files: [textFile('notes.txt')] },
    });

    expect(await screen.findByLabelText('Uploaded')).toBeTruthy();
    const upload = calls.find((c) => c.key === 'POST /files/upload');
    expect(upload.body.get('folderId')).toBe(DOCS.id);
    expect(upload.body.get('files').name).toBe('notes.txt');
  });

  it('files dropped anywhere on the page start uploading', async () => {
    const calls = mockApi(routes());
    render();
    const page = (await screen.findByText('This folder is empty')).closest('.relative');
    const dataTransfer = { types: ['Files'], files: [textFile('dropped.txt')] };

    fireEvent.dragEnter(page, { dataTransfer });
    expect(screen.getByText('Drop files to upload to My Files')).toBeTruthy();
    fireEvent.drop(page, { dataTransfer });

    expect(await screen.findByRole('dialog', { name: 'Upload files' })).toBeTruthy();
    await waitFor(() => expect(calls.some((c) => c.key === 'POST /files/upload')).toBe(true));
    expect(screen.queryByText('Drop files to upload to My Files')).toBeNull();
  });

  it('ignores things that are not files being dragged (e.g. selected text)', async () => {
    mockApi(routes());
    render();
    const page = (await screen.findByText('This folder is empty')).closest('.relative');

    fireEvent.dragEnter(page, { dataTransfer: { types: ['text/plain'], files: [] } });

    expect(screen.queryByText(/Drop files to upload/)).toBeNull();
  });

  it('shows the reason a file was refused', async () => {
    mockApi(
      routes({
        'POST /files/upload': () =>
          apiError(415, 'UNSUPPORTED_FILE_TYPE', 'This file type is not supported.'),
      }),
    );
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Upload files' })); // empty-state button

    const dialog = await screen.findByRole('dialog', { name: 'Upload files' });
    fireEvent.change(dialog.querySelector('input[type="file"]'), {
      target: { files: [textFile('virus.exe')] },
    });

    expect(await screen.findByText("This file type isn't supported.")).toBeTruthy();
  });
});

describe('new folder', () => {
  it('creates a folder inside the current one', async () => {
    const calls = mockApi(
      routes({
        [`GET /folders/${DOCS.id}`]: () => ok({ folder: DOCS, breadcrumbs: [DOCS] }),
        'POST /folders': (body) => ({
          status: 201,
          data: ok({ folder: { id: 'n', parentId: DOCS.id, ...body } }).data,
        }),
      }),
    );
    render(`/app/files/${DOCS.id}`);
    await screen.findByText('This folder is empty');

    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New folder' }));
    fireEvent.change(await screen.findByLabelText('Folder name'), {
      target: { value: '  Reports  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(calls.find((c) => c.key === 'POST /folders')?.body).toEqual({
        name: 'Reports',
        parentId: DOCS.id,
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New folder' })).toBeNull());
  });

  it('shows "name taken" from the server on the field', async () => {
    mockApi(
      routes({
        'POST /folders': () =>
          apiError(409, 'FOLDER_NAME_TAKEN', 'A folder with this name already exists here.', [
            { field: 'name', message: 'A folder with this name already exists here.' },
          ]),
      }),
    );
    render();
    await screen.findByText('This folder is empty');

    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New folder' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Create' }));

    const input = await screen.findByLabelText('Folder name');
    await waitFor(() => expect(input.getAttribute('aria-invalid')).toBe('true'));
    expect(screen.getByText('A folder with this name already exists here.')).toBeTruthy();
  });

  it('checks the name before sending', async () => {
    const calls = mockApi(routes());
    render();
    await screen.findByText('This folder is empty');

    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New folder' }));
    fireEvent.change(await screen.findByLabelText('Folder name'), { target: { value: 'a/b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('Name cannot contain / or \\.')).toBeTruthy();
    expect(calls.some((c) => c.key === 'POST /folders')).toBe(false);
  });
});
