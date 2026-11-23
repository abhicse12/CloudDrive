import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Toaster } from '../components/ui/Toaster.jsx';
import { resetToasts } from '../components/ui/toast.js';
import { formatDay } from '../features/admin/adminFormat.js';
import { describeActivity } from '../features/dashboard/describeActivity.js';
import { apiError, mockApi, renderPage } from '../test-utils/renderWithApp.jsx';
import { AdminPage } from './AdminPage.jsx';

afterEach(() => {
  act(() => resetToasts());
  cleanup();
});

const GIB = 1024 ** 3;
const ME = { id: 'admin-1', name: 'Root', email: 'root@x.com', role: 'ADMIN' };
const auth = { user: ME, status: 'authenticated' };
const ok = (data, meta) => ({ data: { success: true, data, ...(meta && { meta }) } });

const user = (id, name, overrides = {}) => ({
  id,
  name,
  email: `${name.toLowerCase()}@x.com`,
  role: 'USER',
  status: 'ACTIVE',
  storageUsed: GIB / 2,
  storageLimit: 5 * GIB,
  fileCount: 4,
  createdAt: '2026-11-01T10:00:00.000Z',
  ...overrides,
});
const ALICE = user('u-alice', 'Alice');
const ROOT = user(ME.id, 'Root', { email: ME.email, role: 'ADMIN' });

const days = Array.from({ length: 30 }, (_, i) => ({
  date: `2026-10-${String(i + 1).padStart(2, '0')}`, // Oct 1 … Oct 30
  count: i === 29 ? 4 : i === 10 ? 2 : 0,
}));

const STATS = {
  users: { total: 12, active: 11, suspended: 1, admins: 2 },
  files: { count: 340, bytes: 3 * GIB },
  storage: { used: 4 * GIB, allocated: 60 * GIB },
  activeShares: 7,
  signups: { days, total: 6 },
  byCategory: [
    { category: 'IMAGE', count: 200, bytes: 2 * GIB },
    { category: 'VIDEO', count: 0, bytes: 0 },
    { category: 'AUDIO', count: 0, bytes: 0 },
    { category: 'DOCUMENT', count: 140, bytes: GIB },
    { category: 'ARCHIVE', count: 0, bytes: 0 },
    { category: 'OTHER', count: 0, bytes: 0 },
  ],
  topUsers: [ALICE],
};

function Page() {
  return (
    <>
      <AdminPage />
      <Toaster />
    </>
  );
}

function setup({ routes = {}, users = [ROOT, ALICE], totalPages = 1, url = '/app/admin' } = {}) {
  const calls = mockApi({
    'GET /admin/stats': () => ok(STATS),
    'GET /admin/users': (_body, params) =>
      ok(
        { users },
        { page: params.page, pageSize: 20, total: users.length * totalPages, totalPages },
      ),
    ...routes,
  });
  const { router } = renderPage('/app/admin', Page, { url, auth, guestOnly: false });
  return { calls, router };
}

const usersRequests = (calls) => calls.filter((c) => c.key === 'GET /admin/users');
const rowOf = (name) => screen.getAllByText(name).at(-1).closest('tr');

async function openEdit(name) {
  fireEvent.click(await screen.findByRole('button', { name: `Edit ${name}` }));
  return screen.getByRole('dialog', { name: `Edit ${name}` });
}

