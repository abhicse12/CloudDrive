/** CloudDrive mark + optional wordmark. Size is controlled by the parent's font size. */
export function Logo({ showText = true, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
        <defs>
          <linearGradient id="clouddrive-logo" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4f46e5" />
            <stop offset="1" stopColor="#7c3aed" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8" fill="url(#clouddrive-logo)" />
        <path
          d="M10.5 21.5h11a4 4 0 0 0 .6-7.96A6 6 0 0 0 10.6 12.6a4.5 4.5 0 0 0-.1 8.9z"
          fill="#fff"
        />
      </svg>
      {showText && <span className="text-lg">CloudDrive</span>}
    </span>
  );
}
