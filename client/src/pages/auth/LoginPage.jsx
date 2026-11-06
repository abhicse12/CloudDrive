import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation } from 'react-router';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { PasswordInput } from '../../components/ui/PasswordInput.jsx';
import { useLoginMutation } from '../../features/auth/authApi.js';
import { loginSchema } from '../../features/auth/schemas.js';
import { applyApiError } from '../../utils/formErrors.js';

export function LoginPage() {
  const location = useLocation();
  const notice = location.state?.notice; // e.g. "Password updated" after a reset
  const [login] = useLoginMutation();
  const [formError, setFormError] = useState(null);

  const {
    register,
    handleSubmit,
    setError,
    resetField,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values) {
    setFormError(null);
    try {
      await login(values).unwrap();
      // No navigate() here: the user is now "authenticated", so the RequireGuest guard
      // around this page redirects to /app (or to the page they originally wanted).
    } catch (apiError) {
      // Wrong credentials stay a form-level message on purpose: telling WHICH field was
      // wrong would reveal whether the email has an account.
      setFormError(applyApiError(apiError, setError, { fields: ['email', 'password'] }));
      if (apiError.code === 'INVALID_CREDENTIALS') {
        resetField('password');
        setFocus('password');
      }
    }
  }

  return (
    <>
      <title>Log in · CloudDrive</title>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1.5 text-sm text-fg-muted">Log in to access your files.</p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-8 space-y-5">
        {notice && !formError && <Alert variant="success">{notice}</Alert>}
        {formError && <Alert>{formError}</Alert>}

        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register('email')}
        />

        <div>
          <PasswordInput
            label="Password"
            autoComplete="current-password"
            placeholder="Your password"
            error={errors.password?.message}
            {...register('password')}
          />
          <Link
            to="/forgot-password"
            className="mt-2 inline-block text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          Log in
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-fg-muted">
        New to CloudDrive?{' '}
        <Link
          to="/register"
          state={location.state}
          className="font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          Create an account
        </Link>
      </p>
    </>
  );
}
