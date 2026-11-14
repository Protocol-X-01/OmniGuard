import { makeResolver } from '@forge/resolver';
import { jira, store } from './forge-adapters.js';
import { RemediationService } from './remediation-service.js';
import { fetch } from '@forge/api';
import { PullRequestReader, createPublicBitbucketApi } from '../../shared/bitbucket-pr.js';
import { validateBundle } from './report-bundle.js';
import { PrivacyService } from './privacy-service.js';
import { FrontlineService } from './frontline-service.js';

const service = new RemediationService({ store, jira, pullRequests: new PullRequestReader({ api: createPublicBitbucketApi(fetch), validateBundle }) });
const privacy = new PrivacyService({ store, jira });
const frontline = new FrontlineService({ store, jira });
export const handler = makeResolver({
  getFrontline: ({ context }) => frontline.dashboard(context),
  importFrontline: ({ context, payload }) => frontline.import(context, payload),
  createFrontline: ({ context, payload }) => frontline.create(context, payload),
  decideFrontline: ({ context, payload }) => frontline.action(context, payload, 'decision'),
  verifyFrontline: ({ context, payload }) => frontline.action(context, payload, 'verify'),
  completeFrontline: ({ context, payload }) => frontline.action(context, payload, 'complete'),
  getDashboard: ({ context }) => service.dashboard(context),
  importPullRequest: ({ context, payload }) => service.importPullRequest(context, payload),
  importReport: ({ context, payload }) => service.importReport(context, payload),
  createRemediation: ({ context, payload }) => service.create(context, payload),
  verifyRemediation: ({ context, payload }) => service.verify(context, payload),
  completeRemediation: ({ context, payload }) => service.complete(context, payload),
  previewImporterData: ({ context, payload }) => privacy.preview(context, payload),
  removeLegacyImporterData: ({ context, payload }) => privacy.removeLegacyAttribution(context, payload),
});