describe('admin overview', () => {
  it('shows the totals, sign-ups, storage by type and top users', async () => {
    setup();

    const totals = await screen.findByRole('list', { name: 'Totals' });
    expect(within(totals).getByText('12')).toBeTruthy();
    expect(within(totals).getByText('11 active · 1 suspended')).toBeTruthy();
    expect(within(totals).getByText('4 GB')).toBeTruthy();
    expect(within(totals).getByText('of 60 GB allocated')).toBeTruthy();

    expect(screen.getByText('6 total')).toBeTruthy();
    // The busiest day fills the chart's height; empty days have no bar height.
    const bars = screen.getAllByTestId('signup-bar');
    expect(bars).toHaveLength(30);
    expect(bars.at(-1).style.height).toBe('100%');
    expect(bars[10].style.height).toBe('50%');
    expect(bars[0].style.height).toBe('0px');

    const types = screen.getByRole('region', { name: 'Storage by type' });
    expect(within(types).getByText('Images')).toBeTruthy();
    expect(within(types).getByText('200 files')).toBeTruthy();

    const top = screen.getByRole('region', { name: 'Top users by storage' });
    expect(within(top).getByText('alice@x.com')).toBeTruthy();
  });

  it('gives screen readers the sign-ups as a table', async () => {
    setup();
    const table = await screen.findByRole('table', { name: 'Sign-ups per day, last 30 days' });
    expect(within(table).getAllByRole('row')).toHaveLength(31); // header + 30 days
  });

  it('shows the hovered day in words', async () => {
    setup();
    const bars = await screen.findAllByTestId('signup-bar');

    fireEvent.mouseEnter(bars.at(-1).parentElement);

    // The day is in the viewer's own date format ("Oct 30" or "30 Oct").
    expect(screen.getByText(`${formatDay('2026-10-30')}: 4 sign-ups`)).toBeTruthy();
  });
});

describe('users table', () => {
  it('asks for page 1, newest first, and marks the signed-in admin', async () => {
    const { calls } = setup();
    await screen.findByRole('button', { name: 'Edit Alice' });

    expect(usersRequests(calls)[0].params).toEqual({
      sortBy: 'createdAt',
      sortOrder: 'desc',
      page: 1,
      pageSize: 20,
    });
    expect(within(rowOf('Root')).getByText('(you)')).toBeTruthy();
    expect(within(rowOf('Alice')).getByText('512 MB')).toBeTruthy();
  });

  it('filters, sorts and searches through the URL (search waits for typing to pause)', async () => {
    const { calls, router } = setup();
    await screen.findByRole('button', { name: 'Edit Alice' });

    fireEvent.change(screen.getByRole('combobox', { name: 'Role' }), {
      target: { value: 'ADMIN' },
    });
    await waitFor(() => expect(usersRequests(calls).at(-1).params.role).toBe('ADMIN'));

    fireEvent.change(screen.getByRole('combobox', { name: 'Sort' }), {
      target: { value: 'storage' },
    });
    await waitFor(() =>
      expect(usersRequests(calls).at(-1).params).toMatchObject({
        sortBy: 'storageUsed',
        sortOrder: 'desc',
      }),
    );

    const before = usersRequests(calls).length;
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search users' }), {
      target: { value: 'ali' },
    });
    expect(usersRequests(calls)).toHaveLength(before); // not on every keystroke
    await waitFor(() => expect(usersRequests(calls).at(-1).params.q).toBe('ali'));
    expect(router.state.location.search).toBe('?role=ADMIN&sort=storage&q=ali');
  });

  it('pages with Previous / Next, and a filter change goes back to page 1', async () => {
    const { calls, router } = setup({ totalPages: 3 });
    await screen.findByText(/Page 1 of 3/);

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(usersRequests(calls).at(-1).params.page).toBe(2));
    expect(router.state.location.search).toBe('?page=2');

    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
      target: { value: 'SUSPENDED' },
    });
    await waitFor(() => expect(router.state.location.search).toBe('?status=SUSPENDED'));
    expect(usersRequests(calls).at(-1).params.page).toBe(1);
  });
});

