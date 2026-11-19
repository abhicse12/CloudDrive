/**
 * Which cached data each kind of change makes out of date. A mutation "invalidates"
 * these tags, and RTK Query refetches every query that "provides" one of them.
 *
 * Deliberately coarse (whole lists, not single items): a personal drive has few open
 * lists at once, so refetching a little extra is cheap, and it can never show stale
 * data because a fine-grained rule was forgotten.
 */
export const INVALIDATES = {
  // Rename/move: lists change; storage numbers don't.
  fileEdited: ['File', 'Activity'],
  folderEdited: ['Folder', 'Activity'],
  // Into or out of the trash: lists, trash page and "trash size" all change.
  trashChanged: ['File', 'Folder', 'Trash', 'Stats', 'Activity'],
  // Deleted forever: frees quota.
  deletedForever: ['Trash', 'Stats', 'Activity'],
  // New folder: folder lists and the folder count.
  folderCreated: ['Folder', 'Stats', 'Activity'],
  // Upload finished (used by the upload queue in U3).
  uploaded: ['File', 'Stats', 'Activity'],
};
