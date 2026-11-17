import { createClient, ClientEvent, SyncState } from 'matrix-js-sdk';

const trusted = new WeakMap();
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
// Child SDK loggers do not inherit the global logger's level. Never log message/key payloads.
export const privateLogger = Object.freeze({ trace() {}, debug() {}, info() {}, warn() {}, error() {}, getChild() { return privateLogger; } });

export async function connect(session, baseUrl) {
  const url = new URL(baseUrl);
  requireThat(url.origin === 'http://127.0.0.1:8998', 'This development client only connects to the local fixture server.');
  const client = createClient({ baseUrl, userId: session.user_id, deviceId: session.device_id, accessToken: session.access_token, logger: privateLogger });
  await client.initRustCrypto({ useIndexedDB: false });
  client.getCrypto().globalBlacklistUnverifiedDevices = true;
  client.getCrypto().setTrustCrossSignedDevices(false);
  trusted.set(client, new Map());
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { client.off(ClientEvent.Sync, changed); reject(new Error('Matrix sync did not become ready.')); }, 20000);
    function changed(state) { if (state === SyncState.Prepared || state === SyncState.Syncing) { clearTimeout(timeout); client.off(ClientEvent.Sync, changed); resolve(); } }
    client.on(ClientEvent.Sync, changed);
  });
  client.startClient({ initialSyncLimit: 30 });
  try { await ready; } catch (e) { client.stopClient(); throw e; }
  return client;
}

export async function devices(client, participants) {
  const fresh = await client.downloadKeysForUsers(participants);
  requireThat(!Object.keys(fresh.failures || {}).length, 'Device information is incomplete. Try again after sync.');
  const own = await client.getCrypto().getOwnDeviceKeys();
  const list = [];
  for (const userId of participants) {
    const keys = fresh.device_keys?.[userId] || {};
    requireThat(Object.keys(keys).length > 0, 'A participant has no encryption device yet. Open their fixture session first.');
    for (const [deviceId, device] of Object.entries(keys)) {
      const fingerprint = device.keys?.[`ed25519:${deviceId}`];
      requireThat(typeof fingerprint === 'string', 'A participant device is missing its fingerprint.');
      const self = userId === client.getUserId() && deviceId === client.getDeviceId();
      const verified = self ? fingerprint === own.ed25519 : trusted.get(client)?.get(`${userId}|${deviceId}`) === fingerprint;
      list.push({ userId, deviceId, fingerprint, self, verified });
    }
  }
  return list;
}

export async function verifyDevice(client, participants, userId, deviceId, comparison) {
  requireThat(participants.includes(userId), 'This person is not an expected participant.');
  const device = (await devices(client, participants)).find(d => d.userId === userId && d.deviceId === deviceId);
  requireThat(device && !device.self && comparison.trim() === device.fingerprint, 'Fingerprints do not match. Compare with the other device through a trusted channel.');
  const known = (await client.getCrypto().getUserDeviceInfo([userId], true)).get(userId)?.get(deviceId);
  requireThat(known?.getFingerprint() === device.fingerprint, 'Device keys are still syncing or changed. Refresh the device list.');
  await client.getCrypto().setDeviceVerified(userId, deviceId, true);
  trusted.get(client).set(`${userId}|${deviceId}`, device.fingerprint);
}

export async function assertRoomPolicy(client, roomId, participants) {
  const state = await client.roomState(roomId);
  const get = type => state.find(e => e.type === type && e.state_key === '')?.content;
  requireThat(get('m.room.encryption')?.algorithm === 'm.megolm.v1.aes-sha2', 'Sending blocked: this room is not using the required encryption.');
  requireThat(get('m.room.join_rules')?.join_rule === 'invite', 'Sending blocked: the room is not invite-only.');
  requireThat(get('m.room.history_visibility')?.history_visibility === 'joined', 'Sending blocked: room history visibility changed.');
  const joined = state.filter(e => e.type === 'm.room.member' && ['join', 'invite'].includes(e.content.membership)).map(e => e.state_key).sort();
  requireThat(JSON.stringify(joined) === JSON.stringify([...participants].sort()), 'Sending blocked: the participant list changed.');
  requireThat(state.filter(e => e.type === 'm.room.member' && e.content.membership === 'join').length === participants.length, 'Wait for both expected participants to join.');
  const list = await devices(client, participants);
  requireThat(list.every(d => d.verified), 'Sending blocked: compare and verify every participant device first.');
  return list;
}

export async function sendProtected(client, roomId, participants, body) {
  requireThat(typeof body === 'string' && body.trim().length > 0 && body.length <= 4000, 'Write a message between 1 and 4,000 characters.');
  return sendProtectedContent(client, roomId, participants, { msgtype: 'm.text', body: body.trim() });
}

export async function sendProtectedContent(client, roomId, participants, content) {
  await assertRoomPolicy(client, roomId, participants);
  requireThat(await client.getCrypto().isEncryptionEnabledInRoom(roomId), 'Encryption state is still syncing. Try again.');
  return client.sendMessage(roomId, content);
}
