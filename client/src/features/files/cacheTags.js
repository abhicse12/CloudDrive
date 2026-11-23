/**
 * Which cached data each kind of change makes out of date. A mutation "invalidates"
 * these tags, and RTK Query refetches every query that "provides" one of them.
 *
 * Deliberately coarse (whole lists, not single items): a personal drive has few open
 * lists at once, so refetching a little extra is cheap, and it can never show stale
 * data because a fine-grained rule was forgotten.
 */
export const INVALIDATES = {
  // Rename/move: lists change; storage numbers don't. The Shared page shows file names.
  fileEdited: ['File', 'Share', 'Activity'],
  folderEdited: ['Folder', 'Activity'],
  // Into or out of the trash: lists, trash page and "trash size" all change, and the
  // file's share links pause or resume ("File in trash" on the Shared page).
  trashChanged: ['File', 'Folder', 'Trash', 'Stats', 'Share', 'Activity'],
  // Deleted forever: frees quota, and the file's share links are deleted with it.
  deletedForever: ['Trash', 'Stats', 'Share', 'Activity'],
  // Share link created, revoked or regenerated: the Shared page, and the "shared" badge
  // on file cards (isShared).
  shareChanged: ['Share', 'File', 'Activity'],
  // Admin changed a user. Coarse on purpose: if admins change THEMSELVES (their own
  // limit), their storage card and sidebar meter (both 'Stats') must update too.
  adminUserChanged: ['AdminUsers', 'AdminStats', 'Stats', 'Activity'],
  // New folder: folder lists and the folder count.
  folderCreated: ['Folder', 'Stats', 'Activity'],
  // Upload finished (used by the upload queue in U3).
  uploaded: ['File', 'Stats', 'Activity'],
};
