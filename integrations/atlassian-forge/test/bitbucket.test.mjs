import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PullRequestReader, parsePullRequestUrl, createPublicBitbucketApi } from '../../shared/bitbucket-pr.js';
import { validateBundle, assessRescan } from '../src/report-bundle.js';
import { RemediationService } from '../src/remediation-service.js';
const before = JSON.parse(await readFile(new URL('../../../reports/effects-vulnerable.omniguard.json', import.meta.url)));
const after = JSON.parse(await readFile(new URL('../../../reports/effects-fixed.omniguard.json', import.meta.url)));
const url = 'https://bitbucket.org/omniguard/fixtures/pull-requests/1';
const repo = '{11111111-1111-4111-8111-111111111111}';
const workspace = '{22222222-2222-4222-8222-222222222222}';
function fixture() {
  const state = { bundle: structuredClone(before), commit: 'a'.repeat(40), destination: 'b'.repeat(40), private: false, fork: false, prState: 'OPEN', reads: 0, calls: [] };
  const api = async (path) => {
    state.calls.push(path);
    if (path.endsWith('/fixtures')) return { uuid: repo, workspace: { uuid: workspace }, full_name: 'omniguard/fixtures', is_private: state.private };
    if (path.endsWith('/pullrequests/1')) { state.reads++; if (state.moveDuringRead && state.reads > 1) state.commit = 'f'.repeat(40); return { id: 1, state: state.prState, source: { repository: { uuid: state.fork ? workspace : repo }, commit: { hash: state.short ? state.commit.slice(0,12) : state.commit } }, destination: { repository: { uuid: repo }, commit: { hash: state.short ? state.destination.slice(0,12) : state.destination } } }; }
    if (path.includes('/commit/')) { const short=path.split('/').at(-1); return { hash: state.badResolution ? 'f'.repeat(40) : [state.commit,state.destination].find(value=>value.startsWith(short)) }; }
    if (path.endsWith('/omniguard.scan.json')) return JSON.stringify(state.bundle);
    if (path.includes('/contracts?')) return { values: state.bundle.sources.map((source) => ({ type: 'commit_file', path: `contracts/${source.path}`, size: Buffer.byteLength(source.content), attributes: state.links ? ['link'] : [] })).concat(state.extra ? [{ type: 'commit_file', path: 'contracts/Omitted.sol', size: 20 }] : []) };
    const source = state.bundle.sources.find((item) => path.endsWith(`/contracts/${item.path}`));
    if (source) return source.content + (state.tamper ? '// changed' : '');
    throw new Error(`Unexpected fixture request ${path}`);
  };
  return { state, reader: new PullRequestReader({ api, validateBundle }) };
}
test('canonical PR URLs reject credentials, other origins, encodings, traversal and arbitrary paths', () => {
  assert.equal(parsePullRequestUrl(url + '/').url, url);
  for (const bad of ['http://bitbucket.org/a/b/pull-requests/1', 'https://bitbucket.org.evil/a/b/pull-requests/1', 'https://user@bitbucket.org/a/b/pull-requests/1', url+'?x=1', url+'#x', 'https://bitbucket.org/a/b/pull-requests/0', 'https://bitbucket.org/a/%2e%2e/pull-requests/1']) assert.throws(() => parsePullRequestUrl(bad));
});
test('PR import binds full source bytes, repository, PR and both commits', async () => {
  const { reader, state } = fixture(); const scan = await reader.read(url);
  assert.equal(scan.provenance.repositoryUuid, repo); assert.equal(scan.bundle.revision, state.commit);
  assert.match(scan.bundle.target.id, /^bb-/); assert.notEqual(scan.digest, validateBundle(before).digest);
  assert.equal(state.reads, 2);
});
test('private, forked, closed, tampered, omitted, symlink and moving-head reports fail closed', async () => {
  for (const [key, value] of [['private',true],['fork',true],['prState','MERGED'],['tamper',true],['extra',true],['links',true],['moveDuringRead',true]]) { const { reader, state } = fixture(); state[key]=value; await assert.rejects(reader.read(url), undefined, key); }
});
test('source and destination changes independently make a snapshot stale', async () => {
  for (const key of ['commit','destination']) { const { reader, state } = fixture(); const scan = await reader.read(url); state[key]='c'.repeat(40); await assert.rejects(reader.assertCurrent(scan.provenance), /changed/); }
});
test('network adapter fixes destination, rejects redirects, oversize and invalid JSON', async () => {
  let requested;
  const response = { ok: true, redirected: false, headers: {get: () => null}, text: async () => '{}' };
  const api = createPublicBitbucketApi(async (u, options) => { requested = {u, options}; return response; });
  await api('/2.0/repositories/a/b'); assert.equal(requested.u,'https://api.bitbucket.org/2.0/repositories/a/b'); assert.equal(requested.options.redirect,'error');
  await assert.rejects(api('https://evil.test'), /Invalid/);
  response.redirected=true; await assert.rejects(api('/2.0/repositories/a/b'), /redirect/); response.redirected=false;
  response.text=async()=> 'x'.repeat(200); await assert.rejects(api('/2.0/repositories/a/b',100), /size limit/);
  response.text=async()=> 'invalid'; await assert.rejects(api('/2.0/repositories/a/b'), /invalid JSON/);
});
test('manual, other PR and same-commit rescans cannot clear a PR baseline', async () => {
  const { reader, state } = fixture(); const old = await reader.read(url);
  const record = { targetId: old.bundle.target.id, baselineDigest: old.digest, baselineEngine: old.bundle.report.engine_version, baselineRules: old.bundle.rules, baselineAnalysis: old.bundle.report.analysis, baselineProvenance: old.provenance, finding: old.bundle.report.findings[0] };
  state.bundle = structuredClone(after); state.commit = 'c'.repeat(40); const fixed = await reader.read(url);
  assert.equal(assessRescan(record, fixed).allowed,true);
  for (const change of [(s)=>delete s.provenance, (s)=>s.provenance.pullRequestId++, (s)=>s.provenance.commit=old.provenance.commit]) { const bad=structuredClone(fixed); change(bad); assert.equal(assessRescan(record,bad).allowed,false); }
});
test('Jira PR workflow verifies once and rechecks live heads at all mutation boundaries', async () => {
  const {reader,state}=fixture(); const data=new Map(); const comments=[]; let created=0, transitioned=0;
  const clone=(v)=>v===undefined?undefined:structuredClone(v);
  const store={get:async k=>clone(data.get(k)),set:async(k,v)=>data.set(k,clone(v)),remove:async k=>data.delete(k),list:async()=>[],claim:async(k,v)=>{if(data.has(k))return false;data.set(k,v);return true;},saveScan:async(k,v,a,d)=>{data.set(k,clone(v));data.set(a,d);}};
  const jira={authorize:async()=>{},taskType:async()=> '1',createIssue:async()=>{created++;return{key:'KAN-PR'};},issue:async()=>({key:'KAN-PR',status:transitioned?'Done':'To Do',category:transitioned?'done':'new'}),addComment:async(_,body)=>{comments.push(body);return{id:String(comments.length)};},completionTransitions:async()=>[{id:'31'}],transition:async()=>{transitioned++;}};
  const service=new RemediationService({store,jira,pullRequests:reader}); const context={accountId:'fixture',extension:{project:{id:'10000',key:'KAN'}}};
  const first=await service.importPullRequest(context,{url}); const args={scanDigest:first.scan.digest,findingId:state.bundle.report.findings[0].id};
  state.commit='c'.repeat(40); await assert.rejects(service.create(context,args),/changed/); assert.equal(created,0); state.commit='a'.repeat(40);
  const record=await service.create(context,args); assert.equal((await service.create(context,args)).id,record.id); assert.equal(created,1);
  state.bundle=structuredClone(after); state.commit='c'.repeat(40); const next=await service.importPullRequest(context,{url}); const verify={scanDigest:next.scan.digest,remediationId:record.id};
  state.destination='d'.repeat(40); await assert.rejects(service.verify(context,verify),/changed/); assert.equal(comments.length,0); state.destination='b'.repeat(40);
  await service.verify(context,verify); await service.verify(context,verify); assert.equal(comments.length,1); assert.match(JSON.stringify(comments[0]),/Bitbucket PR/);
  state.commit='e'.repeat(40); await assert.rejects(service.complete(context,{...verify,transitionId:'31'}),/changed/); assert.equal(transitioned,0); state.commit='c'.repeat(40);
  await service.complete(context,{...verify,transitionId:'31'}); assert.equal(transitioned,1);
  const manual=structuredClone(before); manual.target.id=first.scan.target.id;
  const importedManual=await service.importReport(context,{bundle:manual});
  const manualRecord=await service.create(context,{scanDigest:importedManual.scan.digest,findingId:manual.report.findings[0].id});
  assert.notEqual(manualRecord.id,record.id); assert.equal(created,2);
});

