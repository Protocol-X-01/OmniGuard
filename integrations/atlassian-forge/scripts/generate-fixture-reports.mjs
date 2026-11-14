import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const scanner = process.env.OMNIGUARD_BIN || path.join(root, 'target/release/omniguard');
const run = promisify(execFile);
const { stdout: catalogText } = await run(scanner, ['rules', '--format', 'json']);
const catalog = JSON.parse(catalogText);
await writeFile(new URL('../src/rule-catalog.json', import.meta.url), `${JSON.stringify(catalog, null, 2)}\n`);
const { RULES, validateBundle } = await import('../src/report-bundle.js');
const output = path.join(root, 'reports');
const solcFlag = process.argv.indexOf('--solc');
const solc = solcFlag < 0 ? null : process.argv[solcFlag + 1];
if (solcFlag >= 0 && !solc) throw new Error('Supply a native compiler path after --solc.');
await mkdir(output, { recursive: true });
for (const item of [
  { name: 'vulnerable', fixture: 'vulnerable', target: 'omniguard-vault-regression', label: 'Vault regression fixture' },
  { name: 'fixed', fixture: 'fixed', target: 'omniguard-vault-regression', label: 'Vault regression fixture' },
  { name: 'executable-vulnerable', fixture: 'executable-vault/vulnerable', target: 'omniguard-executable-vault', label: 'Executable Vault regression fixture' },
  { name: 'executable-fixed', fixture: 'executable-vault/fixed', target: 'omniguard-executable-vault', label: 'Executable Vault regression fixture' },
  { name: 'patterns-vulnerable', fixture: 'patterns/vulnerable', target: 'omniguard-patterns-regression', label: 'Solidity rule pack fixture' },
  { name: 'patterns-fixed', fixture: 'patterns/fixed', target: 'omniguard-patterns-regression', label: 'Solidity rule pack fixture' },
  { name: 'semantic-source-vulnerable', fixture: 'semantic-vault/vulnerable', target: 'omniguard-semantic-vault', label: 'Compiler-resolved Vault fixture' },
  { name: 'semantic-source-fixed', fixture: 'semantic-vault/fixed', target: 'omniguard-semantic-vault', label: 'Compiler-resolved Vault fixture' },
  ...(solc ? [
    { name: 'semantic-vulnerable', fixture: 'semantic-vault/vulnerable', target: 'omniguard-semantic-vault', label: 'Compiler-resolved Vault fixture', solc },
    { name: 'semantic-fixed', fixture: 'semantic-vault/fixed', target: 'omniguard-semantic-vault', label: 'Compiler-resolved Vault fixture', solc },
    { name: 'effects-vulnerable', fixture: 'effect-vault/vulnerable', target: 'omniguard-effects-vault', label: 'Helper and storage-alias Vault fixture', solc },
    { name: 'effects-fixed', fixture: 'effect-vault/fixed', target: 'omniguard-effects-vault', label: 'Helper and storage-alias Vault fixture', solc },
  ] : []),
]) {
  const fixture = path.join(root, 'fixtures', item.fixture);
  const { stdout } = await run(scanner, ['bundle', fixture, '--target', item.target, '--name', item.label,
    '--revision', `${item.name}-v${catalog.engine_version}`, '--isolated-fixture', ...(item.solc ? ['--solc', item.solc] : [])], { maxBuffer: 2 * 1024 * 1024, timeout: 15000 });
  const { bundle, digest } = validateBundle(JSON.parse(stdout));
  await writeFile(path.join(output, `${item.name}.omniguard.json`), `${JSON.stringify(bundle, null, 2)}\n`);
  process.stdout.write(`${item.name}: ${bundle.report.findings.length} findings, ${RULES.length} rules, bundle ${digest.slice(0, 12)}\n`);
}
