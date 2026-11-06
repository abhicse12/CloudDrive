import { ChevronDown } from 'lucide-react';
import { SectionHeading } from './SectionHeading.jsx';

const QUESTIONS = [
  {
    q: 'Who can see my files?',
    a: 'Only you. Files are private to your account. Someone else can open a file only through a share link you created, and only until it expires or you revoke it.',
  },
  {
    q: 'What happens when my 5 GB is full?',
    a: 'New uploads are paused with a clear message - nothing you already stored is touched. Free up space by permanently deleting files from the trash.',
  },
  {
    q: 'Can I share with people who don’t have an account?',
    a: 'Yes. Anyone with the link can view and download that one file - never the rest of your drive. Links are read-only.',
  },
  {
    q: 'What if I delete something by mistake?',
    a: 'Deleted files go to the trash first. Restore them with one click within 30 days, after which they are removed for good.',
  },
  {
    q: 'Which file types can I preview?',
    a: 'Images, PDFs, videos, audio and plain text open right in the browser. Any other file can still be stored and downloaded.',
  },
  {
    q: 'What if I forget my password?',
    a: 'Use “Forgot password?” on the login page. We email you a link that works once and expires after 30 minutes; using it logs you out everywhere else.',
  },
];

export function Faq() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-title"
      className="scroll-mt-20 border-t border-border bg-surface px-4 py-24 sm:px-6"
    >
      <SectionHeading id="faq-title" eyebrow="FAQ" title="Questions, answered" />

      <div className="mx-auto mt-12 max-w-3xl divide-y divide-border rounded-2xl border border-border bg-canvas">
        {QUESTIONS.map(({ q, a }) => (
          // <details> opens and closes natively: no JavaScript, keyboard and screen-reader friendly.
          <details key={q} className="group px-6 py-1 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium">
              {q}
              <ChevronDown
                className="size-4 shrink-0 text-fg-subtle transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <p className="pb-5 text-sm leading-relaxed text-fg-muted">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
