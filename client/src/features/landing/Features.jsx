import { Eye, FolderTree, Gauge, Link2, Lock, Search } from 'lucide-react';
import { SectionHeading } from './SectionHeading.jsx';

// Only what CloudDrive actually does (or is being built to do in this project).
const FEATURES = [
  {
    Icon: Lock,
    title: 'Private by default',
    text: 'Every file is private to your account. Nobody else can open it unless you share it.',
  },
  {
    Icon: FolderTree,
    title: 'Folders, as deep as you like',
    text: 'Organise with nested folders, move things around and find your way back with breadcrumbs.',
  },
  {
    Icon: Eye,
    title: 'Preview without downloading',
    text: 'Open images, PDFs, videos and audio right in the browser.',
  },
  {
    Icon: Link2,
    title: 'Share links you control',
    text: 'Create a read-only link, set it to expire, and revoke it whenever you want.',
  },
  {
    Icon: Search,
    title: 'Find anything fast',
    text: 'Search by name and filter by type - documents, images, videos, audio or archives.',
  },
  {
    Icon: Gauge,
    title: 'Know your storage',
    text: 'See how much space you use, and what kinds of files take it up.',
  },
];

export function Features() {
  return (
    <section
      id="features"
      aria-labelledby="features-title"
      className="scroll-mt-20 px-4 py-24 sm:px-6"
    >
      <SectionHeading id="features-title" eyebrow="Features" title="Everything your files need">
        A clean home for your documents, photos and videos - without the clutter.
      </SectionHeading>

      <ul className="mx-auto mt-14 grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ Icon, title, text }) => (
          <li
            key={title}
            className="group rounded-2xl border border-border bg-surface p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md dark:hover:border-brand-500/40"
          >
            <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-white dark:bg-brand-500/15 dark:text-brand-300">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <h3 className="mt-5 font-semibold">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">{text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
