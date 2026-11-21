import { useEffect, useLayoutEffect, useRef } from 'react';
import { MenuList } from './MenuList.jsx';

/**
 * Right-click menu at the pointer. Same keyboard behaviour as DropdownMenu (it's the
 * same MenuList); closes on Esc, outside click, scroll or window resize.
 * Moved back inside the window if it would overflow near the right/bottom edge.
 */
export function ContextMenu({ x, y, items, label, onClose }) {
  const ref = useRef(null);

  // Measure after rendering, before the browser paints: no visible jump. Written
  // straight to the element: it's a pure layout fix, no re-render needed.
  useLayoutEffect(() => {
    const element = ref.current;
    const { width, height } = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(x, window.innerWidth - width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(y, window.innerHeight - height - 8))}px`;
  }, [x, y]);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!ref.current?.contains(event.target)) onClose();
    };
    const close = () => onClose();
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [onClose]);

  return (
    <div ref={ref} aria-label={label} className="fixed z-50" style={{ left: x, top: y }}>
      <MenuList items={items} onClose={() => onClose()} />
    </div>
  );
}
