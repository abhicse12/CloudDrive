import { CloudUpload, Share2, UserPlus } from 'lucide-react';
import { SectionHeading } from './SectionHeading.jsx';

const STEPS = [
  {
    Icon: UserPlus,
    title: 'Create your account',
    text: 'Sign up with your email in under a minute. 5 GB is yours, free.',
  },
  {
    Icon: CloudUpload,
    title: 'Upload and organise',
    text: 'Drag files in, watch the progress, and sort them into folders.',
  },
  {
    Icon: Share2,
    title: 'Share on your terms',
    text: 'Send a link that expires when you decide - or switch it off any time.',
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-title"
      className="scroll-mt-20 border-y border-border bg-surface px-4 py-24 sm:px-6"
    >
      <SectionHeading id="how-title" eyebrow="How it works" title="Up and running in minutes" />

      <ol className="mx-auto mt-14 grid max-w-5xl gap-10 md:grid-cols-3 md:gap-6">
        {STEPS.map(({ Icon, title, text }, index) => (
          <li key={title} className="relative text-center">
            {/* Connector line between steps (desktop only) */}
            {index < STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute top-7 left-[calc(50%+2.5rem)] hidden h-px w-[calc(100%-5rem)] bg-linear-to-r from-brand-300 to-transparent md:block dark:from-brand-500/40"
              />
            )}
            <span className="relative mx-auto grid size-14 place-items-center rounded-2xl bg-linear-to-br from-brand-600 to-accent-600 text-white shadow-lg shadow-brand-600/25">
              <Icon className="size-6" aria-hidden="true" />
            </span>
            <p className="mt-5 text-xs font-semibold tracking-wider text-fg-subtle uppercase">
              Step {index + 1}
            </p>
            <h3 className="mt-1 font-semibold">{title}</h3>
            <p className="mx-auto mt-2 max-w-xs text-sm text-fg-muted">{text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
