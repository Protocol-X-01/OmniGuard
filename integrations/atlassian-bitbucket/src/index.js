import { makeResolver } from '@forge/resolver';
import { fetch } from '@forge/api';
import { PullRequestReader, createPublicBitbucketApi } from '../../shared/bitbucket-pr.js';
import { validateBundle } from '../../atlassian-forge/src/report-bundle.js';
import { readPanel } from './service.js';
const reader = new PullRequestReader({ api: createPublicBitbucketApi(fetch), validateBundle });
export const handler = makeResolver({ getPullRequestScan: ({ context, payload }) => readPanel(context, reader, payload) });
