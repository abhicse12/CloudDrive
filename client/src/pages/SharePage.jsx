import { Download, ExternalLink, LinkIcon } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ThemeToggle } from '../components/common/ThemeToggle.jsx';
import { FileIcon } from '../components/files/FileIcon.jsx';
import { categoryLook } from '../components/files/fileCategories.js';
import { buttonClasses } from '../components/ui/buttonClasses.js';
import { Logo } from '../components/ui/Logo.jsx';
import { Spinner } from '../components/ui/Spinner.jsx';
import { formatExpiry } from '../features/shares/shareFormat.js';
import { publicDownloadUrl, useGetPublicShareQuery } from '../features/shares/sharesApi.js';
import { formatBytes } from '../utils/format.js';

/**
 * Public page for a share link: /s/<token>. Works for everyone, logged in or not.
 *
 * Privacy rules for this page:
 * - The token is in the URL, so no Referer may ever carry it to another site.
 * - It only LOADS the file's description, which isn't counted. The bytes are fetched
 *   only when the visitor clicks Download or Open (each counts as a download), so
 *   there is deliberately no embedded preview.
 * - Every broken link (unknown, expired, revoked, ...) shows the same message, like the API.
 */
export function SharePage() {
  const { token } = useParams();
  const { data, error, isLoading } = useGetPublicShareQuery(token);

  return (
    <div className="flex min-h-dvh flex-col bg-surface-muted/40">
      {/* React 19 moves these into <head>. */}
      <title>{data ? `${data.share.fileName} · CloudDrive` : 'Shared file · CloudDrive'}</title>
      <meta name="referrer" content="no-referrer" />
      <meta name="robots" content="noindex, nofollow" />

      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <Link to="/" aria-label="CloudDrive home">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>

      <main className="grid flex-1 place-items-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
          {isLoading ? (
            <Spinner className="mx-auto size-6" label="Loading shared file" />
          ) : error ? (
            <Unavailable error={error} />
          ) : (
            <SharedFile token={token} share={data.share} />
          )}
        </div>
      </main>

      <footer className="px-4 pb-8 text-center text-xs text-fg-subtle">
        Shared with{' '}
        <Link to="/" className="font-medium text-fg-muted hover:text-fg">
          CloudDrive
        </Link>{' '}
        · private cloud storage
      </footer>
    </div>
  );
}

function SharedFile({ token, share }) {
  return (
    <>
      <FileIcon category={share.category} size="lg" className="mx-auto" />
      <h1 className="mt-5 text-lg font-semibold tracking-tight wrap-break-word">
        {share.fileName}
      </h1>
      <p className="mt-1 text-sm text-fg-muted">
        {formatBytes(share.size)} · {categoryLook(share.category).singular}
      </p>
      <p className="mt-1 text-xs text-fg-subtle">{formatExpiry(share.expiresAt)}</p>

      <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
        {/* Plain links: the API answers with a redirect to the file itself. */}
        <a href={publicDownloadUrl(token)} className={buttonClasses({ size: 'lg' })}>
          <Download className="size-5" aria-hidden="true" />
          Download
        </a>
        {share.canPreview && (
          <a
            href={publicDownloadUrl(token, { inline: true })}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses({ variant: 'secondary', size: 'lg' })}
          >
            <ExternalLink className="size-5" aria-hidden="true" />
            Open
          </a>
        )}
      </div>
    </>
  );
}

function Unavailable({ error }) {
  const rateLimited = error.status === 429;
  return (
    <div role="alert">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-surface-muted text-fg-subtle">
        <LinkIcon className="size-6" aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-lg font-semibold tracking-tight">
        {rateLimited ? 'Too many requests' : 'This link isn’t available'}
      </h1>
      <p className="mt-2 text-sm text-fg-muted">
        {rateLimited
          ? 'Please wait a minute and try again.'
          : 'It may have expired or been turned off by the person who shared it. Ask them for a new link.'}
      </p>
    </div>
  );
}
