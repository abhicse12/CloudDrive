import { CloudUpload } from 'lucide-react';
import { useRef, useState } from 'react';

/** Only react to dragged FILES, not to text or links dragged around the page. */
const hasFiles = (event) => [...(event.dataTransfer?.types ?? [])].includes('Files');

/**
 * Wraps a page so files can be dropped anywhere on it. Shows a full overlay while
 * files are dragged over.
 *
 * dragenter/dragleave fire for every child element the pointer crosses, so a simple
 * on/off flag would flicker. A counter (+1 enter, -1 leave) is 0 only when the drag
 * has really left the whole area.
 */
export function DropOverlay({ onFiles, targetName, children }) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  return (
    <div
      className="relative"
      onDragEnter={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (hasFiles(event)) event.preventDefault(); // allows the drop
      }}
      onDragLeave={(event) => {
        if (!hasFiles(event)) return;
        depth.current -= 1;
        if (depth.current <= 0) {
          depth.current = 0;
          setDragging(false);
        }
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault(); // otherwise the browser opens the file itself
        depth.current = 0;
        setDragging(false);
        if (event.dataTransfer.files.length) onFiles(event.dataTransfer.files);
      }}
    >
      {children}
      {dragging && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-brand-500 bg-brand-50/90 dark:bg-brand-950/80"
        >
          <CloudUpload className="size-10 text-brand-600 dark:text-brand-300" />
          <p className="mt-3 font-medium">Drop files to upload to {targetName}</p>
        </div>
      )}
    </div>
  );
}
