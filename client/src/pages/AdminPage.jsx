import { AdminOverview } from '../features/admin/AdminOverview.jsx';
import { UsersTable } from '../features/admin/UsersTable.jsx';

/**
 * /app/admin (ADMIN only; RequireRole shows everyone else the 404 page, and the API
 * answers 403 regardless). Account data and usage only: admins never see anyone's files.
 */
export function AdminPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <title>Admin · CloudDrive</title>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Usage across CloudDrive, and every account. Files stay private: admins see sizes and
          counts, never contents.
        </p>
      </div>
      <AdminOverview />
      <UsersTable />
    </div>
  );
}
