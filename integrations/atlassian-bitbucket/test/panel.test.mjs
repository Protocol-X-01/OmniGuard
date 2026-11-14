import test from 'node:test';
import assert from 'node:assert/strict';
import { readPanel } from '../src/service.js';
const uuid='{11111111-1111-4111-8111-111111111111}';
const context={extension:{repository:{uuid},pullRequest:{id:1},location:'https://bitbucket.org/omniguard/fixtures/pull-requests/1'}};
const scan={digest:'x',provenance:{repositoryUuid:uuid},bundle:{report:{},sources:[{path:'Vault.sol',sha256:'abc',content:'private source'}]}};
test('panel uses resolver context and omits complete source text from UI response',async()=>{const result=await readPanel(context,{read:async()=>scan});assert.equal(result.sources[0].content,undefined);});
test('panel rejects missing, foreign PR and foreign repository context',async()=>{await assert.rejects(readPanel({},{}),/Open this panel/);await assert.rejects(readPanel({...context,extension:{...context.extension,pullRequest:{id:2}}},{}),/context/);await assert.rejects(readPanel(context,{read:async()=>({...scan,provenance:{repositoryUuid:'foreign'}})}),/repository context/);});

test('client URL is only a locator and must still match the trusted resolver identity',async()=>{const server={extension:{repository:{uuid},pullRequest:{id:1}}};const reader={read:async()=>scan};assert.equal((await readPanel(server,reader,{url:context.extension.location})).digest,'x');await assert.rejects(readPanel(server,reader,{url:'https://bitbucket.org/omniguard/fixtures/pull-requests/2'}),/context/);await assert.rejects(readPanel(server,{read:async()=>({...scan,provenance:{repositoryUuid:'different'}})},{url:context.extension.location}),/repository context/);});
