import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { unzipSync } from 'fflate';
import { packFiles, unpackFiles, inspectSelection, safePath, createDownload, LIMITS, MAX_BUNDLE_BYTES } from '../src/transfer-bundle.js';
import { encryptBundle, decryptBundle, mediaDownloadUrl, readBounded, receiveTransfer } from '../src/secure-transfer.js';

function file(path, bytes) {
  const f = new File([bytes], path.split('/').at(-1));
  Object.defineProperty(f, 'webkitRelativePath', { value: path }); return f;
}
function rawBundle(manifest, data = new Uint8Array()) {
  const header = new TextEncoder().encode(JSON.stringify(manifest));
  const bytes = new Uint8Array(12 + header.length + data.length);
  bytes.set(new TextEncoder().encode('OGBNDL1\n')); new DataView(bytes.buffer).setUint32(8, header.length);
  bytes.set(header, 12); bytes.set(data, 12 + header.length); return bytes;
}
const emptyHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

test('single binary file survives Matrix encryption and keeps original bytes/name', async () => {
  const binary = new Uint8Array([0, 255, 1, 8, 0, 199]);
  const plain = await packFiles([new File([binary], 'evidence.bin')]);
  const a = await encryptBundle(plain), b = await encryptBundle(plain);
  assert.equal(Buffer.from(a.ciphertext).includes(Buffer.from('evidence.bin')), false);
  assert.equal(Buffer.from(a.ciphertext).equals(Buffer.from(b.ciphertext)), false);
  const restored = await decryptBundle(a.ciphertext, a.info), download = createDownload(restored);
  assert.equal(download.name, 'evidence.bin'); assert.deepEqual(download.bytes, binary);
});

test('nested folder paths, Unicode and zero-byte files survive and produce a standard ZIP', async () => {
  const data = [file('case/notes/overview.txt', 'synthetic'), file('case/café/empty.txt', '')];
  const unpacked = await unpackFiles(await packFiles(data));
  assert.deepEqual(unpacked.files.map(f => f.path), data.map(f => f.webkitRelativePath));
  const download = createDownload(unpacked), zip = unzipSync(download.bytes);
  assert.equal(download.name, 'omniguard-files.zip');
  assert.equal(new TextDecoder().decode(zip['case/notes/overview.txt']), 'synthetic');
  assert.equal(zip['case/café/empty.txt'].length, 0);
});

test('paths reject traversal, alternate streams, unsafe display and cross-platform ambiguities', () => {
  for (const path of ['../secret', '/etc/passwd', 'a/../b', 'a//b', './a', 'C:/a', 'a\\b', 'a\0b', 'a\u202eb', 'a\nb', 'a.', 'a ', 'CON.txt', 'x/LPT1', 'x/COM¹.txt', 'a:b', 'a?b', 'cafe\u0301.txt', 'a/'.repeat(17) + 'b', 'x'.repeat(129)]) {
    assert.throws(() => safePath(path), undefined, path);
  }
  assert.equal(safePath('case/notes/café.txt'), 'case/notes/café.txt');
});

test('selection rejects case collisions, prefix collisions, over-count and over-size before reading files', () => {
  for (const paths of [['A.txt', 'a.txt'], ['a', 'a/b.txt'], ['A/b.txt', 'a']]) {
    assert.throws(() => inspectSelection(paths.map(path => file(path, ''))), /conflict|Duplicate/);
  }
  assert.throws(() => inspectSelection([]), /Choose/);
  assert.throws(() => inspectSelection(Array.from({ length: 101 }, (_, i) => new File([], `${i}.txt`))), /Choose/);
  assert.throws(() => inspectSelection([{ name: 'big.bin', size: LIMITS.bytes + 1 }]), /10 MiB/);
  assert.throws(() => inspectSelection([{ name: 'bad.bin', size: -1 }]), /size/);
  assert.throws(() => inspectSelection({ length: 1000000, [Symbol.iterator]() { throw new Error('Must not enumerate oversized selection'); } }), /Choose/);
});

test('a file changing size during selection cannot be sent as the reviewed transfer', async () => {
  await assert.rejects(packFiles([{ name: 'changed.bin', size: 1, arrayBuffer: async () => new ArrayBuffer(2) }]), /changed while being read/);
});

