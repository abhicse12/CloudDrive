import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { toast } from '../../components/ui/toast.js';
import { applyApiError } from '../../utils/formErrors.js';
import { useCreateFolderMutation } from './filesApi.js';
import { nameFormSchema } from './schemas.js';

export function NewFolderDialog({ open, onClose, parentId }) {
  return (
    <Dialog open={open} onClose={onClose} title="New folder">
      {/* Remounted on every open (Dialog renders children only while open): fresh form. */}
      <NewFolderForm parentId={parentId} onDone={onClose} />
    </Dialog>
  );
}

function NewFolderForm({ parentId, onDone }) {
  const [createFolder] = useCreateFolderMutation();
  const [formError, setFormError] = useState(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(nameFormSchema),
    defaultValues: { name: 'Untitled folder' },
  });

  async function onSubmit({ name }) {
    setFormError(null);
    try {
      await createFolder({ name, ...(parentId && { parentId }) }).unwrap();
      toast.success(`Folder “${name}” created`);
      onDone();
    } catch (apiError) {
      // 409 FOLDER_NAME_TAKEN arrives with details for "name": shown on the field.
      setFormError(applyApiError(apiError, setError, { fields: ['name'] }));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {formError && <Alert>{formError}</Alert>}
      <Input
        label="Folder name"
        autoFocus
        // Select the default name, so typing replaces it.
        onFocus={(event) => event.target.select()}
        error={errors.name?.message}
        {...register('name')}
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Create
        </Button>
      </div>
    </form>
  );
}
