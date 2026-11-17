import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewHarness } from './review-queue-harness.mjs';
import { readFile } from 'node:fs/promises';
import { RemediationService } from '../src/remediation-service.js';

async function prepared() {
  const h=await reviewHarness().seed();
  await h.act('reviewer','take_reviewer',{label:'Morgan'});
  return h;
}
async function reviewed() {
  const h=await prepared();
  await h.act('owner','handoff',{toRole:'reviewer',purpose:'review_evidence'});
  await h.act('reviewer','accept');
  await h.act('reviewer','decide',{decision:'reviewed',reason:'context_checked'});
  return h;
}
test('separate owner and reviewer accept and review the exact evidence without completing Jira',async()=>{
  const h=await reviewed(), r=await h.row('reviewer');
  assert.equal(r.reviewStatus,'Reviewed');assert.equal(r.reviewed,true);assert.equal(r.owner.isYou,false);assert.equal(r.reviewer.isYou,true);
  assert.equal(r.history.length,4);assert.equal(h.issues.get('LOCAL-1').category,'new');assert.equal(h.comments.length,0);
  assert.ok(!JSON.stringify(r).includes('accountId'));
});
test('owner self-review, deputy double roles, outsider accept and unaccepted decisions are rejected',async()=>{
  const h=await reviewHarness().seed();
  await assert.rejects(h.act('owner','take_reviewer',{label:'Owner'}),/separate participant/);
  await h.act('reviewer','take_reviewer',{label:'Morgan'});
  await assert.rejects(h.act('reviewer','take_deputy',{label:'Morgan'}),/separate participant/);
  await h.act('owner','handoff',{toRole:'reviewer',purpose:'review_evidence'});
  await assert.rejects(h.act('outsider','accept'),/current recipient/);
  await assert.rejects(h.act('reviewer','decide',{decision:'reviewed',reason:'context_checked'}),/must accept/);
  await assert.rejects(h.act('owner','handoff',{toRole:'reviewer',purpose:'review_evidence'}),/pending handoff/);
});
test('deputy accepts context work then hands it to the reviewer; only recipient controls the handoff',async()=>{
  const h=await prepared();await h.act('deputy','take_deputy',{label:'Casey'});
  await h.act('owner','handoff',{toRole:'deputy',purpose:'add_context'});await h.act('deputy','accept');
  await assert.rejects(h.act('owner','handoff',{toRole:'reviewer',purpose:'review_evidence'}),/current recipient owns/);
  await h.act('deputy','handoff',{toRole:'reviewer',purpose:'review_evidence'});await h.act('reviewer','accept');
  await h.act('reviewer','decide',{decision:'needs_changes',reason:'changes_needed'});
  assert.equal((await h.row('owner')).reviewed,false);
  await h.act('reviewer','handoff',{toRole:'owner',purpose:'address_changes'});await h.act('owner','accept');
  assert.equal((await h.row('owner')).handoff.toRole,'owner');
});
test('changed evidence, Jira owner or reviewer/deputy invalidates acceptance and review, preserves history',async()=>{
  for (const change of ['evidence','owner','reviewer','deputy']) {
    const h=await reviewed(), previous=await h.row('owner');
    if(change==='evidence') await h.service.import(h.contextFor('owner'),{bundle:await h.bundle(2)});
    if(change==='owner') h.issues.get('LOCAL-1').fields.assignee.accountId='outsider';
    if(change==='reviewer') await h.act('reviewer','release_reviewer');
    if(change==='deputy') await h.act('deputy','take_deputy',{label:'Casey'});
    const after=await h.row('owner');assert.equal(after.reviewed,false,change);assert.ok(after.history.length>=previous.history.length);
    await assert.rejects(h.act('owner','handoff',{toRole:'reviewer',purpose:'review_evidence'},previous),/changed/);
  }
});
test('expiry and future timestamps block new decisions even after an accepted handoff',async()=>{
  const h=await reviewed();h.now+=3601;let r=await h.row('reviewer');assert.equal(r.reviewed,false);assert.equal(r.reviewStatus,'Blocked');
  await assert.rejects(h.act('reviewer','decide',{decision:'reviewed',reason:'context_checked'}),/must accept/);
  h.now-=7200;r=await h.row('reviewer');assert.equal(r.reviewStatus,'Blocked');assert.ok(r.gaps.some(g=>g.includes('future')));
});
test('project/issue permissions deny access without exposing stored issue metadata',async()=>{
  const h=await prepared();h.denied=new Set(['outsider']);
  assert.equal((await h.queue.dashboard(h.contextFor('outsider'))).rows.length,0);
  const r=await h.row('owner');await assert.rejects(h.act('outsider','take_deputy',{label:'Other'},r),/unavailable/);
  const other=h.contextFor('reviewer');other.extension.project.id='10001';assert.equal((await h.queue.dashboard(other)).rows.length,0);
  h.permissions.delete('EDIT_ISSUES');await assert.rejects(h.act('reviewer','release_reviewer'),/EDIT_ISSUES/);
});
test('malformed or forged payloads and stale concurrent writes fail without role loss',async()=>{
  const h=await reviewHarness().seed(),r=await h.row('owner');
  await assert.rejects(h.act('reviewer','take_reviewer',{label:'<fake>'}),/display label/);
  await assert.rejects(h.act('reviewer','take_reviewer',{label:'Morgan',accountId:'owner'}),/unexpected/);
  const attempts=await Promise.allSettled([h.act('reviewer','take_reviewer',{label:'Morgan'},r),h.act('deputy','take_reviewer',{label:'Casey'},r)]);
  assert.equal(attempts.filter(v=>v.status==='fulfilled').length,1);
  assert.equal((await h.row('owner')).revision,1);
});
test('an abandoned lock does not expire into a concurrent writer; save failure releases invocation lock',async()=>{
  const h=await reviewHarness().seed();h.data.set('og:p:10000:rq:lock',{at:0});
  await assert.rejects(h.act('reviewer','take_reviewer',{label:'Morgan'}),/operator recovery/);
  h.data.delete('og:p:10000:rq:lock');const set=h.store.set;
  h.store.set=async()=>{throw new Error('Storage unavailable');};await assert.rejects(h.act('reviewer','take_reviewer',{label:'Morgan'}),/Storage unavailable/);
  h.store.set=set;assert.equal(h.data.has('og:p:10000:rq:lock'),false);assert.equal((await h.row('owner')).revision,0);
});
test('an evidence change during mutation prevents committing the decision',async()=>{
  const h=await prepared();await h.act('owner','handoff',{toRole:'reviewer',purpose:'review_evidence'});await h.act('reviewer','accept');
  const row=await h.row('reviewer'), sources=h.queue.sources.bind(h.queue);let calls=0;
  h.queue.sources=async p=>{if(++calls===2)await h.service.import(h.contextFor('owner'),{bundle:await h.bundle(2)});return sources(p);};
  await assert.rejects(h.act('reviewer','decide',{decision:'reviewed',reason:'context_checked'},row),/changed/);
  assert.equal((await h.row('owner')).reviewed,false);
});
test('real source bundles retain the original import age; target changes and missing times block review',async()=>{
  const h=await reviewHarness().seed();
  h.store.saveScan=async(k,v,a,d)=>{await h.store.set(k,v);await h.store.set(a,d);};
  const service=new RemediationService({store:h.store,jira:h.jira,clock:()=>new Date(h.now*1000).toISOString()});
  const bundle=JSON.parse(await readFile(new URL('../../../reports/judge/vulnerable.omniguard.json',import.meta.url),'utf8'));
  const scan=(await service.importReport(h.contextFor('owner'),{bundle})).scan;
  const result=await service.create(h.contextFor('owner'),{scanDigest:scan.digest,findingId:bundle.report.findings[0].id});
  h.issues.get(result.issueKey).fields.assignee={accountId:'owner'};
  const row=async()=>(await h.queue.dashboard(h.contextFor('owner'))).rows.find(r=>r.id.startsWith('code:'));
  let r=await row();assert.equal(r.fresh,true);assert.match(r.ageBasis,/Since import/);
  h.now+=86401;await service.importReport(h.contextFor('owner'),{bundle});r=await row();assert.equal(r.fresh,false);assert.ok(r.ageSeconds>=86401);
  h.now-=86401;h.data.delete('og:p:10000:active');r=await row();assert.equal(r.reviewStatus,'Blocked');assert.equal(r.digest,null);
});
test('unavailable PR provenance, incomplete scan and missing Jira owner prevent handoffs',async()=>{
  const h=await reviewHarness().seed();
  h.issues.get('LOCAL-1').fields.assignee=null;
  assert.equal((await h.row('reviewer')).fresh,false);
  const row={id:'a'.repeat(24),issueKey:'LOCAL-1',targetId:'fixture',finding:{rule_id:'OG-SOL-002',title:'Fixture'},baselineDigest:'b'.repeat(64)};
  h.data.set('og:p:10000:rem:'+row.id,row);h.data.set('og:p:10000:active','c'.repeat(64));
  h.data.set('og:p:10000:scan:'+'c'.repeat(64),{digest:'c'.repeat(64),importedAt:new Date(h.now*1000).toISOString(),provenance:{},bundle:{target:{id:'fixture'},report:{diagnostics:[],coverage:{complete:false}}}});
  h.changedPr=true;const code=(await h.queue.dashboard(h.contextFor('reviewer'))).rows.find(r=>r.kind==='Code evidence');
  assert.equal(code.fresh,false);assert.ok(code.gaps.some(s=>s.includes('provenance')));assert.ok(code.gaps.some(s=>s.includes('incomplete')));
});
