import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { ShareLinkField } from './ShareLinkField.jsx';
import { DEFAULT_SHARE_EXPIRY, SHARE_EXPIRY_OPTIONS, useCreateShareMutation } from './sharesApi.js';

/**
 * Share one file. Two steps in one dialog: pick how long the link lives → see the link
 * (once) and copy it. file: { id, name } or null (closed).
 */
export function ShareDialog({ file, onClose }) {
  const [creating, setCreating] = useState(false);
  return (
    <Dialog
      open={Boolean(file)}
      onClose={onClose}
      title="Share link"
      description={file ? `Anyone with the link can download “${file.name}”.` : undefined}
      // Don't let Esc throw away a link that is being created right now.
      dismissible={!creating}
    >
      {file && <ShareForm file={file} onDone={onClose} onBusyChange={setCreating} />}
    </Dialog>
  );
}

function ShareForm({ file, onDone, onBusyChange }) {
  const [createShare, { isLoading }] = useCreateShareMutation();
  const [expiresIn, setExpiresIn] = useState(DEFAULT_SHARE_EXPIRY);
  const [created, setCreated] = useState(null); // { share, url }
  const [error, setError] = useState(null);

  async function onSubmit(event) {
    event.preventDefault();
    setError(null);
    onBusyChange(true);
    try {
      setCreated(await createShare({ fileId: file.id, expiresIn }).unwrap());
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      onBusyChange(false);
    }
  }

  if (created) {
    return (
      <div className="space-y-6">
        <ShareLinkField url={created.url} expiresAt={created.share.expiresAt} />
        <div className="flex justify-end">
          <Button onClick={onDone}>Done</Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error && <Alert>{error}</Alert>}
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Link expires after</legend>
        <div className="flex flex-wrap gap-2">
          {SHARE_EXPIRY_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-sm has-checked:border-brand-500 has-checked:bg-brand-50 has-checked:text-brand-700 has-focus-visible:ring-2 has-focus-visible:ring-brand-500/30 dark:has-checked:bg-brand-500/10 dark:has-checked:text-brand-300"
            >
              <input
                type="radio"
                name="expiresIn"
                value={option.value}
                checked={expiresIn === option.value}
                onChange={() => setExpiresIn(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone} disabled={isLoading}>
          Cancel
        </Button>
        <Button type="submit" loading={isLoading}>
          Create link
        </Button>
      </div>
    </form>
  );
}
