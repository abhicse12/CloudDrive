import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ThemeToggle } from './components/common/ThemeToggle.jsx';
import { Logo } from './components/ui/Logo.jsx';

/**
 * TEMPORARY (step F1): confirms the frontend toolchain works and that the Vite proxy
 * reaches the API. Replaced by the router and real pages in step F2.
 */
export function App() {
  const [api, setApi] = useState({ state: 'loading' });

  useEffect(() => {
    fetch('/api/health/ready')
      .then(async (res) => setApi({ state: res.ok ? 'ok' : 'down', body: await res.json() }))
      .catch(() => setApi({ state: 'down' }));
  }, []);

  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <div className="flex items-center justify-between">
          <Logo />
          <ThemeToggle />
        </div>

        <h1 className="mt-8 text-xl font-semibold">Frontend setup check</h1>
        <p className="mt-1 text-sm text-fg-muted">React, Vite, Tailwind and the API proxy.</p>

        <div className="mt-6 flex items-center gap-3 rounded-xl bg-surface-muted p-4 text-sm">
          {api.state === 'loading' && <Loader2 className="size-5 animate-spin text-fg-subtle" />}
          {api.state === 'ok' && <CheckCircle2 className="size-5 text-success" />}
          {api.state === 'down' && <XCircle className="size-5 text-danger" />}
          <span>
            {api.state === 'loading' && 'Contacting API…'}
            {api.state === 'ok' && 'API and database reachable through the proxy'}
            {api.state === 'down' && 'API unreachable - is the backend running?'}
          </span>
        </div>

        <div className="mt-6 flex gap-2">
          {['bg-brand-600', 'bg-brand-500', 'bg-accent-600', 'bg-brand-200', 'bg-brand-50'].map(
            (color) => (
              <span key={color} className={`h-8 flex-1 rounded-lg ${color}`} title={color} />
            ),
          )}
        </div>
      </div>
    </main>
  );
}
