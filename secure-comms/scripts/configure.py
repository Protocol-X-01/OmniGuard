"""Create an isolated local Synapse configuration. Run with the lab virtualenv."""
import argparse
import os
from pathlib import Path
import subprocess
import sys
import yaml

parser = argparse.ArgumentParser()
parser.add_argument('--state', required=True)
args = parser.parse_args()
os.umask(0o077)
state = Path(args.state).resolve()
state.mkdir(parents=True, exist_ok=True, mode=0o700)
config = state / 'homeserver.yaml'
if config.exists():
    raise SystemExit('Configuration exists; use it without overwriting keys or choose a fresh private state directory.')
subprocess.run([sys.executable, '-m', 'synapse.app.homeserver', '--server-name', 'omniguard.local', '--config-path', str(config), '--data-directory', str(state), '--generate-config', '--report-stats', 'no'], check=True, stdout=subprocess.DEVNULL)
c = yaml.safe_load(config.read_text())
c.update({
    'listeners': [{'port': 8998, 'tls': False, 'type': 'http', 'x_forwarded': False, 'bind_addresses': ['127.0.0.1'], 'resources': [{'names': ['client'], 'compress': False}]}],
    'public_baseurl': 'http://127.0.0.1:8998/', 'enable_registration': False,
    'allow_public_rooms_without_auth': False, 'allow_public_rooms_over_federation': False,
    'federation_domain_whitelist': [], 'enable_metrics': False, 'report_stats': False,
    'suppress_key_server_warning': True, 'trusted_key_servers': [], 'url_preview_enabled': False,
    'rc_login': {key: {'per_second': 10, 'burst_count': 100} for key in ['address', 'account', 'failed_attempts']},
    'rc_message': {'per_second': 50, 'burst_count': 100},
})
config.write_text(yaml.safe_dump(c))
log = Path(c['log_config']); settings = yaml.safe_load(log.read_text()); settings['root']['level'] = 'WARNING'; log.write_text(yaml.safe_dump(settings))
print('Local configuration created: client-only loopback, registration disabled, federation disabled.')
