import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation } from 'react-router';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { PasswordInput } from '../../components/ui/PasswordInput.jsx';
import { useRegisterMutation } from '../../features/auth/authApi.js';
import { registerSchema } from '../../features/auth/schemas.js';
import { applyApiError } from '../../utils/formErrors.js';

export function RegisterPage() {
  const location = useLocation();
  const [registerAccount] = useRegisterMutation();
  const [formError, setFormError] = useState(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  async function onSubmit(values) {
    setFormError(null);
    try {
      await registerAccount(values).unwrap();
      // Registration also logs in: the RequireGuest guard now redirects to /app.
    } catch (apiError) {
      setFormError(
        applyApiError(apiError, setError, {
          fields: ['name', 'email', 'password'],
          codeToField: { EMAIL_TAKEN: 'email' },
        }),
      );
    }
  }

  return (
    <>
      <title>Create account · CloudDrive</title>
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1.5 text-sm text-fg-muted">5 GB of secure storage, free.</p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-8 space-y-5">
        {formError && <Alert>{formError}</Alert>}

        <Input
          label="Full name"
          autoComplete="name"
          placeholder="Jane Doe"
          error={errors.name?.message}
          {...register('name')}
        />
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register('email')}
        />
        <PasswordInput
          label="Password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          hint="Use 8 or more characters. A short phrase is easy to remember and hard to guess."
          error={errors.password?.message}
          {...register('password')}
        />

        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          Create account
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-fg-muted">
        Already have an account?{' '}
        <Link
          to="/login"
          state={location.state}
          className="font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          Log in
        </Link>
      </p>
    </>
  );
}
