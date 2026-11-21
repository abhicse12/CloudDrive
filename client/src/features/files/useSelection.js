import { useState } from 'react';
import { EMPTY_SELECTION, clickSelection, visibleSelection } from './selection.js';

/**
 * Selection for one view of the Files page. `scope` identifies the view (folder +
 * search + filter): when it changes, the selection is empty again, without an
 * effect, by remembering which scope the stored selection belongs to.
 */
export function useSelection(orderedKeys, scope) {
  const [state, setState] = useState({ ...EMPTY_SELECTION, scope });
  const current = state.scope === scope ? state : { ...EMPTY_SELECTION, scope };
  const selected = visibleSelection(current, orderedKeys);

  const set = (next) => setState({ ...next, scope });

  return {
    selected,
    isSelected: (key) => selected.has(key),
    click: (key, modifiers) => set(clickSelection(current, key, modifiers, orderedKeys)),
    /** Checkbox: always adds/removes; Shift still selects a range. */
    toggle: (key, range = false) =>
      set(clickSelection(current, key, { toggle: true, range }, orderedKeys)),
    selectOnly: (key) => set({ selected: new Set([key]), anchor: key }),
    selectAll: () => set({ selected: new Set(orderedKeys), anchor: orderedKeys[0] ?? null }),
    clear: () => set(EMPTY_SELECTION),
  };
}
