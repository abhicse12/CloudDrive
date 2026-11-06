import { FolderOpen, LayoutDashboard, Settings, Share2, ShieldCheck, Trash2 } from 'lucide-react';

/**
 * Sidebar items. `soon: true` items are shown but disabled until their phase is built,
 * so the layout already looks complete without links that lead nowhere.
 * `roles` hides an item from users without that role (the API enforces it anyway).
 */
export const NAV_ITEMS = [
  { to: '/app', label: 'Dashboard', Icon: LayoutDashboard, end: true },
  { to: '/app/files', label: 'My Files', Icon: FolderOpen, soon: true },
  { to: '/app/shared', label: 'Shared', Icon: Share2, soon: true },
  { to: '/app/trash', label: 'Trash', Icon: Trash2, soon: true },
  { to: '/app/settings', label: 'Settings', Icon: Settings, soon: true },
  { to: '/app/admin', label: 'Admin', Icon: ShieldCheck, soon: true, roles: ['ADMIN'] },
];
