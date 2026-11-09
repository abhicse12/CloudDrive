import { createHmac, timingSafeEqual } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { StorageProvider } from './StorageProvider.js';

// Keys we generate look like "users/<uuid>/<uuid>". Anything else is refused outright.
const KEY_FORMAT = /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/;

/**
 * Keeps files on this machine's disk, under `root`.
 *
 * Signed URLs imitate S3 pre-signed URLs: the URL carries the key, expiry and display
 * options, plus an HMAC signature over all of them. Our API checks the signature and
 * serves the file; changing any part of the URL breaks the signature.
 */
export class LocalStorageProvider extends StorageProvider {
  constructor({ root, signingSecret, publicPath = '/api/storage' }) {
    super();
    this.root = path.resolve(root);
    this.signingSecret = signingSecret;
    this.publicPath = publicPath;
  }

  /**
   * Key → absolute path, refusing anything that could escape the storage root
   * ("path traversal", e.g. "../../server/.env"). Two checks: a strict key format,
   * and confirming the resolved path is still inside root.
   */
  pathFor(key) {
    if (typeof key !== 'string' || !KEY_FORMAT.test(key)) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    const fullPath = path.resolve(this.root, key);
    if (!fullPath.startsWith(this.root + path.sep)) {
      throw new Error(`Storage key escapes the storage root: ${key}`);
    }
    return fullPath;
  }

  async upload({ key, sourcePath }) {
    const target = this.pathFor(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    try {
      // Same disk: an instant rename, no copying.
      await fs.rename(sourcePath, target);
    } catch (err) {
      // Different disks/drives can't rename across; copy, then remove the original.
      if (err.code !== 'EXDEV') throw err;
      await fs.copyFile(sourcePath, target);
      await fs.rm(sourcePath, { force: true });
    }
  }

  async download(key) {
    return createReadStream(this.pathFor(key));
  }

  async delete(key) {
    await fs.rm(this.pathFor(key), { force: true });
  }

  async getMetadata(key) {
    try {
      const stats = await fs.stat(this.pathFor(key));
      return { size: stats.size, lastModified: stats.mtime };
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async checkHealth() {
    await fs.mkdir(this.root, { recursive: true });
    await fs.access(this.root, constants.R_OK | constants.W_OK);
  }

  async getSignedUrl(key, { expiresIn, disposition, filename, contentType }) {
    this.pathFor(key); // validate now, not when the link is used
    const payload = {
      k: key,
      e: Math.floor(Date.now() / 1000) + expiresIn,
      d: disposition,
      n: filename,
      t: contentType,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${this.publicPath}/${body}.${this.sign(body)}`;
  }

  /**
   * Checks a token from a signed URL. Returns its payload plus the file path, or null if
   * the signature is wrong, the token is malformed, or it has expired.
   */
  verifySignedToken(token) {
    const [body, signature, extra] = String(token).split('.');
    if (!body || !signature || extra !== undefined) return null;

    const expected = Buffer.from(this.sign(body));
    const given = Buffer.from(signature);
    // Constant-time comparison: doesn't reveal how much of a forged signature was right.
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

    let payload;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
    if (typeof payload.e !== 'number' || payload.e < Math.floor(Date.now() / 1000)) return null;

    try {
      return { ...payload, filePath: this.pathFor(payload.k) };
    } catch {
      return null;
    }
  }

  sign(body) {
    return createHmac('sha256', this.signingSecret).update(body).digest('base64url');
  }
}
