import { FOLDER_LOOK, categoryLook } from './fileCategories.js';

const SIZES = {
  sm: { box: 'size-8 rounded-lg', icon: 'size-4' },
  md: { box: 'size-10 rounded-xl', icon: 'size-5' },
  lg: { box: 'size-16 rounded-2xl', icon: 'size-8' },
};

/** Coloured tile with the category's icon. <FileIcon folder /> for folders. */
export function FileIcon({ category, folder = false, size = 'md', className = '' }) {
  const look = folder ? FOLDER_LOOK : categoryLook(category);
  const { box, icon } = SIZES[size];
  return (
    <span className={`grid shrink-0 place-items-center ${box} ${look.tile} ${className}`}>
      <look.Icon className={icon} aria-hidden="true" />
    </span>
  );
}