test('abbreviated Bitbucket commit identities are resolved and mismatched resolutions rejected', async () => {
  const {reader,state}=fixture(); state.short=true; const scan=await reader.read(url); assert.equal(scan.provenance.commit,state.commit); assert.equal(scan.provenance.destinationCommit,state.destination); state.badResolution=true; await assert.rejects(reader.read(url),/immutable commit/);
});

test('source listing uses opaque pagination cursors without following foreign URLs', async () => {
  const base='/2.0/repositories/omniguard/fixtures'; const revision='a'.repeat(40); const calls=[];
  const reader=new PullRequestReader({validateBundle,api:async path=>{calls.push(path);return path.includes('page=') ? {values:[{type:'commit_file',path:'contracts/B.sol',size:1}]} : {values:[{type:'commit_file',path:'contracts/A.sol',size:1}],next:`https://api.bitbucket.org${base}/src/${revision}/contracts/?page=opaque%2Fcursor`};}});
  assert.deepEqual(await reader.sourceFiles(base,revision),['A.sol','B.sol']); assert.ok(!calls[0].includes('&page=')); assert.ok(calls[1].endsWith('&page=opaque%2Fcursor'));
  reader.api=async()=>({values:[],next:'https://evil.test/path?page=x'}); await assert.rejects(reader.sourceFiles(base,revision),/Foreign/);
});

test('network reader bounds streamed bytes and rejects invalid UTF-8', async () => {
  const stream = (bytes) => new Response(new ReadableStream({start(controller){controller.enqueue(bytes);controller.close();}}));
  let api=createPublicBitbucketApi(async()=>stream(new Uint8Array(1025))); await assert.rejects(api('/2.0/repositories/a/b',1024,true),/size limit/);
  api=createPublicBitbucketApi(async()=>stream(new Uint8Array([255]))); await assert.rejects(api('/2.0/repositories/a/b',1024,true),/UTF-8/);
});
