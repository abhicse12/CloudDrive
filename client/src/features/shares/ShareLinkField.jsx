import { Check, Copy } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { formatExpiry } from './shareFormat.js';

/**
 * A just-created share link, with Copy. Used by the share dialog and by "Regenerate" on
 * the Shared page. The token can't be fetched again, so the text says so plainly.
 */
export function ShareLinkField({ url, expiresAt }) {
  const inputRef = useRef(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // No clipboard permission (or an old browser): select the text so Ctrl+C works.
      inputRef.current?.select();
    }
  }

  return (
    <div>
      <label htmlFor="share-link" className="mb-1.5 block text-sm font-medium">
        Share link
      </label>
      <div className="flex gap-2">
        <input
          id="share-link"
          ref={inputRef}
          readOnly
          value={url}
          onFocus={(event) => event.target.select()}
          className="block h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface-muted px-3 font-mono text-xs text-fg"
        />
        <Button variant="secondary" onClick={copy} aria-live="polite">
          {copied ? (
            <Check className="size-4 text-success" aria-hidden="true" />
          ) : (
            <Copy className="size-4" aria-hidden="true" />
          )}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <p className="mt-2 text-xs text-fg-subtle">{formatExpiry(expiresAt)}</p>
      <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 dark:bg-brand-500/10 text-xs text-fg-muted">
        Copy it now: for your security, this link is shown only once. Anyone with it can download
        the file. You can stop it any time on the Shared page.
      </p>
    </div>
  );
}
