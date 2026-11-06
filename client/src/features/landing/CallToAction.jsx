import { ArrowRight } from 'lucide-react';
import { useSelector } from 'react-redux';
import { ButtonLink } from '../../components/ui/Button.jsx';
import { selectAuthStatus } from '../auth/authSlice.js';

export function CallToAction() {
  const loggedIn = useSelector(selectAuthStatus) === 'authenticated';

  return (
    <section className="px-4 py-24 sm:px-6">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-linear-to-br from-brand-700 via-brand-600 to-accent-600 px-6 py-16 text-center text-white sm:px-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 -right-20 size-72 rounded-full bg-white/10 blur-3xl"
        />
        <h2 className="relative text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Give your files a better home
        </h2>
        <p className="relative mx-auto mt-4 max-w-lg text-white/75">
          Create your account and get 5 GB of private storage - no card required.
        </p>
        <ButtonLink
          to={loggedIn ? '/app' : '/register'}
          size="lg"
          className="relative mt-8 bg-white! text-brand-700! hover:bg-brand-50!"
        >
          {loggedIn ? 'Open your drive' : 'Get started free'}
          <ArrowRight className="size-4" aria-hidden="true" />
        </ButtonLink>
      </div>
    </section>
  );
}