test('receiver independently rejects malicious manifests and path collisions', async () => {
  const entry = path => ({ path, size: 0, sha256: emptyHash });
  for (const manifest of [
    { version: 2, files: [entry('a')] }, { version: 1, files: [entry('a')], extra: true },
    { version: 1, files: [entry('../a')] }, { version: 1, files: [entry('A'), entry('a')] },
    { version: 1, files: [entry('a/b'), entry('a')] },
    { version: 1, files: [{ ...entry('a'), symlink: '/etc/passwd' }] },
    { version: 1, files: [{ ...entry('a'), size: Number.MAX_SAFE_INTEGER }] },
    { version: 1, files: [{ ...entry('a'), sha256: 'bad' }] },
    { version: 1, files: Array.from({ length: 101 }, (_, i) => entry(`${i}`)) },
  ]) await assert.rejects(unpackFiles(rawBundle(manifest)));
});

test('extra bytes, truncation, invalid UTF-8, overlong headers and file hash mismatch fail closed', async () => {
  const good = await packFiles([new File(['synthetic'], 'a.txt')]);
  const wrong = good.slice(); wrong[wrong.length - 1] ^= 1;
  for (const bytes of [good.slice(0, 11), good.slice(0, -1), new Uint8Array([...good, 0]), wrong]) await assert.rejects(unpackFiles(bytes));
  const long = good.slice(); new DataView(long.buffer).setUint32(8, LIMITS.manifest + 1);
  await assert.rejects(unpackFiles(long), /manifest length/);
  const encoding = good.slice(); encoding[12] = 255;
  await assert.rejects(unpackFiles(encoding), /encoding/);
  await assert.rejects(unpackFiles(new Uint8Array(MAX_BUNDLE_BYTES + 1)), /oversized/);
});

test('ciphertext corruption, replacement keys and changed IVs never produce downloads', async () => {
  const plain = await packFiles([new File(['synthetic evidence'], 'report.txt')]);
  const sealed = await encryptBundle(plain), other = await encryptBundle(plain);
  const corrupt = sealed.ciphertext.slice(); corrupt[corrupt.length - 1] ^= 1;
  await assert.rejects(decryptBundle(corrupt, sealed.info), /verification failed/);
  await assert.rejects(decryptBundle(sealed.ciphertext, { ...sealed.info, key: other.info.key }), /verification failed/);
  await assert.rejects(decryptBundle(sealed.ciphertext, { ...sealed.info, iv: other.info.iv }), /verification failed/);
  await assert.rejects(decryptBundle(sealed.ciphertext, { ...sealed.info, v: 'v1' }), /Unsupported/);
});

test('foreign, credential-bearing and malformed media addresses are rejected', () => {
  for (const uri of ['https://evil.example/file', 'mxc://elsewhere/abc', 'mxc://omniguard.local/../abc', 'mxc://omniguard.local/a?access_token=secret', 'mxc://omniguard.local/a%2fb', 'mxc://user@omniguard.local/a', undefined]) assert.throws(() => mediaDownloadUrl(uri), /local fixture/);
  assert.equal(mediaDownloadUrl('mxc://omniguard.local/Abc_123-'), 'http://127.0.0.1:8998/_matrix/client/v1/media/download/omniguard.local/Abc_123-');
});

test('real HTTP stream rejects excessive, truncated, unavailable and redirected responses', async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/unavailable') { res.writeHead(503); res.end(); return; }
    if (req.url === '/redirect') { res.writeHead(307, { Location: '/ok' }); res.end(); return; }
    if (req.url === '/wrong-header') { res.writeHead(200, { 'Content-Length': 128 }); res.end(Buffer.alloc(128)); return; }
    res.writeHead(200, { 'Transfer-Encoding': 'chunked' }); res.write(Buffer.alloc(req.url === '/small' ? 12 : req.url === '/big' ? 65 : 64)); res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await readBounded(await fetch(base + '/ok'), 64)).length, 64);
    for (const route of ['/small', '/big', '/unavailable', '/wrong-header']) await assert.rejects(readBounded(await fetch(base + route), 64));
    await assert.rejects(fetch(base + '/redirect', { redirect: 'error' }));
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('plaintext events and wrong-room transfers fail before any network or decryption', async () => {
  const event = { getRoomId: () => '!room', getWireType: () => 'm.room.message', getSender: () => '@alice' };
  await assert.rejects(receiveTransfer({}, '!room', ['@alice'], event), /protected room/);
  await assert.rejects(receiveTransfer({}, '!other', ['@alice'], { ...event, getWireType: () => 'm.room.encrypted' }), /protected room/);
});
