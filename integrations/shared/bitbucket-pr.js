import { createHash } from 'node:crypto';

export const REPORT_PATH = 'omniguard.scan.json';
export const SOURCE_ROOT = 'contracts';
const digest = (value) => createHash('sha256').update(value).digest('hex');
const uuid = /^\{[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\}$/i;
const commit = /^[a-f0-9]{40}$/;
const check = (ok, message) => { if (!ok) throw new Error(message); };

export function parsePullRequestUrl(value) {
  check(typeof value === 'string' && value.length < 500, 'Enter a Bitbucket pull-request URL.');
  let url; try { url = new URL(value); } catch { throw new Error('Enter a Bitbucket pull-request URL.'); }
  const match = /^\/([a-z0-9][a-z0-9_-]{0,99})\/([a-z0-9][a-z0-9_.-]{0,99})\/pull-requests\/([1-9][0-9]{0,8})\/?$/.exec(url.pathname);
  check(url.origin === 'https://bitbucket.org' && !url.username && !url.password && !url.search && !url.hash && match, 'Use the canonical https://bitbucket.org/workspace/repository/pull-requests/number URL.');
  return { workspace: match[1], repository: match[2], pullRequestId: Number(match[3]), url: `https://bitbucket.org/${match[1]}/${match[2]}/pull-requests/${match[3]}` };
}

export function createPublicBitbucketApi(fetcher) {
  return async (path, limit = 256 * 1024, raw = false) => {
    check(typeof path === 'string' && path.startsWith('/2.0/repositories/') && !/[\\\x00-\x20]/.test(path), 'Invalid Bitbucket API path.');
    const response = await fetcher(`https://api.bitbucket.org${path}`, { redirect: 'error', headers: { Accept: raw ? 'text/plain' : 'application/json' } });
    check(response.ok, `Bitbucket returned HTTP ${response.status}. Only accessible public fixture repositories are supported.`);
    check(!response.redirected, 'Bitbucket redirects are not accepted.');
    const length = response.headers?.get('content-length');
    check(!length || (Number.isFinite(Number(length)) && Number(length) <= limit), 'Bitbucket response exceeds the size limit.');
    let bytes;
    if (response.body?.getReader) {
      const reader = response.body.getReader(); const chunks = []; let size = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > limit) { await reader.cancel(); throw new Error('Bitbucket response exceeds the size limit.'); }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
      bytes = Buffer.concat(chunks, size);
    } else {
      bytes = response.arrayBuffer ? Buffer.from(await response.arrayBuffer()) : Buffer.from(await response.text());
    }
    check(bytes.byteLength <= limit, 'Bitbucket response exceeds the size limit.');
    let body; try { body = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new Error('Bitbucket source is not valid UTF-8.'); }
    if (raw) return body;
    try { return JSON.parse(body); } catch { throw new Error('Bitbucket returned invalid JSON.'); }
  };
}

