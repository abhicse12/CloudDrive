import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { ShareLinkField } from './ShareLinkField.jsx';
import { useRegenerateShareMutation } from './sharesApi.js';

/**
 * "The old link leaked": explain → replace it → show the new link once.
 * share: a share DTO or null (closed).
 */
export function RegenerateDialog({ share, onClose }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={Boolean(share)}
      onClose={onClose}
      title="Get a new link"
      description={share ? `For “${share.file.name}”` : undefined}
      dismissible={!busy}
    >
      {share && <RegenerateBody share={share} onDone={onClose} onBusyChange={setBusy} />}
    </Dialog>
  );
}

function RegenerateBody({ share, onDone, onBusyChange }) {
  const [regenerate, { isLoading }] = useRegenerateShareMutation();
  const [result, setResult] = useState(null); // { share, url }
  const [error, setError] = useState(null);

  async function run() {
    setError(null);
    onBusyChange(true);
    try {
      setResult(await regenerate(share.id).unwrap());
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      onBusyChange(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-6">
        <ShareLinkField url={result.url} expiresAt={result.share.expiresAt} />
        <div className="flex justify-end">
          <Button onClick={onDone}>Done</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && <Alert>{error}</Alert>}
      <p className="text-sm text-fg-muted">
        The current link stops working right away, for everyone who has it. You get a new link with
        the same expiry date to share again.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone} disabled={isLoading}>
          Cancel
        </Button>
        <Button onClick={run} loading={isLoading}>
          Replace link
        </Button>
      </div>
    </div>
  );
}
