import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSelector } from 'react-redux';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { applyApiError } from '../../utils/formErrors.js';
import { useUpdateProfileMutation } from '../auth/authApi.js';
import { selectCurrentUser } from '../auth/authSlice.js';
import { profileSchema } from '../auth/schemas.js';

export function ProfileForm() {
  const user = useSelector(selectCurrentUser);
  const [updateProfile] = useUpdateProfileMutation();
  const [result, setResult] = useState(null); // { variant, message }

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({ resolver: zodResolver(profileSchema), defaultValues: { name: user.name } });

  async function onSubmit(values) {
    setResult(null);
    try {
      const { user: updated } = await updateProfile(values).unwrap();
      // The saved value becomes the new "clean" baseline, so Save disables again.
      reset({ name: updated.name });
      setResult({ variant: 'success', message: 'Profile updated.' });
    } catch (apiError) {
      const message = applyApiError(apiError, setError, { fields: ['name'] });
      if (message) setResult({ variant: 'error', message });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {result && <Alert variant={result.variant}>{result.message}</Alert>}

      <Input
        label="Full name"
        autoComplete="name"
        error={errors.name?.message}
        {...register('name', { onChange: () => setResult(null) })}
      />
      <Input
        label="Email"
        type="email"
        value={user.email}
        readOnly
        hint="Your email is your login and can't be changed yet."
        className="[&_input]:bg-surface-muted [&_input]:text-fg-muted"
      />

      <div className="flex justify-end">
        <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
