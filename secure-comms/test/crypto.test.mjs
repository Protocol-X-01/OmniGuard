import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient, MatrixEvent } from 'matrix-js-sdk';
import { logger } from 'matrix-js-sdk/lib/logger.js';
import { connect, devices, verifyDevice, sendProtected, privateLogger } from '../src/secure-client.js';
import { sendTransfer, receiveTransfer, mediaDownloadUrl } from '../src/secure-transfer.js';
logger.setLevel('silent');
const stateDir = process.env.OMNIGUARD_LAB_STATE;
const waitFor = async (fn, limit = 15000) => { const until = Date.now() + limit; let last; while (Date.now() < until) { try { const value = await fn(); if (value) return value; } catch (e) { last = e; } await new Promise(r => setTimeout(r, 250)); } throw last || new Error('Timed out awaiting Matrix sync.'); };

test('real Matrix encryption, recipient decryption and fail-closed trust boundaries', { skip: !stateDir, timeout: 90000 }, async () => {
  const config = JSON.parse(await readFile(path.join(stateDir, 'credentials.json'))), clients = [];
  const users = ['@alice:omniguard.local', '@bob:omniguard.local'];
  async function login(name, crypto = true) {
    const raw = createClient({ baseUrl: config.baseUrl, logger: privateLogger });
    const user = config.users[name];
    const session = await raw.login('m.login.password', { identifier: { type: 'm.id.user', user: user.username }, password: user.password, initial_device_display_name: 'OmniGuard automated synthetic test' });
    const client = crypto ? await connect(session, config.baseUrl) : createClient({ baseUrl: config.baseUrl, userId: session.user_id, deviceId: session.device_id, accessToken: session.access_token, logger: privateLogger });
    clients.push(client); return client;
  }
  try {
    const alice = await login('alice'), bob = await login('bob');
    await bob.joinRoom(config.roomId);
    await waitFor(() => alice.getRoom(config.roomId)?.getJoinedMembers().length === 2 && bob.getRoom(config.roomId)?.getJoinedMembers().length === 2);
    await waitFor(async () => (await devices(alice, users)).length >= 2);
    await assert.rejects(sendProtected(alice, config.roomId, users, 'Blocked before verification'), /verify/);
    const single = new File([new Uint8Array([0, 1, 255, 90])], 'synthetic-evidence.bin');
    await assert.rejects(sendTransfer(alice, config.roomId, users, [single]), /verify/);
    for (const [from, to] of [[alice, bob], [bob, alice]]) {
      const fingerprint = (await to.getCrypto().getOwnDeviceKeys()).ed25519;
      await assert.rejects(verifyDevice(from, users, to.getUserId(), to.getDeviceId(), 'wrong'), /do not match/);
      await waitFor(async () => { await verifyDevice(from, users, to.getUserId(), to.getDeviceId(), fingerprint); return true; });
    }
    const cryptoApi = alice.getCrypto(), checkEncryption = cryptoApi.isEncryptionEnabledInRoom.bind(cryptoApi);
    cryptoApi.isEncryptionEnabledInRoom = async () => false;
    await assert.rejects(sendProtected(alice, config.roomId, users, 'Must not send while local encryption is unavailable'), /still syncing/);
    await assert.rejects(sendTransfer(alice, config.roomId, users, [single]), /still syncing/);
    cryptoApi.isEncryptionEnabledInRoom = checkEncryption;
    const plain = `Synthetic response acknowledged ${Date.now()}`;
    const sent = await sendProtected(alice, config.roomId, users, plain);
    const wire = await bob.fetchRoomEvent(config.roomId, sent.event_id);
    assert.equal(wire.type, 'm.room.encrypted'); assert.equal(wire.content.algorithm, 'm.megolm.v1.aes-sha2');
    assert.equal(JSON.stringify(wire).includes(plain), false); assert.equal(wire.content.body, undefined);
    const event = new MatrixEvent(wire);
    await waitFor(async () => { await bob.decryptEventIfNeeded(event); return event.getContent().body === plain; });
    const outsider = await login('outsider', false);
    await assert.rejects(outsider.joinRoom(config.roomId));
    await assert.rejects(outsider.fetchRoomEvent(config.roomId, sent.event_id));
    const originalUpload = alice.uploadContent.bind(alice);
    let mediaMetadataHidden = false;
    alice.uploadContent = async (blob, opts) => {
      mediaMetadataHidden = opts.includeFilename === false && opts.type === 'application/octet-stream' && blob.type === 'application/octet-stream';
      return originalUpload(blob, opts);
    };
    const nested = new File(['nested synthetic fixture'], 'notes.txt');
    Object.defineProperty(nested, 'webkitRelativePath', { value: 'incident/evidence/notes.txt' });
    for (const files of [[single], [nested, new File([], 'empty.txt')]]) {
      const transfer = await sendTransfer(alice, config.roomId, users, files);
      const raw = await bob.fetchRoomEvent(config.roomId, transfer.event_id);
      assert.equal(raw.type, 'm.room.encrypted');
      assert.equal(JSON.stringify(raw).includes('notes.txt'), false);
      assert.equal(JSON.stringify(raw).includes('synthetic-evidence.bin'), false);
      const message = new MatrixEvent({ ...raw, room_id: config.roomId });
      await waitFor(async () => { await bob.decryptEventIfNeeded(message); return message.getType() === 'm.room.message'; });
      const received = await receiveTransfer(bob, config.roomId, users, message);
      assert.equal(received.files.length, files.length);
      for (let i = 0; i < files.length; i++) {
        assert.equal(received.files[i].path, files[i].webkitRelativePath || files[i].name);
        assert.equal(Buffer.from(received.files[i].data).equals(Buffer.from(await files[i].arrayBuffer())), true);
      }
      const mediaUrl = mediaDownloadUrl(message.getContent().file.url);
      assert.equal((await fetch(mediaUrl)).status, 401);
      // Authenticated media can be fetched by an outsider with its URI; ciphertext access is not key access.
      const outsiderMedia = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${outsider.getAccessToken()}` } });
      assert.equal(outsiderMedia.status, 200);
      const opaque = Buffer.from(await outsiderMedia.arrayBuffer());
      assert.equal(opaque.includes(Buffer.from('nested synthetic fixture')), false);
      assert.equal(opaque.includes(Buffer.from('notes.txt')), false);
      await assert.rejects(outsider.fetchRoomEvent(config.roomId, transfer.event_id));
      const api = bob.getCrypto(), originalProvenance = api.getEncryptionInfoForEvent.bind(api);
      api.getEncryptionInfoForEvent = async () => ({ shieldColour: 2, shieldReason: 4 });
      try { await assert.rejects(receiveTransfer(bob, config.roomId, users, message), /authenticity/); }
      finally { api.getEncryptionInfoForEvent = originalProvenance; }
      let provenanceChecks = 0;
      api.getEncryptionInfoForEvent = async e => ++provenanceChecks === 1 ? originalProvenance(e) : ({ shieldColour: 2, shieldReason: 4 });
      try {
        await assert.rejects(receiveTransfer(bob, config.roomId, users, message), /authenticity/);
        assert.equal(provenanceChecks, 2);
      } finally { api.getEncryptionInfoForEvent = originalProvenance; }
    }
    assert.equal(mediaMetadataHidden, true);
    let published = 0; const originalSend = alice.sendMessage.bind(alice);
    alice.sendMessage = async (...args) => { published++; return originalSend(...args); };
    alice.uploadContent = async () => { throw new Error('Synthetic upstream failure'); };
    await assert.rejects(sendTransfer(alice, config.roomId, users, [single]), /No transfer key was sent/);
    assert.equal(published, 0);
    alice.uploadContent = async (...args) => {
      const result = await originalUpload(...args);
      await alice.invite(config.roomId, outsider.getUserId());
      return result;
    };
    await assert.rejects(sendTransfer(alice, config.roomId, users, [single]), /not confirmed/);
    assert.equal(published, 0);
    await alice.kick(config.roomId, outsider.getUserId(), 'Synthetic transfer membership test complete');
    alice.uploadContent = originalUpload; alice.sendMessage = originalSend;
    const newDevice = await login('bob');
    await waitFor(async () => (await devices(alice, users)).some(d => d.deviceId === newDevice.getDeviceId()));
    await assert.rejects(sendProtected(alice, config.roomId, users, 'Blocked for new device'), /verify/);
    await assert.rejects(sendTransfer(alice, config.roomId, users, [single]), /verify/);
    await newDevice.logout(); newDevice.stopClient(); clients.splice(clients.indexOf(newDevice), 1);
    await alice.invite(config.roomId, outsider.getUserId());
    await assert.rejects(sendProtected(alice, config.roomId, users, 'Blocked for changed recipients'), /participant list changed/);
    await assert.rejects(sendTransfer(alice, config.roomId, users, [single]), /participant list changed/);
    await alice.kick(config.roomId, outsider.getUserId(), 'Synthetic membership boundary test complete');
    const receipt = { measuredAt: new Date().toISOString(), server: 'Synapse 1.165.0 on numeric loopback', sdk: 'matrix-js-sdk 45.1.0', crypto: alice.getCrypto().getVersion(), encryptedWireEvent: true, intendedRecipientDecrypted: true, plaintextAbsentFromWire: true, outsiderJoinDenied: true, outsiderReadDenied: true, wrongFingerprintRejected: true, unverifiedDeviceBlocked: true, changedMembershipBlocked: true, unavailableLocalEncryptionBlocked: true, fixtureOnly: true, physicalMobileTested: false };
    await writeFile(path.join(stateDir, 'acceptance.json'), JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
    await writeFile(path.join(stateDir, 'transfer-acceptance.json'), JSON.stringify({
      measuredAt: new Date().toISOString(), fixtureOnly: true, singleFileRoundTrip: true, nestedFolderRoundTrip: true,
      filenamesAbsentFromWire: true, ciphertextMedia: true, uploadFilenameOmitted: mediaMetadataHidden,
      authenticatedMediaRequired: true, outsiderMayReadCiphertextWithUri: true, outsiderKeyEventDenied: true,
      unverifiedDeviceBlocked: true, membershipChangeAfterUploadBlocked: true, uploadFailurePublishesNoKey: true,
      senderProvenanceCheckedBeforeAndAfterDownload: true, unavailableEncryptionBlocksTransfer: true,
      browserPickerTested: false, physicalMobileTested: false, productionReady: false,
    }, null, 2) + '\n', { mode: 0o600 });
  } finally {
    for (const client of clients) { try { await client.logout(); } catch {} client.stopClient(); }
  }
});
