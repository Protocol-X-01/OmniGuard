import { parsePullRequestUrl } from '../../shared/bitbucket-pr.js';
export async function readPanel(context, reader, payload) {
  const extension = context?.extension;
  if (!extension?.repository?.uuid || !Number.isInteger(extension.pullRequest?.id)) throw new Error('Open this panel from a Bitbucket pull request.');
  const ref = parsePullRequestUrl(payload?.url ?? extension.location);
  if (ref.pullRequestId !== extension.pullRequest.id) throw new Error('The pull-request context does not match this page.');
  const scan = await reader.read(ref.url);
  if (scan.provenance.repositoryUuid !== extension.repository.uuid.toLowerCase()) throw new Error('The repository context does not match this scan.');
  return { digest: scan.digest, provenance: scan.provenance, report: scan.bundle.report, sources: scan.bundle.sources.map(({path, sha256}) => ({path, sha256})) };
}
