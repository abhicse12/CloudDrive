import { File, FileArchive, FileAudio, FileImage, FileText, FileVideo, Folder } from 'lucide-react';

/**
 * One table for how each category looks, used by file icons, filter chips and the
 * dashboard's usage bar, so "images are pink" everywhere. Order = display order.
 * Categories come from the server (detected from file bytes), never from the name.
 */
export const CATEGORIES = {
  IMAGE: {
    label: 'Images',
    Icon: FileImage,
    tile: 'bg-pink-50 text-pink-600 dark:bg-pink-500/15 dark:text-pink-300',
    bar: 'bg-pink-500',
  },
  VIDEO: {
    label: 'Videos',
    Icon: FileVideo,
    tile: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
    bar: 'bg-violet-500',
  },
  AUDIO: {
    label: 'Audio',
    Icon: FileAudio,
    tile: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
    bar: 'bg-amber-500',
  },
  DOCUMENT: {
    label: 'Documents',
    Icon: FileText,
    tile: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
    bar: 'bg-sky-500',
  },
  ARCHIVE: {
    label: 'Archives',
    Icon: FileArchive,
    tile: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
    bar: 'bg-emerald-500',
  },
  OTHER: {
    label: 'Other',
    Icon: File,
    tile: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300',
    bar: 'bg-slate-400',
  },
};

export const FOLDER_LOOK = {
  label: 'Folder',
  Icon: Folder,
  tile: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
};

export const categoryLook = (category) => CATEGORIES[category] ?? CATEGORIES.OTHER;
