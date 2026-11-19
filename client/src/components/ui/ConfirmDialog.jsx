import { Alert } from './Alert.jsx';
import { Button } from './Button.jsx';
import { Dialog } from './Dialog.jsx';

/**
 * "Are you sure?" for actions that can't be undone (delete forever, empty trash).
 * While `loading`, it can't be dismissed and the buttons are disabled, so the user
 * can't close it half-way or click twice. An `error` is shown inside the dialog.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  danger = false,
  loading = false,
  error,
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      dismissible={!loading}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {error && <Alert>{error}</Alert>}
    </Dialog>
  );
}
