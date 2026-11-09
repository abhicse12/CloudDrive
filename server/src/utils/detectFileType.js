import fs from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromFile } from 'file-type';
import { LEGACY_OFFICE, TEXT_TYPES, categoryOf, isAllowedBinaryType } from './fileTypes.js';

// Enough to judge whether a file is text, without reading a 100 MB file into memory.
const TEXT_SAMPLE_BYTES = 64 * 1024;

const extensionOf = (fileName) => path.extname(fileName).slice(1).toLowerCase();

/**
 * True if the start of the file is valid UTF-8 with no NUL bytes. Executables, images
 * and other binaries almost always contain NUL bytes or invalid UTF-8 sequences.
 */
async function looksLikeText(filePath) {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(TEXT_SAMPLE_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, TEXT_SAMPLE_BYTES, 0);
    const sample = buffer.subarray(0, bytesRead);
    if (sample.includes(0)) return false;
    try {
      // fatal: throw on invalid UTF-8. stream: a character cut in half at the end of
      // the sample is not an error, its remaining bytes are just beyond the sample.
      new TextDecoder('utf-8', { fatal: true }).decode(sample, { stream: true });
      return true;
    } catch {
      return false;
    }
  } finally {
    await handle.close();
  }
}

/**
 * Works out what a file REALLY is from its content, not from what the browser claims.
 * Returns { mimeType, category }, or null if the file type isn't allowed.
 *
 * 1. Binary formats are recognised by their "magic bytes" (a PNG always starts with
 *    89 50 4E 47...). Renaming virus.exe to photo.png doesn't change those bytes.
 * 2. Text formats have no magic bytes, so they're accepted by extension, but only if
 *    the content really is text.
 */
export async function detectFileType(filePath, fileName) {
  const ext = extensionOf(fileName);
  const detected = await fileTypeFromFile(filePath);

  if (detected) {
    // .doc/.xls/.ppt share one container format; the extension says which one it is.
    if (detected.mime === 'application/x-cfb') {
      const mimeType = LEGACY_OFFICE[ext];
      return mimeType ? { mimeType, category: categoryOf(mimeType) } : null;
    }
    if (isAllowedBinaryType(detected.mime)) {
      return { mimeType: detected.mime, category: categoryOf(detected.mime) };
    }
    // Any other recognised binary (an executable, a disk image...) is refused, even if
    // it's been renamed to .txt. Only text-based detections (e.g. XML) continue below.
    const textBased = detected.mime.startsWith('text/') || detected.mime === 'application/xml';
    if (!textBased) return null;
  }

  const textType = TEXT_TYPES[ext];
  if (textType && (await looksLikeText(filePath))) {
    return { mimeType: textType, category: categoryOf(textType) };
  }
  return null;
}
