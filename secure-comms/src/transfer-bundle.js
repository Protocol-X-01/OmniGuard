import { zipSync } from 'fflate';

export const LIMITS = Object.freeze({ files: 100, bytes: 10 * 1024 * 1024, manifest: 256 * 1024, pathBytes: 512, depth: 16 });
export const MAX_BUNDLE_BYTES = LIMITS.bytes + LIMITS.manifest + 12;
export const BUNDLE_TYPE = 'application/vnd.omniguard.bundle';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const magic = encoder.encode('OGBNDL1\n');
const check = (ok, message) => { if (!ok) throw new Error(message); };
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');

export function safePath(path) {
  check(typeof path === 'string' && path && path === path.normalize('NFC') && encoder.encode(path).length <= LIMITS.pathBytes, 'Invalid or overlong transfer path.');
  check(!/[\\\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069<>:"|?*]/u.test(path), 'Unsafe character in transfer path.');
  const parts = path.split('/');
  check(parts.length <= LIMITS.depth, 'Transfer path exceeds the folder depth limit.');
  for (const part of parts) {
    check(part && part !== '.' && part !== '..' && !/[. ]$/.test(part) && encoder.encode(part).length <= 128, 'Unsafe path component.');
    check(!/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(part), 'Reserved device name in transfer path.');
  }
  return path;
}

function checkEntries(entries, hashed = false) {
  check(Array.isArray(entries) && entries.length > 0 && entries.length <= LIMITS.files, `Choose between 1 and ${LIMITS.files} files.`);
  const names = new Set(), directories = new Set();
  let total = 0;
  for (const entry of entries) {
    if (hashed) check(exactKeys(entry, ['path', 'size', 'sha256']) && /^[a-f0-9]{64}$/.test(entry.sha256), 'Invalid file manifest.');
    safePath(entry.path);
    check(Number.isSafeInteger(entry.size) && entry.size >= 0, 'Invalid file size.');
    total += entry.size;
    check(total <= LIMITS.bytes, 'Transfers are limited to 10 MiB of file content.');
    const name = entry.path.toLowerCase();
    check(!names.has(name) && !directories.has(name), 'Duplicate or conflicting transfer path.');
    const parts = name.split('/');
    for (let i = 1; i < parts.length; i++) {
      const directory = parts.slice(0, i).join('/');
      check(!names.has(directory), 'File and directory paths conflict.');
      directories.add(directory);
    }
    names.add(name);
  }
  return total;
}

export function inspectSelection(files) {
  check(files && Number.isSafeInteger(files.length) && files.length > 0 && files.length <= LIMITS.files, `Choose between 1 and ${LIMITS.files} files.`);
  const entries = Array.from(files || [], file => ({ path: file.webkitRelativePath || file.name, size: file.size }));
  const total = checkEntries(entries);
  return { entries, total };
}

export async function packFiles(files) {
  const { entries } = inspectSelection(files);
  const input = Array.from(files || []);
  const contents = [], manifest = { version: 1, files: [] };
  for (let i = 0; i < input.length; i++) {
    const bytes = new Uint8Array(await input[i].arrayBuffer());
    check(bytes.length === entries[i].size, 'A selected file changed while being read. Select it again.');
    manifest.files.push({ ...entries[i], sha256: await digest(bytes) });
    contents.push(bytes);
  }
  const header = encoder.encode(JSON.stringify(manifest));
  check(header.length <= LIMITS.manifest, 'Transfer manifest is too large.');
  const bytes = new Uint8Array(12 + header.length + contents.reduce((sum, data) => sum + data.length, 0));
  bytes.set(magic); new DataView(bytes.buffer).setUint32(8, header.length, false); bytes.set(header, 12);
  let offset = 12 + header.length;
  for (const data of contents) { bytes.set(data, offset); offset += data.length; }
  return bytes;
}

export async function unpackFiles(bytes) {
  check(bytes instanceof Uint8Array && bytes.length >= 12 && bytes.length <= MAX_BUNDLE_BYTES, 'Invalid or oversized transfer bundle.');
  check(magic.every((value, i) => bytes[i] === value), 'Unsupported transfer format.');
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8, false);
  check(length > 0 && length <= LIMITS.manifest && 12 + length <= bytes.length, 'Invalid transfer manifest length.');
  let manifest;
  try { manifest = JSON.parse(decoder.decode(bytes.subarray(12, 12 + length))); } catch { throw new Error('Invalid transfer manifest encoding.'); }
  check(exactKeys(manifest, ['version', 'files']) && manifest.version === 1, 'Unsupported transfer manifest.');
  const total = checkEntries(manifest.files, true);
  check(bytes.length === 12 + length + total, 'Transfer is truncated or has unexpected extra data.');
  let offset = 12 + length;
  const files = [];
  for (const entry of manifest.files) {
    const data = bytes.slice(offset, offset + entry.size); offset += entry.size;
    check(await digest(data) === entry.sha256, 'File integrity verification failed.');
    files.push({ ...entry, data });
  }
  return { files, total };
}

export function createDownload(verified) {
  checkEntries(verified.files);
  if (verified.files.length === 1 && !verified.files[0].path.includes('/')) {
    return { name: verified.files[0].path, bytes: verified.files[0].data };
  }
  const entries = Object.create(null);
  for (const file of verified.files) entries[file.path] = file.data;
  return { name: 'omniguard-files.zip', bytes: zipSync(entries, { level: 0 }) };
}
