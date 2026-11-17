import { Attachment, EncryptedAttachment, initAsync } from '@matrix-org/matrix-sdk-crypto-wasm';
import { EventShieldReason } from 'matrix-js-sdk/lib/crypto-api/index.js';
import { assertRoomPolicy, sendProtectedContent } from './secure-client.js';
import { packFiles, unpackFiles, MAX_BUNDLE_BYTES, BUNDLE_TYPE } from './transfer-bundle.js';

const check = (ok, message) => { if (!ok) throw new Error(message); };
const baseUrl = 'http://127.0.0.1:8998';
const marker = 'org.omniguard.bundle';

export function mediaDownloadUrl(uri) {
  const match = typeof uri === 'string' && /^mxc:\/\/omniguard\.local\/([A-Za-z0-9_-]{1,255})$/.exec(uri);
  check(match, 'Transfer media must belong to the local fixture server.');
  return `${baseUrl}/_matrix/client/v1/media/download/omniguard.local/${match[1]}`;
}

export async function readBounded(response, expected) {
  check(response.body, 'Encrypted transfer has no body.');
  const reader = response.body.getReader(), chunks = [];
  let length = 0;
  try {
    check(response.ok, 'Encrypted transfer is unavailable.');
    check(Number.isSafeInteger(expected) && expected >= 12 && expected <= MAX_BUNDLE_BYTES, 'Invalid encrypted transfer size.');
    const size = response.headers.get('content-length');
    if (size !== null) check(/^\d+$/.test(size) && Number(size) === expected, 'Encrypted transfer size changed.');
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      check(length <= expected, 'Encrypted transfer exceeds its declared size.');
      chunks.push(value);
    }
    check(length === expected, 'Encrypted transfer is truncated.');
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes;
  } finally { try { await reader.cancel(); } catch {} reader.releaseLock(); }
}

export async function encryptBundle(bytes) {
  check(bytes instanceof Uint8Array && bytes.length >= 12 && bytes.length <= MAX_BUNDLE_BYTES, 'Invalid transfer size.');
  await initAsync();
  const attachment = Attachment.encrypt(bytes);
  try { return { ciphertext: attachment.encryptedData, info: JSON.parse(attachment.mediaEncryptionInfo) }; }
  finally { attachment.free(); }
}

export async function decryptBundle(ciphertext, file) {
  check(ciphertext instanceof Uint8Array && ciphertext.length >= 12 && ciphertext.length <= MAX_BUNDLE_BYTES, 'Invalid transfer size.');
  check(file?.v === 'v2' && file.key?.alg === 'A256CTR', 'Unsupported attachment encryption.');
  await initAsync();
  let attachment;
  try {
    attachment = new EncryptedAttachment(ciphertext, JSON.stringify({ key: file.key, iv: file.iv, hashes: file.hashes, v: file.v }));
    return await unpackFiles(Attachment.decrypt(attachment));
  } catch { throw new Error('Transfer verification failed. No download was created.'); }
  finally { attachment?.free(); }
}

export function isTransfer(content) {
  return content?.msgtype === 'm.file' && content[marker]?.version === 1;
}

export async function sendTransfer(client, roomId, participants, files) {
  await assertRoomPolicy(client, roomId, participants);
  check(await client.getCrypto().isEncryptionEnabledInRoom(roomId), 'Encryption state is still syncing. Try again.');
  const bundle = await packFiles(files);
  const { ciphertext, info } = await encryptBundle(bundle);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  let uploaded;
  try {
    uploaded = await client.uploadContent(new Blob([ciphertext], { type: 'application/octet-stream' }), {
      type: 'application/octet-stream', includeFilename: false, abortController: controller,
    });
  } catch { throw new Error('Encrypted upload did not complete. No transfer key was sent.'); }
  finally { clearTimeout(timeout); }
  mediaDownloadUrl(uploaded.content_uri);
  // Re-check after the upload; membership/devices can change while the bytes are in flight.
  const content = { msgtype: 'm.file', body: 'OmniGuard encrypted transfer', filename: 'transfer.ogbundle',
    info: { mimetype: BUNDLE_TYPE, size: ciphertext.length }, file: { ...info, url: uploaded.content_uri }, [marker]: { version: 1 } };
  try { return await sendProtectedContent(client, roomId, participants, content); }
  catch { throw new Error('The transfer event was not confirmed. Check room policy and the conversation before retrying; encrypted media may remain on the server.'); }
}

async function assertTransferSender(client, roomId, participants, event) {
  const list = await assertRoomPolicy(client, roomId, participants);
  const senderFingerprint = event.getClaimedEd25519Key();
  check(list.some(d => d.userId === event.getSender() && d.verified && d.fingerprint === senderFingerprint), 'Transfer sender device is not verified.');
  const provenance = await client.getCrypto().getEncryptionInfoForEvent(event);
  // This lab verifies full device fingerprints directly and has no cross-signing identity.
  // Missing cross-signatures are acceptable ONLY after the exact verified-device match above.
  // Forwarded/unknown/mismatched or previously revoked verification remains a hard failure.
  check(provenance && [null, EventShieldReason.UNVERIFIED_IDENTITY, EventShieldReason.UNSIGNED_DEVICE].includes(provenance.shieldReason), 'Transfer sender authenticity could not be established.');
}

export async function receiveTransfer(client, roomId, participants, event) {
  check(event.getRoomId() === roomId && event.getWireType() === 'm.room.encrypted' && participants.includes(event.getSender()), 'Transfer is not from this protected room.');
  await client.decryptEventIfNeeded(event);
  check(!event.isDecryptionFailure() && event.getType() === 'm.room.message', 'Transfer event could not be decrypted.');
  const content = event.getContent();
  check(isTransfer(content) && !content.url && content.info?.mimetype === BUNDLE_TYPE, 'Unsupported transfer event.');
  const size = content.info.size;
  check(Number.isSafeInteger(size) && size >= 12 && size <= MAX_BUNDLE_BYTES, 'Invalid transfer size.');
  await assertTransferSender(client, roomId, participants, event);
  const url = mediaDownloadUrl(content.file?.url);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${client.getAccessToken()}` },
    credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(30000) });
  const bytes = await readBounded(response, size);
  await assertTransferSender(client, roomId, participants, event);
  return decryptBundle(bytes, content.file);
}
