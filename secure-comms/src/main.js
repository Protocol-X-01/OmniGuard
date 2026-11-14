import { RoomEvent, MatrixEventEvent } from 'matrix-js-sdk';
import { logger } from 'matrix-js-sdk/lib/logger.js';
import { connect, devices, verifyDevice, assertRoomPolicy, sendProtected } from './secure-client.js';
logger.setLevel('silent');
const $ = s => document.querySelector(s);
const node = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
let config, client, busy = false, ready = false;
const rendered = new Set();
function notice(text, error = false) { $('#notice').textContent = text; $('#notice').className = `notice${error ? ' error' : ''}`; }
function controls() { document.querySelectorAll('button').forEach(b => b.disabled = busy); $('#send').disabled = busy || !ready; }
async function run(fn) { if (busy) return; busy = true; controls(); try { await fn(); } catch (e) { notice(e.message || 'The local action could not be completed.', true); } finally { busy = false; controls(); } }
async function refreshDevices() {
  ready = false; controls();
  const rows = await devices(client, config.participants); $('#devices').replaceChildren();
  for (const device of rows) {
    const card = node('div', undefined, 'device');
    card.append(node('strong', `${device.userId.split(':')[0].slice(1)} · ${device.self ? 'This device' : device.deviceId}`));
    const code = node('code', device.fingerprint); code.setAttribute('aria-label', device.self ? 'This device fingerprint' : `Fingerprint ${device.deviceId}`); card.append(code);
    card.append(node('span', device.verified ? 'Device verified' : 'Compare fingerprint', device.verified ? 'verified' : 'pending'));
    if (!device.verified) {
      const input = node('input'); input.id = `verify-${device.deviceId}`; input.autocomplete = 'off'; input.spellcheck = false;
      const label = node('label', `Fingerprint from ${device.userId.split(':')[0].slice(1)}’s device`); label.htmlFor = input.id;
      const confirm = node('button', 'Verify matching fingerprint', 'secondary');
      confirm.onclick = () => run(async () => { await verifyDevice(client, config.participants, device.userId, device.deviceId, input.value); await refreshDevices(); notice('Fingerprint matched and this device is now verified for this session.'); });
      card.append(label, input, confirm);
    }
    $('#devices').append(card);
  }
  try { await assertRoomPolicy(client, config.roomId, config.participants); ready = true; $('#protection').textContent = 'Encrypted · Devices verified'; }
  catch (e) { $('#protection').textContent = 'Verification needed'; notice(e.message); }
  controls();
}
async function showEvent(event, room) {
  if (room?.roomId !== config.roomId || rendered.has(event.getId())) return;
  if (event.getWireType() !== 'm.room.encrypted') return;
  try { await client.decryptEventIfNeeded(event); } catch { return; }
  if (event.isDecryptionFailure()) { event.once(MatrixEventEvent.Decrypted, () => showEvent(event, room)); return; }
  if (event.getType() !== 'm.room.message' || event.getContent().msgtype !== 'm.text') return;
  // Recheck after asynchronous decryption: timeline and key events may race.
  if (rendered.has(event.getId())) return;
  rendered.add(event.getId()); $('#messages .empty')?.remove();
  const message = node('article', undefined, `message${event.getSender() === client.getUserId() ? ' mine' : ''}`);
  message.append(node('strong', event.getSender().split(':')[0].slice(1)), node('p', event.getContent().body), node('small', 'Encrypted message · decrypted on this device'));
  $('#messages').append(message); message.scrollIntoView({ block: 'nearest' });
}
$('#start').onclick = () => run(async () => {
  notice('Starting a local encrypted session…');
  const result = await fetch('/lab/session', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-OmniGuard-Lab': '1' }, body: JSON.stringify({ participant: $('#participant').value }) });
  const session = await result.json(); if (!result.ok) throw new Error(session.message);
  client = await connect(session, config.baseUrl);
  await client.joinRoom(config.roomId);
  client.on(RoomEvent.Timeline, showEvent);
  $('#identity').textContent = `${client.getUserId()} · ${client.getDeviceId()}`;
  $('#session').hidden = true; $('#workspace').hidden = false;
  await refreshDevices(); notice('Session ready. Open the other participant in a second tab and compare fingerprints.');
});
$('#refresh').onclick = () => run(refreshDevices);
$('#composer').onsubmit = e => { e.preventDefault(); run(async () => {
  const result = await sendProtected(client, config.roomId, config.participants, $('#message').value);
  $('#message').value = ''; notice('Encrypted message accepted by the server. This is not a read receipt.');
  const event = client.getRoom(config.roomId)?.findEventById(result.event_id); if (event) await showEvent(event, client.getRoom(config.roomId));
}); };
$('#end').onclick = () => run(async () => { await client.logout(); client.stopClient(); client = null; ready = false; rendered.clear(); $('#messages').replaceChildren(node('p', 'Session ended. Previous device keys are not retained.', 'empty')); $('#workspace').hidden = true; $('#session').hidden = false; notice('Session ended and sign-in token revoked.'); });
try { config = await (await fetch('/lab/config')).json(); notice('Local exercise ready. No real people or incident data.'); } catch { notice('Start the local lab server before opening this page.', true); }
