import { useLocation } from 'react-router';

const TITLES = {
  '/login': 'Log in',
  '/register': 'Create your account',
  '/forgot-password': 'Forgot your password?',
  '/reset-password': 'Choose a new password',
};

/** TEMPORARY (step F2): lets the auth routes and layout render. Real forms arrive in F3. */
export function AuthPlaceholderPage() {
  const { pathname } = useLocation();
  return (
    <div>
      <h1 className="text-2xl font-semibold">{TITLES[pathname]}</h1>
      <p className="mt-2 text-sm text-fg-muted">This form is built in the next step (F3).</p>
    </div>
  );
}
