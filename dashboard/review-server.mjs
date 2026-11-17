import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { reviewHarness } from '../integrations/atlassian-forge/test/review-queue-harness.mjs';

export async function reviewServer(port = 4186) {
  const h = await reviewHarness().seed();
  const started = Date.now();
  h.queue.clock = h.service.clock = () => h.now + Math.floor((Date.now() - started) / 1000);
  let sequence = 1;
  const host = `127.0.0.1:${port}`;
  const assets = new Set(['review.html','review.css','review.js','frontline.css']);
  const server = http.createServer(async (req,res) => {
    const send = (status, value) => { res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value)); };
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    if(req.headers.host!==host || (req.headers.origin && req.headers.origin!==`http://${host}`)){send(403,{message:'Use the loopback exercise origin.'});return;}
    try {
      const path = new URL(req.url,`http://${host}`).pathname;
      if(req.method==='GET' && (path==='/' || assets.has(path.slice(1)))){
        const file=path==='/'?'review.html':path.slice(1);
        const bytes=await readFile(new URL(`../integrations/atlassian-forge/static/app/${file}`,import.meta.url));
        res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript'});res.end(bytes);return;
      }
      const actor = req.headers['x-omniguard-actor'] || 'owner';
      if(!['owner','reviewer','deputy','outsider'].includes(actor)){send(403,{message:'Choose a synthetic principal.'});return;}
      const context=h.contextFor(actor);
      if(req.method==='GET' && path==='/api/reviews'){send(200,await h.queue.dashboard(context));return;}
      if(req.method!=='POST' || !['/api/reviews/act','/api/reviews/lab/change','/api/reviews/lab/expire'].includes(path)){send(404,{message:'Unknown exercise endpoint.'});return;}
      if(req.headers['x-omniguard-local']!=='1' || req.headers['content-type']!=='application/json'){send(403,{message:'Use a same-origin JSON exercise request.'});return;}
      if(Number(req.headers['content-length'])>8192){send(413,{message:'Review request exceeds 8 KiB.'});req.resume();return;}
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>8192){send(413,{message:'Review request exceeds 8 KiB.'});return;}chunks.push(chunk);}
      let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{send(400,{message:'Provide valid JSON.'});return;}
      if(path==='/api/reviews/act'){send(200,await h.queue.act(context,body));return;}
      if(!body || Array.isArray(body) || Object.keys(body).length){send(400,{message:'The synthetic change takes an empty object.'});return;}
      if(path.endsWith('/expire'))h.now+=7200;
      else await h.service.import(h.contextFor('owner'),{bundle:await h.bundle(++sequence)});
      send(200,{changed:true});
    }catch(e){if(!res.headersSent)send(e.status||500,{message:e.message||'Exercise failed.'});else res.end();}
  });
  server.requestTimeout=10000;server.headersTimeout=10000;
  return {server,harness:h};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const {server}=await reviewServer();server.listen(4186,'127.0.0.1',()=>console.log('OmniGuard shared review: http://127.0.0.1:4186/ — synthetic principals; simulated Jira.'));
}
