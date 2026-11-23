import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Navigate, Outlet, useLocation } from 'react-router';
import { FullPageSpinner } from '../../components/ui/Spinner.jsx';
import { NotFoundPage } from '../../pages/NotFoundPage.jsx';
import { authApi } from './authApi.js';
import { selectAuthStatus, selectCurrentUser } from './authSlice.js';
import { safeRedirectPath } from './redirect.js';

/**
 * Root of the route tree: asks the server "who am I?" once when the app opens.
 * The answer (via authSlice) moves status from 'unknown' to 'authenticated' or 'guest'.
 */
export function AuthBootstrap() {
  const dispatch = useDispatch();

  useEffect(() => {
    const request = dispatch(authApi.endpoints.getMe.initiate(undefined, { subscribe: false }));
    return () => request.abort?.();
  }, [dispatch]);

  return <Outlet />;
}

/**
 * Only logged-in users get through. Others go to /login, remembering where they were
 * heading (state.from) so login can send them back there afterwards.
 *
 * NOTE: this is about user experience, not security. Anyone can edit JavaScript in
 * their browser; the real protection is requireAuth on the API, which checks every request.
 */
export function RequireAuth() {
  const status = useSelector(selectAuthStatus);
  const location = useLocation();

  if (status === 'unknown') return <FullPageSpinner />;
  if (status === 'guest') return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

/** Login/register pages: a logged-in user has no business there, send them to the app. */
export function RequireGuest() {
  const status = useSelector(selectAuthStatus);
  const location = useLocation();

  if (status === 'unknown') return <FullPageSpinner />;
  if (status === 'authenticated') {
    return <Navigate to={safeRedirectPath(location.state?.from?.pathname)} replace />;
  }
  return <Outlet />;
}

/**
 * Only users with one of the given roles, e.g. <RequireRole roles={['ADMIN']} />.
 * Everyone else sees the ordinary 404 page, as for any URL that doesn't exist, so the
 * page doesn't even reveal that it is there. (Again UX only: the API answers 403.)
 */
export function RequireRole({ roles }) {
  const user = useSelector(selectCurrentUser);
  if (!user || !roles.includes(user.role)) return <NotFoundPage />;
  return <Outlet />;
}
