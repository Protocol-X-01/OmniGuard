import { projectContext } from './remediation-service.js';

// Only legacy importer attribution is removed. Source, evidence, timestamps,
// remediation records and Jira content are outside this operation.
export class PrivacyService {
  constructor({ store, jira }) { Object.assign(this, { store, jira }); }

  async page(context, payload, remove = false) {
    const project = projectContext(context);
    await this.jira.authorize(project, ['ADMINISTER_PROJECTS']);
    if (remove && payload?.confirmProjectKey !== project.key) {
      throw new Error('Type the current Jira project key to confirm removal of stored importer IDs.');
    }
    const cursor = payload?.cursor;
    if (cursor !== undefined && (typeof cursor !== 'string' || !cursor.length || cursor.length > 8192)) {
      throw new Error('The data review expired. Start a new review.');
    }
    const prefix = `og:p:${project.id}:scan:`;
    const page = await this.store.scanPage(prefix, cursor);
    if (!Array.isArray(page.results) || page.results.length > 20
      || page.results.some(({ key }) => typeof key !== 'string' || !key.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(key.slice(prefix.length)))) {
      throw new Error('Unexpected storage page. No records on this page were changed.');
    }
    const nextCursor = page.nextCursor || null;
    if (nextCursor && (typeof nextCursor !== 'string' || nextCursor.length > 8192 || nextCursor === cursor)) {
      throw new Error('The data review could not advance. Start a new review.');
    }
    let inspected = 0;
    let legacy = 0;
    let removed = 0;
    for (const { key } of page.results) {
      // Queries can be eventually consistent; never write a queried snapshot.
      const current = await this.store.get(key);
      if (!current) continue;
      if (current.digest !== key.slice(prefix.length) || !current.bundle || typeof current.importedAt !== 'string') {
        throw new Error('An unrecognized stored scan needs administrator review. Earlier records may already have been processed.');
      }
      inspected++;
      if (Object.hasOwn(current, 'importedBy')) {
        legacy++;
        if (remove) {
          const cleaned = { ...current };
          delete cleaned.importedBy;
          await this.store.set(key, cleaned);
          removed++;
        }
      }
    }
    // No account identifier or full source is returned to this administration UI.
    return { projectKey: project.key, inspected, legacy, removed, nextCursor };
  }

  preview(context, payload) { return this.page(context, payload); }
  removeLegacyAttribution(context, payload) { return this.page(context, payload, true); }
}
