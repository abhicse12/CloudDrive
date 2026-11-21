/**
 * Selection rules, as pure functions (no React), so every case is easy to test.
 * Items are identified by a key: "folder:<id>" or "file:<id>".
 * `anchor` is the item a Shift-click range starts from, like in a file manager.
 */
export const keyOf = (item) => `${item.kind}:${item.id}`;

export const EMPTY_SELECTION = { selected: new Set(), anchor: null };

/**
 * A click on `key` with the given modifiers:
 *   plain click   → only this item
 *   Ctrl/⌘ click  → add or remove this item
 *   Shift click   → everything from the anchor to here (Ctrl+Shift adds the range)
 * orderedKeys = items in the order they appear on screen.
 */
export function clickSelection(state, key, { toggle = false, range = false }, orderedKeys) {
  const { selected, anchor } = state;

  if (range && anchor && orderedKeys.includes(anchor)) {
    const [from, to] = [orderedKeys.indexOf(anchor), orderedKeys.indexOf(key)].sort(
      (a, b) => a - b,
    );
    const rangeKeys = orderedKeys.slice(from, to + 1);
    // The anchor stays put, so Shift-clicking again re-draws the range from it.
    return { selected: new Set(toggle ? [...selected, ...rangeKeys] : rangeKeys), anchor };
  }

  if (toggle) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return { selected: next, anchor: key };
  }

  return { selected: new Set([key]), anchor: key };
}

/** Only keys still on screen count (a trashed item can't stay "selected"). */
export function visibleSelection(state, orderedKeys) {
  const visible = new Set(orderedKeys);
  return new Set([...state.selected].filter((key) => visible.has(key)));
}
