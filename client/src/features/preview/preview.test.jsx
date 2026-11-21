import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '../../components/ui/Toaster.jsx';
import { resetToasts } from '../../components/ui/toast.js';
import { FilesPage } from '../../pages/FilesPage.jsx';
import { apiError, mockApi, renderPage } from '../../test-utils/renderWithApp.jsx';

const MB = 1024 * 1024;
const auth = { user: { id: 'u1', name: 'Alice', role: 'USER' }, status: 'authenticated' };
const ok = (data, meta) => ({ data: { success: true, data, ...(meta && { meta }) } });
const uuid = (n) => `${String(n).repeat(8)}-1111-4111-8111-111111111111`;

const file = (n, name, mimeType, category, size = 2048) => ({
  id: uuid(n),
  name,
  mimeType,
  category,
  size,
  createdAt: '2026-11-01T10:00:00.000Z',
  folderId: null,
});
const PHOTO = file(1, 'photo.png', 'image/png', 'IMAGE');
const CLIP = file(2, 'clip.mp4', 'video/mp4', 'VIDEO');
const PAPER = file(3, 'paper.pdf', 'application/pdf', 'DOCUMENT');
const NOTES = file(4, 'notes.txt', 'text/plain', 'DOCUMENT', 3 * MB);
const BACKUP = file(5, 'backup.zip', 'application/zip', 'ARCHIVE');
const FILES = [PHOTO, CLIP, PAPER, NOTES, BACKUP];
const DOCS = { id: uuid(9), name: 'Docs', parentId: null };

let anchorClicks;
let fetchCalls;

