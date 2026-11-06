import { ButtonLink } from '../components/ui/Button.jsx';
import { Logo } from '../components/ui/Logo.jsx';

export function NotFoundPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 text-center">
      <title>Page not found · CloudDrive</title>
      <div>
        <Logo showText={false} />
        <p className="mt-6 text-sm font-semibold text-brand-600">404</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 text-fg-muted">
          The page you're looking for doesn't exist or was moved.
        </p>
        <ButtonLink to="/" className="mt-6">
          Back to home
        </ButtonLink>
      </div>
    </main>
  );
}
