/**
 * Real file contents for upload tests. Type detection reads the bytes, so the samples
 * must start with each format's genuine "magic bytes".
 */
export const SAMPLES = {
  // A complete 1×1 pixel PNG image.
  png: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  ),
  pdf: Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << >>\n%%EOF\n'),
  // A Windows executable starts with "MZ"; file-type also checks the PE header.
  exe: Buffer.concat([
    Buffer.from('MZ'),
    Buffer.alloc(58),
    Buffer.from([0x40, 0, 0, 0]), // offset of the PE header = 64
    Buffer.from('PE\0\0'),
    Buffer.alloc(200),
  ]),
  // Old Office (.doc/.xls/.ppt) container header.
  cfb: Buffer.concat([
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    Buffer.alloc(504),
  ]),
  text: Buffer.from('Hello, CloudDrive!\n'),
  // NUL bytes: not text, whatever its name says.
  binaryJunk: Buffer.from([0x01, 0x00, 0xff, 0x00, 0x13, 0x37, 0x00, 0x00]),
};

/**
 * Uploads files through the API.
 *   await upload(alice, [{ content: SAMPLES.png, name: 'a.png' }], { folderId })
 */
export function upload(client, files, { folderId } = {}) {
  const req = client.post('/api/files/upload');
  if (folderId) req.field('folderId', folderId);
  for (const { content, name } of files) req.attach('files', content, name);
  return req;
}

/** Uploads one file and returns its DTO (fails the test if the upload didn't work). */
export async function uploadOne(client, content, name, options) {
  const res = await upload(client, [{ content, name }], options);
  if (res.status !== 201) throw new Error(`Upload failed: ${JSON.stringify(res.body)}`);
  return res.body.data.uploaded[0];
}
