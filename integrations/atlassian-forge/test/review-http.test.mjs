import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewServer } from '../../../dashboard/review-server.mjs';
test('review loopback HTTP rejects foreign origins, unknown actors, forged context and malformed bodies',async()=>{
  const port=4187,{server}=await reviewServer(port);await new Promise(r=>server.listen(port,'127.0.0.1',r));
  try{
    const base=`http://127.0.0.1:${port}`,headers={'Content-Type':'application/json','X-OmniGuard-Local':'1','X-OmniGuard-Actor':'reviewer'};
    assert.equal((await fetch(base+'/api/reviews',{headers:{Origin:'https://foreign.example'}})).status,403);
    assert.equal((await fetch(base+'/api/reviews',{headers:{'X-OmniGuard-Actor':'admin'}})).status,403);
    assert.equal((await fetch(base+'/api/reviews/act',{method:'POST',body:'{}'})).status,403);
    assert.equal((await fetch(base+'/api/reviews/act',{method:'POST',headers,body:'x'.repeat(8193)})).status,413);
    assert.equal((await fetch(base+'/api/reviews/act',{method:'POST',headers,body:'invalid'})).status,400);
    const r=(await(await fetch(base+'/api/reviews',{headers})).json()).rows[0];
    const payload={id:r.id,revision:r.revision,evidenceToken:r.evidenceToken,action:'take_reviewer',label:'Morgan'};
    assert.equal((await fetch(base+'/api/reviews/act',{method:'POST',headers,body:JSON.stringify({...payload,accountId:'owner'})})).status,400);
    assert.equal((await fetch(base+'/api/reviews/act',{method:'POST',headers,body:JSON.stringify(payload)})).status,200);
    assert.equal((await fetch(base+'/api/reviews/act',{method:'POST',headers,body:JSON.stringify(payload)})).status,409);
  }finally{await new Promise(r=>server.close(r));}
});
