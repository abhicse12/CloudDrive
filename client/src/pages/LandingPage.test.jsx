import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { mockApi, renderPage } from '../test-utils/renderWithApp.jsx';
import { LandingPage } from './LandingPage.jsx';

afterEach(cleanup);

describe('LandingPage', () => {
  it('renders every section with a heading screen readers can jump to', () => {
    mockApi({});
    renderPage('/', LandingPage, { guestOnly: false });

    for (const name of [
      'Everything your files need',
      'Up and running in minutes',
      'Start free, grow when you need to',
      'Questions, answered',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeTruthy();
    }
  });

  it('lets guests sign up from the hero and the Free plan', () => {
    mockApi({});
    renderPage('/', LandingPage, { guestOnly: false });

    const signUpLinks = screen.getAllByRole('link', { name: /get started free/i });
    expect(signUpLinks.length).toBeGreaterThanOrEqual(2);
    signUpLinks.forEach((link) => expect(link.getAttribute('href')).toBe('/register'));
  });

  it('shows paid plans as "Coming soon", not as links that lead nowhere', () => {
    mockApi({});
    renderPage('/', LandingPage, { guestOnly: false });

    const pricing = screen.getByRole('heading', { name: /start free/i }).closest('section');
    expect(within(pricing).getAllByText('Coming soon')).toHaveLength(2);
    expect(within(pricing).queryByRole('link', { name: 'Coming soon' })).toBeNull();
  });

  it('offers "Open your drive" instead of sign-up to logged-in users', () => {
    mockApi({});
    renderPage('/', LandingPage, {
      guestOnly: false,
      auth: { user: { id: '1', name: 'A', role: 'USER' }, status: 'authenticated' },
    });

    expect(screen.queryByRole('link', { name: /get started free/i })).toBeNull();
    expect(screen.getByText('Your current plan')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /open your drive/i })[0].getAttribute('href')).toBe(
      '/app',
    );
  });
});
