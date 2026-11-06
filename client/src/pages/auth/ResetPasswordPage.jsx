import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { PasswordInput } from '../../components/ui/PasswordInput.jsx';
import { useResetPasswordMutation } from '../../features/auth/authApi.js';
import { resetPasswordSchema } from '../../features/auth/schemas.js';
import { applyApiError } from '../../utils/formErrors.js';

const TOKEN_FORMAT = /^[\w-]{43}$/;
const BAD_LINK_CODES = new Set(['INVALID_RESET_TOKEN', 'VALIDATION_ERROR']);

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [resetPassword] = useResetPasswordMutation();
  const [formError, setFormError] = useState(null);
  const [linkInvalid, setLinkInvalid] = useState(false);

  // The token works like a one-time password. It arrives in the URL (?token=...), but we
  // move it into the history entry's hidden state right away: out of the address bar,
  // screenshots and browser history, yet still there if the page is refreshed.
  const token = location.state?.token ?? searchParams.get('token');

  useEffect(() => {
    if (searchParams.has('token')) {
      navigate('/reset-password', { replace: true, state: { token: searchParams.get('token') } });
    }
  }, [searchParams, navigate]);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(resetPasswordSchema), defaultValues: { newPassword: '' } });

  async function onSubmit({ newPassword }) {
    setFormError(null);
    try {
      await resetPassword({ token, newPassword }).unwrap();
      navigate('/login', {
        replace: true,
        state: { notice: 'Your password has been changed. Log in with your new password.' },
      });
    } catch (apiError) {
      if (
        BAD_LINK_CODES.has(apiError.code) &&
        !apiError.details?.some((d) => d.field === 'newPassword')
      ) {
        setLinkInvalid(true);
        return;
      }
      setFormError(applyApiError(apiError, setError, { fields: ['newPassword'] }));
    }
  }

  if (!token || !TOKEN_FORMAT.test(token) || linkInvalid) {
    return (
      <>
        <title>Link expired · CloudDrive</title>
        <h1 className="text-2xl font-semibold tracking-tight">This link can't be used</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Reset links expire after 30 minutes and work only once. Request a new one and use the most
          recent email.
        </p>
        <Link
          to="/forgot-password"
          className="mt-8 inline-flex text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          Request a new link
        </Link>
      </>
    );
  }

  return (
    <>
      <title>Choose a new password · CloudDrive</title>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1.5 text-sm text-fg-muted">
        After this, you'll be logged out on every device.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-8 space-y-5">
        {formError && <Alert>{formError}</Alert>}
        <PasswordInput
          label="New password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          error={errors.newPassword?.message}
          {...register('newPassword')}
        />
        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          Update password
        </Button>
      </form>
    </>
  );
}
