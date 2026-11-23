import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { toast } from '../../components/ui/toast.js';
import { formatBytes } from '../../utils/format.js';
import { applyApiError } from '../../utils/formErrors.js';
import { bytesToGb, gbToBytes, selectClasses } from './adminFormat.js';
import { useUpdateAdminUserMutation } from './adminApi.js';
import { editUserSchema } from './schemas.js';

/**
 * Role/status picker. For admins editing themselves it is shown but NOT registered:
 * React Hook Form turns disabled fields into `undefined`, and those changes aren't
 * allowed anyway (the API answers 409 CANNOT_CHANGE_OWN_ACCESS).
 */
function ChoiceField({ id, label, name, options, register, locked, value }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        className={selectClasses}
        {...(locked ? { disabled: true, defaultValue: value } : register(name))}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  );
}

/** user: an admin user DTO or null (closed). isSelf: the admin is editing themselves. */
export function EditUserDialog({ user, isSelf, onClose }) {
  return (
    <Dialog
      open={Boolean(user)}
      onClose={onClose}
      title={user ? `Edit ${user.name}` : 'Edit user'}
      description={user?.email}
    >
      {user && <EditUserForm user={user} isSelf={isSelf} onDone={onClose} />}
    </Dialog>
  );
}

function EditUserForm({ user, isSelf, onDone }) {
  const [updateUser] = useUpdateAdminUserMutation();
  const [formError, setFormError] = useState(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      ...(!isSelf && { role: user.role, status: user.status }),
      storageLimitGb: bytesToGb(user.storageLimit),
    },
  });

  async function onSubmit(values) {
    // Send only what changed, so the audit log records exactly that.
    const limit = gbToBytes(values.storageLimitGb);
    const changes = {
      ...(values.role && values.role !== user.role && { role: values.role }),
      ...(values.status && values.status !== user.status && { status: values.status }),
      // Unchanged GB value: keep the exact byte limit (GB shown rounded to 2 decimals).
      ...(values.storageLimitGb !== bytesToGb(user.storageLimit) && { storageLimit: limit }),
    };
    if (Object.keys(changes).length === 0) return onDone();

    setFormError(null);
    try {
      await updateUser({ id: user.id, ...changes }).unwrap();
      toast.success(`Updated ${user.name}`);
      onDone();
    } catch (apiError) {
      // 409s: LIMIT_BELOW_USAGE belongs to the limit field; LAST_ADMIN and
      // CANNOT_CHANGE_OWN_ACCESS are about the whole change, shown as an alert.
      setFormError(
        applyApiError(apiError, setError, {
          fields: [],
          codeToField: { LIMIT_BELOW_USAGE: 'storageLimitGb' },
        }),
      );
    }
  }

  const ownAccess = isSelf ? "You can't change your own role or status." : undefined;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {formError && <Alert>{formError}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <ChoiceField
          id="edit-role"
          label="Role"
          name="role"
          options={[
            ['USER', 'User'],
            ['ADMIN', 'Admin'],
          ]}
          register={register}
          locked={isSelf}
          value={user.role}
        />
        <ChoiceField
          id="edit-status"
          label="Status"
          name="status"
          options={[
            ['ACTIVE', 'Active'],
            ['SUSPENDED', 'Suspended'],
          ]}
          register={register}
          locked={isSelf}
          value={user.status}
        />
      </div>
      {ownAccess && <p className="-mt-3 text-xs text-fg-subtle">{ownAccess}</p>}

      <Input
        label="Storage limit (GB)"
        type="number"
        min="0"
        step="0.5"
        inputMode="decimal"
        error={errors.storageLimitGb?.message}
        hint={`In use: ${formatBytes(user.storageUsed)}`}
        {...register('storageLimitGb', { valueAsNumber: true })}
      />

      <p className="text-xs text-fg-subtle">
        Suspending signs the user out everywhere and pauses their share links until they're active
        again.
      </p>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
