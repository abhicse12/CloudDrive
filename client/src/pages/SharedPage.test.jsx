import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Toaster } from '../components/ui/Toaster.jsx';
import { resetToasts } from '../components/ui/toast.js';
import { apiError, mockApi, renderPage } from '../test-utils/renderWithApp.jsx';
import { SharedPage } from './SharedPage.jsx';

afterEach(() => {
  act(() => resetToasts());
  cleanup();
});

const auth = { user: { id: 'u1', name: 'Alice', role: 'USER' }, status: 'authenticated' };
const DAY = 24 * 60 * 60 * 1000;
const at = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();

const share = (id, name, overrides = {}) => ({
  id,
  status: 'active',
  expiresAt: at(3 * DAY),
  revokedAt: null,
  accessCount: 0,
  lastAccessedAt: null,
  createdAt: at(-DAY),
  fileAvailable: true,
  file: { id: `f-${id}`, name, category: 'DOCUMENT', size: 100, mimeType: 'application/pdf' },
  ...overrides,
});

const BY_STATUS = {
  active: [
    share('s1', 'plan.pdf', { accessCount: 3, lastAccessedAt: at(-2 * 60 * 60 * 1000) }),
    share('s2', 'old.pdf', { fileAvailable: false, expiresAt: null }),
  ],
  expired: [share('s3', 'gone.pdf', { status: 'expired', expiresAt: at(-2 * DAY) })],
  revoked: [share('s4', 'off.pdf', { status: 'revoked', revokedAt: at(-DAY) })],
};

const list = (shares) => ({
  data: {
    success: true,
    data: { shares },
    meta: { page: 1, pageSize: 50, total: shares.length, totalPages: 1 },
  },
});

function Page() {
  return (
    <>
      <SharedPage />
      <Toaster />
    </>
  );
}

function setup({ url = '/app/shared', byStatus = BY_STATUS, routes = {} } = {}) {
  const calls = mockApi({
    'GET /shares': (_body, params) => list(byStatus[params.status] ?? []),
    ...routes,
  });
  const { router } = renderPage('/app/shared', Page, { url, auth, guestOnly: false });
  return { calls, router };
}

/** The row around a file name (pass the name, or the element findByText returned). */
const rowOf = (nameOrElement) =>
  (typeof nameOrElement === 'string' ? screen.getByText(nameOrElement) : nameOrElement).closest(
    'li',
  );
const sharesRequests = (calls) => calls.filter((c) => c.key === 'GET /shares');