beforeEach(() => {
  anchorClicks = [];
  // Real browsers would start a download; record what would have been downloaded.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
    anchorClicks.push({ href: this.getAttribute('href'), download: this.download });
  });
  fetchCalls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options) => {
      fetchCalls.push({ url, range: options?.headers?.Range });
      return { ok: true, status: 206, text: async () => 'first line\nsecond line' };
    }),
  );
});
afterEach(() => {
  act(() => resetToasts());
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup(extraRoutes = {}) {
  const linkRoutes = Object.fromEntries(
    FILES.map((f) => [
      `GET /files/${f.id}/download`,
      (_body, { disposition }) =>
        ok({ url: `/api/storage/token-${f.name}-${disposition}`, disposition, expiresAt: 'x' }),
    ]),
  );
  const calls = mockApi({
    'GET /folders': () => ok({ folders: [DOCS] }),
    'GET /files': () =>
      ok({ files: FILES }, { page: 1, pageSize: 50, total: FILES.length, totalPages: 1 }),
    ...linkRoutes,
    ...extraRoutes,
  });
  renderPage(
    '/app/files/:folderId?',
    () => (
      <>
        <FilesPage />
        <Toaster />
      </>
    ),
    { url: '/app/files', auth, guestOnly: false },
  );
  return calls;
}

const openPreview = async (name) => {
  fireEvent.click(await screen.findByRole('button', { name }));
  return screen.findByRole('dialog', { name });
};
const linkRequests = (calls) => calls.filter((c) => c.key.endsWith('/download'));

describe('preview', () => {
  it('clicking a file name opens it; images show inline from a signed link', async () => {
    const calls = setup();

    const dialog = await openPreview('photo.png');

    const img = await within(dialog).findByRole('img', { name: 'photo.png' });
    expect(img.getAttribute('src')).toBe('/api/storage/token-photo.png-inline');
    expect(dialog.textContent).toContain('2 KB · Image');
    expect(linkRequests(calls)[0].params).toEqual({ disposition: 'inline' });
  });

  it('← → step through the files in the list, and the ends are disabled', async () => {
    setup();
    const dialog = await openPreview('photo.png');
    expect(within(dialog).getByRole('button', { name: 'Previous file' }).disabled).toBe(true);

    fireEvent.keyDown(window, { key: 'ArrowRight' });

    const video = await waitFor(() => {
      const element = screen.getByRole('dialog', { name: 'clip.mp4' }).querySelector('video');
      expect(element).toBeTruthy();
      return element;
    });
    expect(video.getAttribute('src')).toBe('/api/storage/token-clip.mp4-inline');
    expect(screen.getByText('2 of 5')).toBeTruthy();

    // While the video player has focus, arrows seek the video instead.
    fireEvent.keyDown(video, { key: 'ArrowRight' });
    expect(screen.getByRole('dialog', { name: 'clip.mp4' })).toBeTruthy();

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(await screen.findByRole('dialog', { name: 'photo.png' })).toBeTruthy();
  });

  it('shows PDFs in a frame', async () => {
    setup();

    const dialog = await openPreview('paper.pdf');

    const frame = await within(dialog).findByTitle('Preview of paper.pdf');
    expect(frame.getAttribute('src')).toBe('/api/storage/token-paper.pdf-inline');
  });

  it('shows only the first 1 MB of text, asking the server for just that range', async () => {
    setup();

    const dialog = await openPreview('notes.txt');

    expect((await within(dialog).findByText(/first line/)).tagName).toBe('PRE');
    expect(fetchCalls).toEqual([
      { url: '/api/storage/token-notes.txt-inline', range: 'bytes=0-1048575' },
    ]);
    expect(dialog.textContent).toContain('Showing the first 1 MB of 3 MB');
  });

  it("offers a download for types that can't be previewed, without asking for a link", async () => {
    const calls = setup();

    const dialog = await openPreview('backup.zip');

    expect(within(dialog).getByText("This file type can't be previewed.")).toBeTruthy();
    expect(linkRequests(calls)).toHaveLength(0);
  });

  it('respects the server when it refuses to show a file inline', async () => {
    setup({
      [`GET /files/${PHOTO.id}/download`]: () =>
        ok({ url: '/api/storage/x', disposition: 'attachment', expiresAt: 'x' }),
    });

    const dialog = await openPreview('photo.png');

    expect(await within(dialog).findByText("This file type can't be previewed.")).toBeTruthy();
    expect(within(dialog).queryByRole('img')).toBeNull();
  });

  it('explains a failed link and can retry', async () => {
    let fail = true;
    setup({
      [`GET /files/${PHOTO.id}/download`]: () =>
        fail
          ? apiError(404, 'NOT_FOUND', 'File not found.')
          : ok({ url: '/api/storage/ok', disposition: 'inline', expiresAt: 'x' }),
    });
    const dialog = await openPreview('photo.png');
    expect((await within(dialog).findByRole('alert')).textContent).toContain('File not found.');

    fail = false;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Try again' }));

    expect(await within(dialog).findByRole('img', { name: 'photo.png' })).toBeTruthy();
  });
});

describe('download', () => {
  it('from the ⋯ menu: asks for an attachment link and hands it to the browser', async () => {
    const calls = setup();

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for paper.pdf' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Download' }));

    await waitFor(() =>
      expect(anchorClicks).toEqual([
        { href: '/api/storage/token-paper.pdf-attachment', download: 'paper.pdf' },
      ]),
    );
    expect(linkRequests(calls)[0].params).toEqual({ disposition: 'attachment' });
  });

  it('the toolbar offers Download only when every selected item is a file', async () => {
    setup();
    const card = (name) => screen.getByText(name).closest('li, div.group');
    await screen.findByText('photo.png');

    fireEvent.click(card('photo.png'));
    fireEvent.click(card('clip.mp4'), { ctrlKey: true });
    const toolbar = screen.getByRole('toolbar', { name: 'Selected items' });
    expect(within(toolbar).getByRole('button', { name: 'Download' })).toBeTruthy();

    fireEvent.click(card('Docs'), { ctrlKey: true });
    expect(within(toolbar).queryByRole('button', { name: 'Download' })).toBeNull();
  });

  it('downloads several files one after another', async () => {
    setup();
    const card = (name) => screen.getByText(name).closest('li, div.group');
    await screen.findByText('photo.png');
    fireEvent.click(card('photo.png'));
    fireEvent.click(card('backup.zip'), { ctrlKey: true });

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    await waitFor(() =>
      expect(anchorClicks.map((c) => c.download)).toEqual(['photo.png', 'backup.zip']),
    );
  });
});
