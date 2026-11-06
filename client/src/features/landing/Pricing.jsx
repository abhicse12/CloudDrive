import { Check } from 'lucide-react';
import { useSelector } from 'react-redux';
import { ButtonLink } from '../../components/ui/Button.jsx';
import { buttonClasses } from '../../components/ui/buttonClasses.js';
import { selectAuthStatus } from '../auth/authSlice.js';
import { SectionHeading } from './SectionHeading.jsx';

/*
 * Storage plans. There are no payments in this project, so only Free can be chosen;
 * paid plans are shown as "Coming soon" rather than with buttons that lead nowhere.
 */
const PLANS = [
  {
    name: 'Free',
    price: '₹0',
    period: 'forever',
    storage: '5 GB',
    description: 'For personal files and trying CloudDrive out.',
    features: [
      '5 GB storage',
      'Folders, search & previews',
      'Expiring share links',
      'Trash with restore',
    ],
    available: true,
  },
  {
    name: 'Pro',
    price: '₹149',
    period: 'per month',
    storage: '200 GB',
    description: 'For people whose files outgrew their laptop.',
    features: ['200 GB storage', 'Everything in Free', 'Larger uploads', 'Priority support'],
    highlighted: true,
  },
  {
    name: 'Team',
    price: '₹399',
    period: 'per user / month',
    storage: '1 TB',
    description: 'For small teams that share work every day.',
    features: ['1 TB per user', 'Everything in Pro', 'Shared team folders', 'Admin controls'],
  },
];

const disabledButton = buttonClasses({
  variant: 'secondary',
  className: 'mt-8 w-full cursor-default opacity-70',
});

export function Pricing() {
  const loggedIn = useSelector(selectAuthStatus) === 'authenticated';

  return (
    <section
      id="pricing"
      aria-labelledby="pricing-title"
      className="scroll-mt-20 px-4 py-24 sm:px-6"
    >
      <SectionHeading
        id="pricing-title"
        eyebrow="Pricing"
        title="Start free, grow when you need to"
      >
        Every account starts with 5 GB. Paid plans are on the way.
      </SectionHeading>

      <ul className="mx-auto mt-14 grid max-w-5xl gap-4 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <li
            key={plan.name}
            className={`relative flex flex-col rounded-2xl border p-7 ${
              plan.highlighted
                ? 'border-brand-500 bg-surface shadow-xl shadow-brand-600/10 ring-1 ring-brand-500'
                : 'border-border bg-surface shadow-sm'
            }`}
          >
            {plan.highlighted && (
              <span className="absolute -top-3 left-7 rounded-full bg-linear-to-r from-brand-600 to-accent-600 px-3 py-1 text-xs font-semibold text-white">
                Most popular
              </span>
            )}
            <h3 className="font-semibold">{plan.name}</h3>
            <p className="mt-1 text-sm text-fg-muted">{plan.description}</p>
            <p className="mt-6 flex items-baseline gap-1.5">
              <span className="text-4xl font-semibold tracking-tight">{plan.price}</span>
              <span className="text-sm text-fg-muted">{plan.period}</span>
            </p>

            <ul className="mt-6 flex-1 space-y-3 text-sm">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden="true" />
                  {feature}
                </li>
              ))}
            </ul>

            {plan.available && !loggedIn && (
              <ButtonLink to="/register" className="mt-8 w-full">
                Get started free
              </ButtonLink>
            )}
            {plan.available && loggedIn && (
              // Every account is on Free for now, so this is the logged-in user's plan.
              <span className={disabledButton}>Your current plan</span>
            )}
            {!plan.available && (
              <span aria-disabled="true" className={disabledButton}>
                Coming soon
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