describe('Shared page', () => {
  it('starts on Active links with downloads, expiry and the trash badge', async () => {
    const { calls } = setup();

    const plan = rowOf(await screen.findByText('plan.pdf'));
    expect(screen.getByRole('tab', { name: 'Active' }).getAttribute('aria-selected')).toBe('true');
    expect(sharesRequests(calls)[0].params).toMatchObject({ status: 'active', page: 1 });

    expect(within(plan).getByText('Downloads').nextSibling.textContent).toBe('3');
    expect(within(plan).getByText('Last downloaded').nextSibling.textContent).toBe('2 hours ago');
    expect(within(plan).getByText('Expires').nextSibling.textContent).toBe('in 3 days');
    expect(within(plan).queryByText('File in trash')).toBeNull();

    const old = rowOf('old.pdf');
    expect(within(old).getByText('File in trash')).toBeTruthy();
    expect(within(old).getByText('Expires').nextSibling.textContent).toBe('Never');
    expect(within(old).getByText('Last downloaded').nextSibling.textContent).toBe('Never');
    // No new link while the file is in trash (the server would refuse), but it can be turned off.
    expect(within(old).queryByRole('button', { name: /new link/i })).toBeNull();
    expect(within(old).getByRole('button', { name: 'Stop sharing old.pdf' })).toBeTruthy();
  });

  it('switches tabs through the URL; expired and revoked links have no actions', async () => {
    const { calls, router } = setup();
    await screen.findByText('plan.pdf');

    fireEvent.click(screen.getByRole('tab', { name: 'Expired' }));

    const gone = rowOf(await screen.findByText('gone.pdf'));
    expect(router.state.location.search).toBe('?status=expired');
    expect(sharesRequests(calls).at(-1).params.status).toBe('expired');
    expect(within(gone).getByText('Expired').nextSibling.textContent).toBe('2 days ago');
    expect(within(gone).queryByRole('button')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Revoked' }));
    const off = rowOf(await screen.findByText('off.pdf'));
    expect(within(off).getByText('Turned off').nextSibling.textContent).toBe('yesterday');
    expect(within(off).queryByRole('button')).toBeNull();
  });

  it('opens the tab named in the URL, and falls back to Active for nonsense', async () => {
    setup({ url: '/app/shared?status=revoked' });
    expect(await screen.findByText('off.pdf')).toBeTruthy();
    cleanup();

    setup({ url: '/app/shared?status=bogus' });
    expect(await screen.findByText('plan.pdf')).toBeTruthy();
  });

  it('turning a link off asks first, then revokes and refreshes the list', async () => {
    const { calls } = setup({ routes: { 'DELETE /shares/s1': () => ({ status: 204, data: '' }) } });
    await screen.findByText('plan.pdf');

    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing plan.pdf' }));
    const dialog = screen.getByRole('dialog', { name: 'Stop sharing “plan.pdf”?' });
    expect(calls.some((c) => c.key === 'DELETE /shares/s1')).toBe(false); // nothing yet

    fireEvent.click(within(dialog).getByRole('button', { name: 'Turn off link' }));

    expect(await screen.findByText('Stopped sharing “plan.pdf”')).toBeTruthy();
    expect(calls.some((c) => c.key === 'DELETE /shares/s1')).toBe(true);
    await waitFor(() => expect(sharesRequests(calls)).toHaveLength(2));
  });

  it('shows a revoke error inside the dialog', async () => {
    setup({
      routes: { 'DELETE /shares/s1': () => apiError(404, 'NOT_FOUND', 'Share link not found.') },
    });
    await screen.findByText('plan.pdf');

    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing plan.pdf' }));
    fireEvent.click(screen.getByRole('button', { name: 'Turn off link' }));

    const dialog = screen.getByRole('dialog', { name: 'Stop sharing “plan.pdf”?' });
    expect(await within(dialog).findByText('Share link not found.')).toBeTruthy();
  });

  it('"New link" explains what happens, then shows the new link once', async () => {
    const url = 'http://localhost:5173/s/NewTokenNewTokenNewTokenNewTokenNewToken123';
    const { calls } = setup({
      routes: {
        'POST /shares/s1/regenerate': () => ({
          status: 201,
          data: { success: true, data: { share: share('s9', 'plan.pdf'), url } },
        }),
      },
    });
    await screen.findByText('plan.pdf');

    fireEvent.click(screen.getByRole('button', { name: 'Get a new link for plan.pdf' }));
    const dialog = screen.getByRole('dialog', { name: 'Get a new link' });
    expect(within(dialog).getByText(/stops working right away/)).toBeTruthy();
    expect(calls.some((c) => c.key === 'POST /shares/s1/regenerate')).toBe(false);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Replace link' }));

    const field = await within(dialog).findByRole('textbox', { name: 'Share link' });
    expect(field.value).toBe(url);
    expect(within(dialog).getByText(/shown only once/)).toBeTruthy();
  });

  it('has an empty state for each tab and an error state', async () => {
    setup({ byStatus: {} });
    expect(await screen.findByText('No active links')).toBeTruthy();
    cleanup();

    mockApi({ 'GET /shares': () => apiError(500, 'INTERNAL_ERROR', 'Server down.') });
    renderPage('/app/shared', SharedPage, { url: '/app/shared', auth, guestOnly: false });
    expect(await screen.findByText("Couldn't load your links")).toBeTruthy();
  });
});
