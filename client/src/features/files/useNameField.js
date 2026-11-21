import { useEffect, useRef } from 'react';

/**
 * The "name" input of the New folder / Rename forms: focused and pre-selected, so
 * typing replaces the name right away.
 *
 * Why not just autoFocus + onFocus={select}? React Hook Form writes the starting
 * value into the input when it registers it, which happens AFTER autoFocus, and
 * setting a value moves the cursor to the end, undoing the selection. An effect runs
 * after both, so the selection sticks.
 *
 * keepExtension: for files, select "report" but not ".pdf", like file managers do.
 */
export function useNameField(register, { keepExtension = false } = {}) {
  const inputRef = useRef(null);
  const { ref, ...field } = register('name');

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const dot = input.value.lastIndexOf('.');
    if (keepExtension && dot > 0) input.setSelectionRange(0, dot);
    else input.select();
  }, [keepExtension]);

  return {
    ...field,
    // Both React Hook Form and we need the element.
    ref: (element) => {
      ref(element);
      inputRef.current = element;
    },
  };
}
