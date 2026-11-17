import { RoomEvent, MatrixEventEvent } from 'matrix-js-sdk';
import { logger } from 'matrix-js-sdk/lib/logger.js';
import { connect, devices, verifyDevice, assertRoomPolicy, sendProtected } from './secure-client.js';
import { inspectSelection, createDownload } from './transfer-bundle.js';
import { sendTransfer, receiveTransfer, isTransfer } from './secure-transfer.js';
logger.setLevel('silent');
const $ = s => document.querySelector(s);
const node = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
let config, client, busy = false, ready = false;
const rendered = new Set();
const downloads = new Set();
let selectedFiles = [];
function notice(text, error = false) { $('#notice').textContent = text; $('#notice').className = `notice${error ? ' error' : ''}`; }
function controls() {
  document.querySelectorAll('button').forEach(b => b.disabled = busy);
  $('#send').disabled = busy || !ready;
  $('#transfer-send').disabled = busy || !ready || !selectedFiles.length;
  $('#transfer-files').disabled = busy; $('#transfer-folder').disabled = busy;
}
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
  if (event.getType() !== 'm.room.message' || !config.participants.includes(event.getSender())) return;
  const content = event.getContent();
  if (content.msgtype !== 'm.text' && !isTransfer(content)) return;
  // Recheck after asynchronous decryption: timeline and key events may race.
  if (rendered.has(event.getId())) return;
  rendered.add(event.getId()); $('#messages .empty')?.remove();
  const message = node('article', undefined, `message${event.getSender() === client.getUserId() ? ' mine' : ''}`);
  message.append(node('strong', event.getSender().split(':')[0].slice(1)));
  if (isTransfer(content)) {
    message.append(node('p', 'Encrypted files or folder'), node('small', 'Verify the transfer before saving. Content is not malware-scanned.'));
    const verify = node('button', 'Verify transfer', 'secondary');
    verify.onclick = () => run(async () => {
      const verified = await receiveTransfer(client, config.roomId, config.participants, event);
      const download = createDownload(verified);
      const list = node('ul', undefined, 'transfer-list');
      for (const file of verified.files) list.append(node('li', `${file.path} · ${file.size.toLocaleString()} bytes`));
      const link = node('a', `Save verified copy · ${download.name}`, 'download');
      link.href = URL.createObjectURL(new Blob([download.bytes], { type: 'application/octet-stream' }));
      link.download = download.name; downloads.add(link.href);
      verify.replaceWith(node('p', `${verified.files.length} files · integrity verified`), list, link);
      notice('Transfer integrity verified on this device. Choose Save verified copy to download; no files were opened or extracted.');
    });
    message.append(verify);
  } else message.append(node('p', content.body), node('small', 'Encrypted message · decrypted on this device'));
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
function clearSelection() {
  selectedFiles = []; $('#transfer-files').value = ''; $('#transfer-folder').value = '';
  $('#transfer-selection').replaceChildren(node('p', 'No files selected.', 'muted')); controls();
}
for (const id of ['transfer-files', 'transfer-folder']) {
  $(`#${id}`).onchange = () => {
    try {
      const picked = $(`#${id}`).files;
      if (!picked.length) { clearSelection(); return; }
      const summary = inspectSelection(picked);
      selectedFiles = Array.from(picked);
      $(`#${id === 'transfer-files' ? 'transfer-folder' : 'transfer-files'}`).value = '';
      if (!selectedFiles.length) { clearSelection(); return; }
      const list = node('ul', undefined, 'transfer-list');
      for (const file of summary.entries) list.append(node('li', `${file.path} · ${file.size.toLocaleString()} bytes`));
      $('#transfer-selection').replaceChildren(node('p', `${summary.entries.length} files · ${summary.total.toLocaleString()} bytes. Review every path before sending.`), list);
      controls();
    } catch (e) { clearSelection(); notice(e.message, true); }
  };
}
$('#transfer-clear').onclick = clearSelection;
$('#transfer-send').onclick = () => run(async () => {
  notice('Checking devices, encrypting and uploading the selected files…');
  const result = await sendTransfer(client, config.roomId, config.participants, selectedFiles);
  clearSelection(); notice('Encrypted transfer accepted by the server. The recipient still needs to verify and save it.');
  const event = client.getRoom(config.roomId)?.findEventById(result.event_id); if (event) await showEvent(event, client.getRoom(config.roomId));
});
$('#composer').onsubmit = e => { e.preventDefault(); run(async () => {
  const result = await sendProtected(client, config.roomId, config.participants, $('#message').value);
  $('#message').value = ''; notice('Encrypted message accepted by the server. This is not a read receipt.');
  const event = client.getRoom(config.roomId)?.findEventById(result.event_id); if (event) await showEvent(event, client.getRoom(config.roomId));
}); };
$('#end').onclick = () => run(async () => {
  await client.logout(); client.stopClient(); client = null; ready = false; rendered.clear();
  for (const url of downloads) URL.revokeObjectURL(url); downloads.clear(); clearSelection();
  $('#messages').replaceChildren(node('p', 'Session ended. Previous device keys are not retained.', 'empty'));
  $('#workspace').hidden = true; $('#session').hidden = false; notice('Session ended and sign-in token revoked. Saved file copies remain on your device.');
});
try { config = await (await fetch('/lab/config')).json(); notice('Local exercise ready. No real people or incident data.'); } catch { notice('Start the local lab server before opening this page.', true); }
