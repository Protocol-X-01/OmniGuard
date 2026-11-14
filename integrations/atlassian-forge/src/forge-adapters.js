import { asUser, route } from '@forge/api';
import { kvs, WhereConditions } from '@forge/kvs';

async function json(response) {
  if (!response.ok) {
    let details = '';
    try {
      const body = await response.json();
      details = [...(body.errorMessages || []), ...Object.values(body.errors || {})].join(' ').slice(0, 400);
    } catch { /* Preserve the HTTP status if Jira returned no JSON body. */ }
    const error = new Error(`Jira returned HTTP ${response.status}.${details ? ` ${details}` : ' Check your Jira permissions and project configuration.'}`);
    error.definitive = response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status);
    throw error;
  }
  return response.status === 204 ? {} : response.json();
}

const request = (path, options) => asUser().requestJira(path, options).then(json);
const post = (body) => ({ method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const store = {
  get: (key) => kvs.get(key), set: (key, value) => kvs.set(key, value), remove: (key) => kvs.delete(key),
  async scanPage(prefix, cursor) {
    let query = kvs.query().where('key', WhereConditions.beginsWith(prefix)).limit(20);
    if (cursor) query = query.cursor(cursor);
    return query.getMany();
  },
  saveScan: (key, scan, activeKey, digest) => kvs.transact().set(key, scan).set(activeKey, digest).execute(),
  async claim(key, value) {
    try { await kvs.set(key, value, { keyPolicy: 'FAIL_IF_EXISTS' }); return true; }
    catch (error) { if (await kvs.get(key)) return false; throw error; }
  },
  async list(prefix) {
    const records = [];
    let cursor;
    do {
      let query = kvs.query().where('key', WhereConditions.beginsWith(prefix)).limit(20);
      if (cursor) query = query.cursor(cursor);
      const page = await query.getMany();
      records.push(...page.results.filter(({ key }) => !key.slice(prefix.length).includes(':')).map(({ value }) => value));
      cursor = page.nextCursor;
      if (records.length > 100) throw new Error('This development project has exceeded 100 tracked remediations.');
    } while (cursor);
    return records;
  },
};

export const jira = {
  async authorize(project, needed) {
    const info = await request(route`/rest/api/3/project/${project.id}`);
    if (String(info.id) !== project.id || info.key !== project.key) throw new Error('Jira project context changed. Reload the project page.');
    if (needed.length) {
      const permissions = needed.join(',');
      const result = await request(route`/rest/api/3/mypermissions?projectId=${project.id}&permissions=${permissions}`);
      for (const permission of needed) if (result.permissions?.[permission]?.havePermission !== true) throw new Error(`Jira permission required: ${permission}.`);
    }
  },
  async taskType(project, additionalFields = []) {
    const types = [];
    let startAt = 0;
    for (;;) {
      const page = await request(route`/rest/api/3/issue/createmeta/${project.id}/issuetypes?startAt=${startAt}&maxResults=50`);
      types.push(...(page.issueTypes || page.values || []));
      if (page.isLast || startAt + 50 >= (page.total ?? types.length)) break;
      startAt += 50;
    }
    const task = types.find((type) => type.name.toLowerCase() === 'task' && !type.subtask);
    if (!task) throw new Error('This Jira project needs a Task issue type for OmniGuard remediation.');
    const fields = [];
    startAt = 0;
    for (;;) {
      const page = await request(route`/rest/api/3/issue/createmeta/${project.id}/issuetypes/${task.id}?startAt=${startAt}&maxResults=50`);
      fields.push(...(page.fields || page.values || []));
      if (page.isLast || startAt + 50 >= (page.total ?? fields.length)) break;
      startAt += 50;
    }
    const supplied = new Set(['project', 'issuetype', 'summary', 'description', 'labels', ...additionalFields]);
    const missing = fields.filter((field) => field.required && !field.hasDefaultValue && !supplied.has(field.fieldId || field.key));
    if (missing.length) throw new Error(`The Jira Task requires extra fields: ${missing.map((field) => field.name).join(', ')}. Configure defaults before creating the remediation.`);
    return task.id;
  },
  createIssue: (body) => request(route`/rest/api/3/issue`, post(body)),
  async issue(issueKey, project) {
    const result = await request(route`/rest/api/3/issue/${issueKey}?fields=project,status,labels`);
    if (String(result.fields.project.id) !== project.id) throw new Error('The tracked Jira issue has moved outside this project.');
    return { key: result.key, status: result.fields.status.name, category: result.fields.status.statusCategory.key };
  },
  async findExisting(project, label, property) {
    const result = await request(route`/rest/api/3/search/jql`, post({ jql: `project = ${project.id} AND labels = "${label}"`, fields: ['status'], maxResults: 2 }));
    if (result.issues?.length > 1) throw new Error('Multiple Jira issues have this OmniGuard reference. Review them in Jira.');
    const issue = result.issues?.[0];
    if (!issue) return null;
    const stored = await request(route`/rest/api/3/issue/${issue.key}/properties/omniguard`);
    if (!Object.entries(property).every(([key, value]) => stored.value?.[key] === value)) throw new Error('The existing Jira issue has a different OmniGuard evidence reference.');
    return { key: issue.key, status: issue.fields.status.name };
  },
  addComment: (issueKey, body) => request(route`/rest/api/3/issue/${issueKey}/comment`, post({ body })),
  async findVerificationComment(issueKey, digest, markerPrefix = 'OmniGuard rescan verification: ') {
    const page = await request(route`/rest/api/3/issue/${issueKey}/comment?orderBy=-created&maxResults=100`);
    return page.comments.find((comment) => JSON.stringify(comment.body).includes(`${markerPrefix}${digest}`));
  },
  async completionTransitions(issueKey) {
    const result = await request(route`/rest/api/3/issue/${issueKey}/transitions?expand=transitions.fields`);
    return result.transitions.filter((transition) => transition.to?.statusCategory?.key === 'done'
      && !Object.values(transition.fields || {}).some((field) => field.required && !field.hasDefaultValue))
      .map((transition) => ({ id: transition.id, name: transition.name, status: transition.to.name }));
  },
  transition: (issueKey, id) => request(route`/rest/api/3/issue/${issueKey}/transitions`, post({ transition: { id } })),
};
