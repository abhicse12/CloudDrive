/**
 * Helpers for the "Move to…" picker, which gets every folder as a flat list
 * [{ id, name, parentId }] and draws it as a tree.
 */

/** parentId → children (sorted by name); the root's children are under `null`. */
export function childrenByParent(folders) {
  const map = new Map();
  for (const folder of folders) {
    const key = folder.parentId ?? null;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(folder);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }
  return map;
}

/**
 * Folders that can't be a destination: the folders being moved and everything
 * inside them. Moving A into its own child would make a loop (the server refuses it
 * too, with 400 INVALID_MOVE; this just stops the user from trying).
 */
export function blockedDestinations(folders, movingFolderIds) {
  const children = childrenByParent(folders);
  const blocked = new Set();
  const stack = [...movingFolderIds];
  while (stack.length) {
    const id = stack.pop();
    if (blocked.has(id)) continue;
    blocked.add(id);
    for (const child of children.get(id) ?? []) stack.push(child.id);
  }
  return blocked;
}
