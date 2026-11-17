"""Provision synthetic participants after starting the isolated Synapse server."""
import argparse
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import urllib.request
import yaml

parser = argparse.ArgumentParser(); parser.add_argument('--state', required=True); args = parser.parse_args()
os.umask(0o077)
root = Path(args.state).resolve(); config = yaml.safe_load((root / 'homeserver.yaml').read_text())
if (root / 'credentials.json').exists():
    raise SystemExit('Fixtures already exist. Reuse them; this command does not reset accounts or room history.')
if config['server_name'] != 'omniguard.local' or config['enable_registration'] is not False:
    raise SystemExit('Use the private OmniGuard lab configuration.')
base = 'http://127.0.0.1:8998'
def request(route, body=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token: headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(base + route, data=None if body is None else json.dumps(body).encode(), headers=headers)
    with urllib.request.urlopen(req, timeout=15) as response: return json.load(response)
users = {}
for name in ['alice', 'bob', 'outsider']:
    password = secrets.token_urlsafe(32)
    nonce = request('/_synapse/admin/v1/register')['nonce']
    mac = hmac.new(config['registration_shared_secret'].encode(), '\0'.join([nonce, name, password, 'notadmin']).encode(), hashlib.sha1).hexdigest()
    request('/_synapse/admin/v1/register', {'nonce': nonce, 'username': name, 'password': password, 'admin': False, 'mac': mac})
    users[name] = {'username': name, 'password': password}
session = request('/_matrix/client/v3/login', {'type': 'm.login.password', 'identifier': {'type': 'm.id.user', 'user': 'alice'}, 'password': users['alice']['password'], 'initial_device_display_name': 'OmniGuard room setup'})
try:
    room = request('/_matrix/client/v3/createRoom', {'name': 'OmniGuard · Synthetic incident exercise', 'preset': 'private_chat', 'visibility': 'private', 'invite': ['@bob:omniguard.local'], 'creation_content': {'m.federate': False}, 'initial_state': [
        {'type': 'm.room.encryption', 'state_key': '', 'content': {'algorithm': 'm.megolm.v1.aes-sha2'}},
        {'type': 'm.room.history_visibility', 'state_key': '', 'content': {'history_visibility': 'joined'}},
    ]}, session['access_token'])
finally:
    request('/_matrix/client/v3/logout', {}, session['access_token'])
(root / 'credentials.json').write_text(json.dumps({'baseUrl': base, 'users': users, 'roomId': room['room_id']}, indent=2) + '\n')
print('Synthetic users and encrypted room created. Credentials remain in the owner-only state directory.')