describe('editing a user', () => {
  it('sends only what changed, with the limit converted from GB to bytes', async () => {
    const { calls } = setup({
      routes: { 'PATCH /admin/users/u-alice': () => ok({ user: ALICE }) },
    });
    const dialog = await openEdit('Alice');

    expect(within(dialog).getByText('In use: 512 MB')).toBeTruthy();
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Role' }), {
      target: { value: 'ADMIN' },
    });
    fireEvent.change(within(dialog).getByRole('spinbutton', { name: 'Storage limit (GB)' }), {
      target: { value: '2.5' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Updated Alice')).toBeTruthy();
    expect(calls.find((c) => c.key === 'PATCH /admin/users/u-alice').body).toEqual({
      role: 'ADMIN',
      storageLimit: 2.5 * GIB,
    });
  });

  it('sends nothing when nothing changed', async () => {
    const { calls } = setup();
    const dialog = await openEdit('Alice');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit Alice' })).toBeNull());
    expect(calls.some((c) => c.key.startsWith('PATCH'))).toBe(false);
  });

  it('admins editing themselves can change only their limit', async () => {
    const { calls } = setup({
      routes: { [`PATCH /admin/users/${ME.id}`]: () => ok({ user: ROOT }) },
    });
    const dialog = await openEdit('Root');

    expect(within(dialog).getByRole('combobox', { name: 'Role' }).disabled).toBe(true);
    expect(within(dialog).getByRole('combobox', { name: 'Status' }).disabled).toBe(true);
    expect(within(dialog).getByText("You can't change your own role or status.")).toBeTruthy();

    fireEvent.change(within(dialog).getByRole('spinbutton', { name: 'Storage limit (GB)' }), {
      target: { value: '10' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await screen.findByText('Updated Root');
    expect(calls.find((c) => c.key === `PATCH /admin/users/${ME.id}`).body).toEqual({
      storageLimit: 10 * GIB,
    });
  });

  it('puts "limit below usage" on the limit field', async () => {
    setup({
      routes: {
        'PATCH /admin/users/u-alice': () =>
          apiError(
            409,
            'LIMIT_BELOW_USAGE',
            'The storage limit cannot be lower than what this user already stores.',
          ),
      },
    });
    const dialog = await openEdit('Alice');
    const field = within(dialog).getByRole('spinbutton', { name: 'Storage limit (GB)' });

    fireEvent.change(field, { target: { value: '0.1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(await within(dialog).findByText(/cannot be lower than what this user/)).toBeTruthy();
    await waitFor(() => expect(field.getAttribute('aria-invalid')).toBe('true'));
  });

  it('shows "last admin" as a message for the whole form', async () => {
    setup({
      users: [ROOT, user('u-bob', 'Bob', { role: 'ADMIN' })],
      routes: {
        'PATCH /admin/users/u-bob': () =>
          apiError(
            409,
            'LAST_ADMIN',
            'This is the last active admin. Make someone else an admin first.',
          ),
      },
    });
    const dialog = await openEdit('Bob');

    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Role' }), {
      target: { value: 'USER' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(await within(dialog).findByText(/last active admin/)).toBeTruthy();
  });

  it('rejects an empty or negative limit before sending', async () => {
    const { calls } = setup();
    const dialog = await openEdit('Alice');
    const field = within(dialog).getByRole('spinbutton', { name: 'Storage limit (GB)' });

    fireEvent.change(field, { target: { value: '' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(await within(dialog).findByText('Enter a size in GB.')).toBeTruthy();

    fireEvent.change(field, { target: { value: '-1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(await within(dialog).findByText('The limit cannot be negative.')).toBeTruthy();
    expect(calls.some((c) => c.key.startsWith('PATCH'))).toBe(false);
  });
});

describe('activity feed entry for admin changes', () => {
  it('describes what was changed', () => {
    const { text } = describeActivity({
      action: 'ADMIN_USER_UPDATED',
      metadata: {
        name: 'Alice',
        changes: {
          role: { from: 'USER', to: 'ADMIN' },
          status: { from: 'ACTIVE', to: 'SUSPENDED' },
          storageLimit: { from: 5 * GIB, to: 10 * GIB },
        },
      },
    });
    expect(text).toBe('Updated Alice: made admin, suspended, limit set to 10 GB');
  });
});
