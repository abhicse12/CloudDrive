import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { toast } from '../../components/ui/toast.js';
import { applyApiError } from '../../utils/formErrors.js';
import { useUpdateFileMutation, useUpdateFolderMutation } from './filesApi.js';
import { nameFormSchema } from './schemas.js';
import { useNameField } from './useNameField.js';

/** item: { kind: 'file' | 'folder', id, name } or null (closed). */
export function RenameDialog({ item, onClose }) {
  return (
    <Dialog open={Boolean(item)} onClose={onClose} title="Rename">
      {item && <RenameForm item={item} onDone={onClose} />}
    </Dialog>
  );
}

function RenameForm({ item, onDone }) {
  const [updateFile] = useUpdateFileMutation();
  const [updateFolder] = useUpdateFolderMutation();
  const [formError, setFormError] = useState(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(nameFormSchema), defaultValues: { name: item.name } });
  const nameField = useNameField(register, { keepExtension: item.kind === 'file' });

  async function onSubmit({ name }) {
    if (name === item.name) return onDone();
    setFormError(null);
    try {
      const update = item.kind === 'file' ? updateFile : updateFolder;
      await update({ id: item.id, name }).unwrap();
      toast.success(`Renamed to “${name}”`);
      onDone();
    } catch (apiError) {
      setFormError(applyApiError(apiError, setError, { fields: ['name'] }));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {formError && <Alert>{formError}</Alert>}
      <Input label="Name" error={errors.name?.message} {...nameField} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Rename
        </Button>
      </div>
    </form>
  );
}
