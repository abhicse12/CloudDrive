import {
  Activity,
  FolderInput,
  FolderPlus,
  KeyRound,
  Pencil,
  RotateCcw,
  Share2,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';

const quoted = (name) => (name ? `“${name}”` : 'an item');

/**
 * Activity log entry → a sentence and an icon for the feed:
 *   { action: 'FILE_RENAMED', metadata: { name: 'b.png', previousName: 'a.png' } }
 *   → Renamed “a.png” to “b.png”
 * metadata is a snapshot taken at the time, so names stay right even after the item
 * was renamed again or deleted.
 */
const DESCRIPTIONS = {
  FILE_UPLOADED: [Upload, (m) => `Uploaded ${quoted(m.name)}`],
  FILE_RENAMED: [Pencil, (m) => `Renamed ${quoted(m.previousName)} to ${quoted(m.name)}`],
  FILE_MOVED: [FolderInput, (m) => `Moved ${quoted(m.name)}`],
  FILE_TRASHED: [Trash2, (m) => `Moved ${quoted(m.name)} to trash`],
  FILE_RESTORED: [RotateCcw, (m) => `Restored ${quoted(m.name)}`],
  FILE_DELETED: [XCircle, (m) => `Deleted ${quoted(m.name)} forever`],
  FOLDER_CREATED: [FolderPlus, (m) => `Created folder ${quoted(m.name)}`],
  FOLDER_RENAMED: [Pencil, (m) => `Renamed folder ${quoted(m.previousName)} to ${quoted(m.name)}`],
  FOLDER_MOVED: [FolderInput, (m) => `Moved folder ${quoted(m.name)}`],
  FOLDER_TRASHED: [Trash2, (m) => `Moved folder ${quoted(m.name)} to trash`],
  FOLDER_RESTORED: [
    RotateCcw,
    (m) =>
      m.previousName
        ? `Restored folder ${quoted(m.previousName)} as ${quoted(m.name)}`
        : `Restored folder ${quoted(m.name)}`,
  ],
  FOLDER_DELETED: [XCircle, (m) => `Deleted folder ${quoted(m.name)} forever`],
  SHARE_CREATED: [Share2, (m) => `Shared ${quoted(m.name)}`],
  SHARE_REVOKED: [Share2, (m) => `Stopped sharing ${quoted(m.name)}`],
  PASSWORD_CHANGED: [KeyRound, () => 'Changed your password'],
};

export function describeActivity({ action, metadata = {} }) {
  const [Icon, text] = DESCRIPTIONS[action] ?? [Activity, () => 'Activity'];
  return { Icon, text: text(metadata) };
}
