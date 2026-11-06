import { ArrowRight, ShieldCheck } from 'lucide-react';
import { useSelector } from 'react-redux';
import { ButtonLink } from '../../components/ui/Button.jsx';
import { selectAuthStatus } from '../auth/authSlice.js';
import { ProductPreview } from './ProductPreview.jsx';

export function Hero() {
  const loggedIn = useSelector(selectAuthStatus) === 'authenticated';

  return (
    <section className="relative overflow-hidden">
      {/* Soft brand glow behind the headline */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-[36rem] max-w-4xl rounded-full bg-linear-to-br from-brand-400/25 via-accent-500/15 to-transparent blur-3xl"
      />

      <div className="relative mx-auto max-w-6xl px-4 pt-20 pb-16 text-center sm:px-6 sm:pt-28">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/70 px-3 py-1 text-xs font-medium text-fg-muted backdrop-blur">
          <ShieldCheck className="size-3.5 text-brand-600" aria-hidden="true" />
          Private by default · 5 GB free
        </span>

        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          Your files, safe and{' '}
          <span className="bg-linear-to-r from-brand-600 to-accent-600 bg-clip-text text-transparent">
            always within reach
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-base text-pretty text-fg-muted sm:text-lg">
          Upload, organise and preview everything in one place - then share exactly what you choose,
          with links you control.
        </p>

        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          {loggedIn ? (
            <ButtonLink to="/app" size="lg">
              Open your drive <ArrowRight className="size-4" aria-hidden="true" />
            </ButtonLink>
          ) : (
            <>
              <ButtonLink to="/register" size="lg">
                Get started free <ArrowRight className="size-4" aria-hidden="true" />
              </ButtonLink>
              <ButtonLink to="/login" variant="secondary" size="lg">
                Log in
              </ButtonLink>
            </>
          )}
        </div>

        <div className="mt-16 sm:mt-20">
          <ProductPreview />
        </div>
      </div>
    </section>
  );
}
