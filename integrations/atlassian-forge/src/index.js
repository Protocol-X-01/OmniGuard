import { makeResolver } from '@forge/resolver';
import { jira, store } from './forge-adapters.js';
import { RemediationService } from './remediation-service.js';

const service = new RemediationService({ store, jira });
export const handler = makeResolver({
  getDashboard: ({ context }) => service.dashboard(context),
  importReport: ({ context, payload }) => service.importReport(context, payload),
  createRemediation: ({ context, payload }) => service.create(context, payload),
  verifyRemediation: ({ context, payload }) => service.verify(context, payload),
  completeRemediation: ({ context, payload }) => service.complete(context, payload),
});
