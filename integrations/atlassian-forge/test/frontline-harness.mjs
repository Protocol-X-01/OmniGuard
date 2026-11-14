import { FrontlineService } from '../src/frontline-service.js';
export function harness({ now = 1794673260 } = {}) {
  const data = new Map(), issues = new Map(), comments = [], calls = [];
  const permissions = new Set(['BROWSE_PROJECTS', 'EDIT_ISSUES', 'CREATE_ISSUES', 'ASSIGN_ISSUES', 'ADD_COMMENTS', 'TRANSITION_ISSUES']);
  const copy = v => v === undefined ? undefined : structuredClone(v);
  const store = { get: async k => copy(data.get(k)), set: async (k, v) => { data.set(k, copy(v)); }, remove: async k => { data.delete(k); },
    claim: async (k, v) => { if (data.has(k)) return false; data.set(k, copy(v)); return true; } };
  const jira = {
    authorize: async (project, needed) => { calls.push(['authorize', project.accountId, ...needed]); for (const p of needed) if (!permissions.has(p)) throw Object.assign(new Error(`Jira permission required: ${p}`), { status: 403 }); },
    taskType: async () => '10001',
    createIssue: async body => { const key = `LOCAL-${issues.size + 1}`; issues.set(key, { ...copy(body), key, status: 'To do', category: 'new' }); calls.push(['create', key]); return { key }; },
    issue: async (key, project) => { const issue = issues.get(key); if (!issue || issue.fields.project.id !== project.id) throw new Error('Issue outside project'); return copy(issue); },
    findExisting: async (project, label, property) => { const item = [...issues.values()].find(i => i.fields.project.id === project.id && i.fields.labels.includes(label)); if (!item) return null; if (JSON.stringify(item.properties[0].value) !== JSON.stringify(property)) throw new Error('Different evidence'); return { key: item.key }; },
    findVerificationComment: async (key, marker, prefix = 'OmniGuard rescan verification: ') => copy(comments.find(c => c.key === key && JSON.stringify(c.body).includes(`${prefix}${marker}`))),
    addComment: async (key, body) => { const comment = { key, id: String(comments.length + 1), body: copy(body) }; comments.push(comment); return copy(comment); },
    completionTransitions: async () => [{ id: '31', name: 'Done', status: 'Done' }],
    transition: async (key, id) => { if (id !== '31') throw new Error('Invalid transition'); Object.assign(issues.get(key), { status: 'Done', category: 'done' }); calls.push(['transition', key]); },
  };
  const h = { data, store, jira, issues, comments, calls, permissions, now, context: { accountId: 'fixture-responder', extension: { project: { id: '10000', key: 'LOCAL' } } } };
  h.service = new FrontlineService({ store, jira, clock: () => h.now });
  return h;
}
