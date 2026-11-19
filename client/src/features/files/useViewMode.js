import { useState } from 'react';

const STORAGE_KEY = 'clouddrive.viewMode';
const MODES = ['grid', 'list'];

function readStored() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return MODES.includes(value) ? value : 'grid';
  } catch {
    return 'grid'; // storage blocked (private mode, strict settings): just use the default
  }
}

/** Grid or list, remembered on this device. A personal preference, so not in the URL. */
export function useViewMode() {
  const [mode, setMode] = useState(readStored);

  const change = (next) => {
    setMode(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not remembered, but still works for this visit.
    }
  };

  return [mode, change];
}
