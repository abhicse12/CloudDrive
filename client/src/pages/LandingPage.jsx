import { ArrowRight } from 'lucide-react';
import { ButtonLink } from '../components/ui/Button.jsx';

/** TEMPORARY (step F2): hero only. The full landing page is built in step F4. */
export function LandingPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-24 text-center sm:py-32">
      <title>CloudDrive - secure cloud storage</title>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        Your files, safe and{' '}
        <span className="bg-linear-to-r from-brand-600 to-accent-600 bg-clip-text text-transparent">
          always within reach
        </span>
      </h1>
      <p className="mx-auto mt-5 max-w-xl text-fg-muted">
        Upload, organise, preview and share your files with secure links.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <ButtonLink to="/register" size="lg">
          Get started free <ArrowRight className="size-4" aria-hidden="true" />
        </ButtonLink>
        <ButtonLink to="/login" variant="secondary" size="lg">
          Log in
        </ButtonLink>
      </div>
    </section>
  );
}
