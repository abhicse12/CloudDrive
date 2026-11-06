import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { useForgotPasswordMutation } from '../../features/auth/authApi.js';
import { forgotPasswordSchema } from '../../features/auth/schemas.js';
import { applyApiError } from '../../utils/formErrors.js';

const backToLogin = (
  <Link
    to="/login"
    className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-fg-muted hover:text-fg"
  >
    <ArrowLeft className="size-4" aria-hidden="true" /> Back to log in
  </Link>
);

export function ForgotPasswordPage() {
  const [forgotPassword] = useForgotPasswordMutation();
  const [sentTo, setSentTo] = useState(null);
  const [formError, setFormError] = useState(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } });

  async function onSubmit(values) {
    setFormError(null);
    try {
      await forgotPassword(values).unwrap();
      setSentTo(values.email);
    } catch (apiError) {
      setFormError(applyApiError(apiError, setError, { fields: ['email'] }));
    }
  }

  if (sentTo) {
    return (
      <>
        <title>Check your email · CloudDrive</title>
        <span className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          <MailCheck className="size-6" aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Check your email</h1>
        {/* Same wording whether or not the account exists (no account discovery). */}
        <p className="mt-2 text-sm text-fg-muted">
          If an account exists for <span className="font-medium text-fg">{sentTo}</span>, we've sent
          a link to reset your password. It expires in 30 minutes.
        </p>
        {import.meta.env.DEV && (
          <Alert variant="info" className="mt-6">
            Development mode: emails aren't really sent. Copy the reset link from the{' '}
            <strong>API terminal</strong>.
          </Alert>
        )}
        {backToLogin}
      </>
    );
  }

  return (
    <>
      <title>Forgot password · CloudDrive</title>
      <h1 className="text-2xl font-semibold tracking-tight">Forgot your password?</h1>
      <p className="mt-1.5 text-sm text-fg-muted">
        Enter your email and we'll send you a link to choose a new one.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-8 space-y-5">
        {formError && <Alert>{formError}</Alert>}
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register('email')}
        />
        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          Send reset link
        </Button>
      </form>

      {backToLogin}
    </>
  );
}
