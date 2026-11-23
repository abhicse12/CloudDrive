import { createBrowserRouter } from 'react-router';
import { AuthBootstrap, RequireAuth, RequireGuest } from './features/auth/guards.jsx';
import { AuthLayout } from './layouts/AuthLayout.jsx';
import { PublicLayout } from './layouts/PublicLayout.jsx';
import { AppLayout } from './layouts/app/AppLayout.jsx';
import { RouteErrorPage } from './pages/RouteErrorPage.jsx';

/**
 * Lazy-loads a page: its code is downloaded only when someone opens that page,
 * so visitors of the landing page don't download the dashboard.
 */
const page = (load, exportName) => async () => ({ Component: (await load())[exportName] });

/**
 * Route tree. Layout routes (no `path`) wrap their children; guard routes decide
 * whether their children may render at all.
 */
export const router = createBrowserRouter([
  {
    element: <AuthBootstrap />,
    errorElement: <RouteErrorPage />,
    children: [
      // Public marketing pages
      {
        element: <PublicLayout />,
        children: [
          { index: true, lazy: page(() => import('./pages/LandingPage.jsx'), 'LandingPage') },
        ],
      },

      // Auth pages
      {
        element: <AuthLayout />,
        children: [
          {
            // Only for logged-out visitors
            element: <RequireGuest />,
            children: [
              {
                path: 'login',
                lazy: page(() => import('./pages/auth/LoginPage.jsx'), 'LoginPage'),
              },
              {
                path: 'register',
                lazy: page(() => import('./pages/auth/RegisterPage.jsx'), 'RegisterPage'),
              },
              {
                path: 'forgot-password',
                lazy: page(
                  () => import('./pages/auth/ForgotPasswordPage.jsx'),
                  'ForgotPasswordPage',
                ),
              },
            ],
          },
          // Reset links must work whether or not someone is logged in on this browser.
          {
            path: 'reset-password',
            lazy: page(() => import('./pages/auth/ResetPasswordPage.jsx'), 'ResetPasswordPage'),
          },
        ],
      },

      // Public share links: for everyone, logged in or not (so no guard), own minimal layout.
      { path: 's/:token', lazy: page(() => import('./pages/SharePage.jsx'), 'SharePage') },

      // The logged-in app
      {
        element: <RequireAuth />,
        children: [
          {
            path: 'app',
            element: <AppLayout />,
            children: [
              {
                index: true,
                lazy: page(() => import('./pages/DashboardPage.jsx'), 'DashboardPage'),
              },
              {
                // :folderId? = optional: /app/files is the root, /app/files/<id> a folder.
                path: 'files/:folderId?',
                lazy: page(() => import('./pages/FilesPage.jsx'), 'FilesPage'),
              },
              {
                path: 'trash',
                lazy: page(() => import('./pages/TrashPage.jsx'), 'TrashPage'),
              },
              {
                path: 'settings',
                lazy: page(() => import('./pages/SettingsPage.jsx'), 'SettingsPage'),
              },
            ],
          },
        ],
      },

      { path: '*', lazy: page(() => import('./pages/NotFoundPage.jsx'), 'NotFoundPage') },
    ],
  },
]);
