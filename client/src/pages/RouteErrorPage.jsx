import { useRouteError } from 'react-router';
import { Button } from '../components/ui/Button.jsx';

/**
 * Shown when rendering or loading a page crashes, instead of a blank white screen.
 * The most common cause in production: a new version was deployed and an old tab
 * asks for a page file that no longer exists. Reloading fixes exactly that.
 */
export function RouteErrorPage() {
  const error = useRouteError();
  if (import.meta.env.DEV) console.error(error);

  return (
    <main className="grid min-h-dvh place-items-center px-4 text-center">
      <title>Something went wrong · CloudDrive</title>
      <div className="max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-2 text-fg-muted">
          An unexpected error occurred. Reloading the page usually fixes it.
        </p>
        <Button className="mt-6" onClick={() => window.location.reload()}>
          Reload page
        </Button>
      </div>
    </main>
  );
}
