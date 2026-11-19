import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { SearchBox } from './SearchBox.jsx';

afterEach(cleanup);

function setup(url = '/app') {
  const router = createMemoryRouter(
    [
      { path: '/app', element: <SearchBox /> },
      { path: '/app/files/:folderId?', element: <SearchBox /> },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />);
  const input = () => screen.getByRole('searchbox', { name: 'Search your files' });
  return { router, input };
}

const location = (router) => router.state.location.pathname + router.state.location.search;

describe('SearchBox', () => {
  it('searches every folder on Enter, from any page', () => {
    const { router, input } = setup('/app');

    fireEvent.change(input(), { target: { value: '  q3 report ' } });
    fireEvent.submit(input().form);

    expect(location(router)).toBe('/app/files?q=q3%20report');
  });

  it('shows the current search on the Files page and follows URL changes', async () => {
    const { router, input } = setup('/app/files?q=invoice');
    expect(input().value).toBe('invoice');

    await act(() => router.navigate('/app/files'));

    expect(input().value).toBe('');
  });

  it('clearing returns to browsing; an empty search does too', () => {
    const { router, input } = setup('/app/files?q=invoice');

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(location(router)).toBe('/app/files');

    fireEvent.change(input(), { target: { value: '   ' } });
    fireEvent.submit(input().form);
    expect(location(router)).toBe('/app/files');
  });
});
