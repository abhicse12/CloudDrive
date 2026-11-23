import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { apiError, mockApi, renderPage } from '../test-utils/renderWithApp.jsx';
import { SharePage } from './SharePage.jsx';

afterEach(() => {
  cleanup();
  // React 19 puts <title>/<meta> into <head>; don't let one test see another's.
  document.head.querySelectorAll('meta').forEach((meta) => meta.remove());
});

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde';
const ok = (share) => () => ({ data: { success: true, data: { share } } });

const PDF = {
  fileName: 'Q3 report.pdf',
  size: 2048,
  mimeType: 'application/pdf',
  category: 'DOCUMENT',
  expiresAt: '2026-11-30T10:00:00.000Z',
  canPreview: true,
};

function open(route, { auth } = {}) {
  const calls = mockApi({ [`GET /public/shares/${TOKEN}`]: route });
  renderPage('/s/:token', SharePage, { url: `/s/${TOKEN}`, guestOnly: false, auth });
  return calls;
}

describe('public share page', () => {
  it('shows the file and links to download and open it', async () => {
    open(ok(PDF));

    expect(await screen.findByRole('heading', { name: 'Q3 report.pdf' })).toBeTruthy();
    expect(screen.getByText(/2 KB/)).toBeTruthy();
    expect(screen.getByText(/^Expires /)).toBeTruthy();

    const download = screen.getByRole('link', { name: 'Download' });
    expect(download.getAttribute('href')).toBe(`/api/public/shares/${TOKEN}/download`);

    const openLink = screen.getByRole('link', { name: 'Open' });
    expect(openLink.getAttribute('href')).toBe(
      `/api/public/shares/${TOKEN}/download?disposition=inline`,
    );
    expect(openLink.getAttribute('target')).toBe('_blank');
    expect(openLink.getAttribute('rel')).toContain('noreferrer');
  });

  it('only loads the description: no embedded preview fetches the bytes', async () => {
    const calls = open(ok({ ...PDF, category: 'IMAGE', mimeType: 'image/png' }));
    await screen.findByRole('heading', { name: 'Q3 report.pdf' });

    // Anything that would load the file by itself would count as a download.
    expect(document.querySelectorAll('img, iframe, video, audio, object, embed')).toHaveLength(0);
    expect(calls.map((c) => c.key).filter((k) => k.includes('/download'))).toEqual([]);
  });

  it('offers no "Open" for types the browser must not display, and shows "Never expires"', async () => {
    open(ok({ ...PDF, fileName: 'old.doc', canPreview: false, expiresAt: null }));

    await screen.findByRole('heading', { name: 'old.doc' });
    expect(screen.queryByRole('link', { name: 'Open' })).toBeNull();
    expect(screen.getByText('Never expires')).toBeTruthy();
  });

  it('keeps the token out of Referer headers and the page out of search engines', async () => {
    open(ok(PDF));
    await screen.findByRole('heading', { name: 'Q3 report.pdf' });

    expect(document.head.querySelector('meta[name="referrer"]').content).toBe('no-referrer');
    expect(document.head.querySelector('meta[name="robots"]').content).toBe('noindex, nofollow');
  });

  it('shows one generic message for any broken link, and nothing about the file', async () => {
    open(() =>
      apiError(404, 'NOT_FOUND', 'This link is invalid, has expired, or is no longer shared.'),
    );

    expect(await screen.findByRole('heading', { name: 'This link isn’t available' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/expired or been turned off/);
    expect(screen.queryByRole('link', { name: 'Download' })).toBeNull();
  });

  it('says so when rate limited, instead of calling the link broken', async () => {
    open(() => apiError(429, 'RATE_LIMITED', 'Too many requests.'));

    expect(await screen.findByRole('heading', { name: 'Too many requests' })).toBeTruthy();
  });

  it('works the same for a logged-in visitor', async () => {
    open(ok(PDF), {
      auth: { user: { id: 'u1', name: 'Bob', role: 'USER' }, status: 'authenticated' },
    });

    expect(await screen.findByRole('link', { name: 'Download' })).toBeTruthy();
  });
});