export class PullRequestReader {
  constructor({ api, validateBundle, clock = () => new Date().toISOString() }) { Object.assign(this, { api, validateBundle, clock }); }
  async head(url) {
    const ref = parsePullRequestUrl(url);
    const base = `/2.0/repositories/${ref.workspace}/${ref.repository}`;
    const repo = await this.api(base);
    check(repo.is_private === false, 'Only public isolated-fixture repositories are supported.');
    check(uuid.test(repo.uuid) && uuid.test(repo.workspace?.uuid) && repo.full_name === `${ref.workspace}/${ref.repository}`, 'Bitbucket repository identity does not match the URL.');
    const pr = await this.api(`${base}/pullrequests/${ref.pullRequestId}`);
    check(pr.id === ref.pullRequestId && pr.state === 'OPEN', 'The pull request must be open.');
    check(pr.source?.repository?.uuid === repo.uuid && pr.destination?.repository?.uuid === repo.uuid, 'Fork pull requests are not supported in this version.');
    const resolveCommit = async (hash) => {
      check(typeof hash === 'string' && /^[a-f0-9]{12,40}$/.test(hash), 'Bitbucket did not return valid commit identities.');
      if (commit.test(hash)) return hash;
      const resolved = await this.api(`${base}/commit/${hash}`);
      check(commit.test(resolved.hash) && resolved.hash.startsWith(hash), 'Bitbucket could not resolve an immutable commit identity.');
      return resolved.hash;
    };
    const sourceCommit = await resolveCommit(pr.source?.commit?.hash);
    const destinationCommit = await resolveCommit(pr.destination?.commit?.hash);
    return { provider: 'bitbucket', ...ref, repositoryUuid: repo.uuid.toLowerCase(), workspaceUuid: repo.workspace.uuid.toLowerCase(), commit: sourceCommit, destinationCommit };
  }
  async assertCurrent(origin) {
    const now = await this.head(origin.url);
    check(['repositoryUuid','workspaceUuid','pullRequestId','commit','destinationCommit'].every((key) => now[key] === origin[key]), 'The pull request changed. Import its latest scan before continuing.');
    return now;
  }
  async sourceFiles(base, revision) {
    const directories = [SOURCE_ROOT];
    const files = [];
    for (let i = 0; i < directories.length; i++) {
      check(directories.length <= 24, 'Fixture source traversal exceeds 24 directories.');
      const directory = directories[i];
      let cursor = '';
      const seenCursors = new Set();
      const sourcePath = `${base}/src/${revision}/${directory.split('/').map(encodeURIComponent).join('/')}`;
      for (let page = 1; ; page++) {
        check(page <= 4, 'Fixture source listing exceeds the pagination limit.');
        const result = await this.api(`${sourcePath}?pagelen=100${cursor ? `&page=${encodeURIComponent(cursor)}` : ''}`);
        check(Array.isArray(result.values), 'Bitbucket did not return a source directory.');
        for (const item of result.values) {
          check(typeof item.path === 'string' && item.path.startsWith(`${directory}/`) && !item.path.slice(directory.length + 1).includes('/') && !/[\\\x00-\x1f:%]/.test(item.path) && item.path.split('/').every((part) => part && part !== '.' && part !== '..'), 'Invalid repository source path.');
          check(!item.attributes?.includes('link') && !item.attributes?.includes('subrepository'), 'Symlinks and subrepositories are not supported in fixture sources.');
          if (item.type === 'commit_directory') {
            check(!directories.includes(item.path), 'Repeated source directory.'); directories.push(item.path);
          } else if (item.path.endsWith('.sol')) {
            check(item.type === 'commit_file' && Number.isInteger(item.size) && item.size <= 64 * 1024, 'Invalid or oversized Solidity source.');
            files.push(item.path.slice(SOURCE_ROOT.length + 1));
            check(files.length <= 8, 'PR fixture scans support at most eight Solidity files.');
          }
        }
        if (!result.next) break;
        let next; try { next = new URL(result.next); } catch { throw new Error('Invalid Bitbucket pagination.'); }
        check(next.origin === 'https://api.bitbucket.org' && !next.username && !next.password && next.pathname.replace(/\/$/, '') === sourcePath, 'Foreign Bitbucket pagination path.');
        cursor = next.searchParams.get('page');
        check(typeof cursor === 'string' && cursor.length > 0 && cursor.length <= 2048 && !seenCursors.has(cursor), 'Invalid or repeated Bitbucket page cursor.');
        seenCursors.add(cursor); // Rebuild the fixed path; copy only the opaque page cursor.
      }
    }
    check(files.length > 0 && new Set(files).size === files.length, 'Missing or duplicated Solidity source coverage.');
    return files.sort();
  }
  async read(url) {
    const origin = await this.head(url);
    const base = `/2.0/repositories/${origin.workspace}/${origin.repository}`;
    const input = JSON.parse(await this.api(`${base}/src/${origin.commit}/${REPORT_PATH}`, 160 * 1024, true));
    const { bundle } = this.validateBundle(input);
    check(bundle.report.schema_version === 3 && bundle.report.coverage?.complete === true && bundle.report.diagnostics.length === 0, 'A complete current-format PR report is required.');
    const files = await this.sourceFiles(base, origin.commit);
    check(JSON.stringify(files) === JSON.stringify(bundle.sources.map((source) => source.path).sort()), 'The report omits or adds Solidity files from contracts/.');
    for (const source of bundle.sources) {
      const path = `${SOURCE_ROOT}/${source.path}`.split('/').map(encodeURIComponent).join('/');
      const content = await this.api(`${base}/src/${origin.commit}/${path}`, 64 * 1024, true);
      check(content === source.content && digest(content) === source.sha256, `PR source does not match report evidence: ${source.path}.`);
    }
    await this.assertCurrent(origin);
    bundle.target = { id: `bb-${digest(`${origin.repositoryUuid}\0${origin.pullRequestId}`).slice(0, 40)}`, name: `${origin.workspace}/${origin.repository} PR #${origin.pullRequestId}`.slice(0, 100), kind: 'isolated-fixture' };
    bundle.revision = origin.commit;
    return { bundle, provenance: origin, digest: digest(JSON.stringify({ bundle, provenance: origin })), importedAt: this.clock() };
  }
}

export function provenanceAssessment(record, scan) {
  if (!record.baselineProvenance && !scan?.provenance) return null;
  const old = record.baselineProvenance; const next = scan?.provenance;
  if (!old || !next || old.repositoryUuid !== next.repositoryUuid || old.workspaceUuid !== next.workspaceUuid || old.pullRequestId !== next.pullRequestId) return { allowed: false, reason: 'Import a Bitbucket rescan of the same repository and pull request.' };
  if (old.commit === next.commit) return { allowed: false, reason: 'Import a scan of a newer pull-request commit.' };
  return null;
}
