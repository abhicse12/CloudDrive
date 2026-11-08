import { useSelector } from 'react-redux';
import { StorageMeter } from '../components/common/StorageMeter.jsx';
import { ThemeToggle } from '../components/common/ThemeToggle.jsx';
import { selectCurrentUser } from '../features/auth/authSlice.js';
import { PasswordForm } from '../features/settings/PasswordForm.jsx';
import { ProfileForm } from '../features/settings/ProfileForm.jsx';
import { SettingsSection } from '../features/settings/SettingsSection.jsx';
import { formatBytes } from '../utils/format.js';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' });

export function SettingsPage() {
  const user = useSelector(selectCurrentUser);
  const remaining = Math.max(0, user.storageLimit - user.storageUsed);

  return (
    <div className="mx-auto max-w-4xl">
      <title>Settings · CloudDrive</title>
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-fg-muted">Manage your profile, security and storage.</p>

      <div className="mt-10">
        <SettingsSection
          id="profile-title"
          title="Profile"
          description="How you appear in CloudDrive."
        >
          <ProfileForm />
        </SettingsSection>

        <SettingsSection
          id="password-title"
          title="Password"
          description="Changing it logs you out everywhere except this device."
        >
          <PasswordForm />
        </SettingsSection>

        <SettingsSection
          id="storage-title"
          title="Storage"
          description="Files in the trash count until they're deleted for good."
        >
          <StorageMeter used={user.storageUsed} limit={user.storageLimit} />
          <dl className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-fg-muted">Used</dt>
              <dd className="mt-0.5 font-medium">{formatBytes(user.storageUsed)}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">Available</dt>
              <dd className="mt-0.5 font-medium">{formatBytes(remaining)}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">Plan</dt>
              <dd className="mt-0.5 font-medium">Free · {formatBytes(user.storageLimit)}</dd>
            </div>
          </dl>
        </SettingsSection>

        <SettingsSection
          id="account-title"
          title="Account"
          description="Appearance and account details."
        >
          <dl className="space-y-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-fg-muted">Theme</dt>
              <dd>
                <ThemeToggle />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-fg-muted">Role</dt>
              <dd className="font-medium">{user.role === 'ADMIN' ? 'Administrator' : 'Member'}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-fg-muted">Member since</dt>
              <dd className="font-medium">{dateFormat.format(new Date(user.createdAt))}</dd>
            </div>
          </dl>
        </SettingsSection>
      </div>
    </div>
  );
}
