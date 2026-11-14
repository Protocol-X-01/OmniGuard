import { makeResolver } from '@forge/resolver';
export const handler = makeResolver({ getIntegrationStatus: () => ({ status: 'scaffold', sourceAccess: false }) });
