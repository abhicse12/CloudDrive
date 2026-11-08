import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { PasswordInput } from '../../components/ui/PasswordInput.jsx';
import { applyApiError } from '../../utils/formErrors.js';
import { useChangePasswordMutation } from '../auth/authApi.js';
import { changePasswordSchema } from '../auth/schemas.js';

const EMPTY = { currentPassword: '', newPassword: '' };

export function PasswordForm() {
  const [changePassword] = useChangePasswordMutation();
  const [result, setResult] = useState(null);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(changePasswordSchema), defaultValues: EMPTY });

  async function onSubmit(values) {
    setResult(null);
    try {
      await changePassword(values).unwrap();
      reset(EMPTY); // never leave passwords sitting in the form
      setResult({
        variant: 'success',
        message: 'Password changed. You were logged out on all your other devices.',
      });
    } catch (apiError) {
      // The API reports a wrong current password as 400 with field "currentPassword"
      // (not 401, which would wrongly look like an expired session).
      const message = applyApiError(apiError, setError, {
        fields: ['currentPassword', 'newPassword'],
      });
      if (message) setResult({ variant: 'error', message });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {result && <Alert variant={result.variant}>{result.message}</Alert>}

      <PasswordInput
        label="Current password"
        autoComplete="current-password"
        error={errors.currentPassword?.message}
        {...register('currentPassword')}
      />
      <PasswordInput
        label="New password"
        autoComplete="new-password"
        hint="At least 8 characters."
        error={errors.newPassword?.message}
        {...register('newPassword')}
      />

      <div className="flex justify-end">
        <Button type="submit" loading={isSubmitting}>
          Change password
        </Button>
      </div>
    </form>
  );
}
