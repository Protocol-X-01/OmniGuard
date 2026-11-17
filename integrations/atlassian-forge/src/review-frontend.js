export async function mountReviewQueue(root = document) {
  const $ = s => root.querySelector(s), local = location.hostname === '127.0.0.1';
  const bridge = local ? null : await import('@forge/bridge');
  let data, selected, busy = false, actor = new URL(location.href).searchParams.get('actor') || 'owner';
  let site = '';
  if (!local) site = (await bridge.view.getContext()).siteUrl || '';
  const el = (tag, text, cls) => { const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n; };
  const msg = (s,error=false) => { $('#notice').textContent=s;$('#notice').className=`notice${error?' error':''}`; };
  const age = n => n===null?'Unknown':n<60?'Less than a minute':n<3600?`${Math.floor(n/60)} min`:n<86400?`${Math.floor(n/3600)} h`:`${Math.floor(n/86400)} d`;
  const time = n => n ? new Date(n*1000).toISOString().replace('T',' ').replace('.000Z',' UTC') : 'Unknown';
  const call = async (name,payload) => {
    if (!local) return bridge.invoke(name,payload);
    const response=await fetch(`/api/reviews${name==='getReviewQueue'?'':'/act'}`,{method:payload?'POST':'GET',headers:{'Content-Type':'application/json','X-OmniGuard-Local':'1','X-OmniGuard-Actor':actor},...(payload?{body:JSON.stringify(payload)}:{})});
    const value=await response.json();if(!response.ok)throw new Error(value.message);return value;
  };
  const refresh = async()=>{data=await call('getReviewQueue');render();};
  const run = async(fn,message)=>{
    if(busy)return;busy=true;root.querySelectorAll('button,input,select').forEach(n=>n.disabled=true);
    try{await fn();await refresh();msg(message);}catch(e){try{await refresh();}catch{/* Preserve the action error. */}msg(e.message||'Refresh the queue before trying again.',true);}
    finally{busy=false;root.querySelectorAll('button,input,select').forEach(n=>n.disabled=false);$('#notice').focus();}
  };
  const button=(text,fn,cls='')=>{const n=el('button',text,cls);n.type='button';n.onclick=fn;n.disabled=busy;return n;};
  const action=(row,name,rest={},message='Review queue updated.')=>run(()=>call('actReviewQueue',{id:row.id,revision:row.revision,evidenceToken:row.evidenceToken,action:name,...rest}),message);
  const choice=(label,values,parent)=>{const box=el('div'),select=el('select');select.id=`review-${label.toLowerCase().replaceAll(' ','-')}`;const l=el('label',label);l.htmlFor=select.id;values.forEach(([v,t])=>{const o=el('option',t);o.value=v;select.append(o);});box.append(l,select);parent.append(box);return select;};
  const purposes={review_evidence:'Review the evidence',add_context:'Add the missing context',address_changes:'Address requested changes'};
  function details(row){
    const target=$('#detail');target.replaceChildren();
    if(!row){target.append(el('h2','Ready for the next review'),el('p','Create an evidenced Jira remediation in Code evidence or Team defence. Its owner and review handoffs will appear here.','muted'));return;}
    const head=el('div',undefined,'detail-head'),titles=el('div');titles.append(el('p',`${row.issueKey} · ${row.kind}`,'eyebrow'),el('h2',row.title));head.append(titles,el('span',row.reviewStatus,`pill ${row.reviewed?'pass':row.fresh?'unknown':'stale'}`));target.append(head);
    const roles=el('div',undefined,'role-grid');for(const [name,role]of[['Owner',row.owner],['Reviewer',row.reviewer],['Deputy',row.deputy]]){const box=el('div');box.append(el('span',name),el('strong',role?`${role.label}${role.isYou?' · you':''}`:'Unassigned'));roles.append(box);}target.append(roles);
    if(row.reviewer&&!row.independent)target.append(el('p','A separate account must take review. The current Jira owner also holds the reviewer role.','notice'));
    const handoff=el('section',undefined,'handoff-strip');handoff.setAttribute('aria-label','Next handoff');
    if(row.handoff?.current){handoff.append(el('strong',`${row.handoff.acceptedAt?'In hand':'Next step'} · ${row.handoff.recipient}`),el('p',purposes[row.handoff.purpose]),el('p',row.handoff.acceptedAt?`Accepted ${time(row.handoff.acceptedAt)}`:`Requested ${time(row.handoff.at)} · awaiting explicit acceptance`));}
    else handoff.append(el('strong',row.reviewed?'Evidence review is current':row.handoff?'The handoff needs a fresh review':'Ready for a clear handoff'),el('p',row.reviewed?'The independent review is recorded for this exact evidence.':row.handoff?'The evidence, owner or participants changed, or the evidence expired. Previous receipts remain below.':'Take a review role, then ask its recipient to pick up the next step.'));
    if(row.can.accept)handoff.append(button('Accept handoff',()=>action(row,'accept',{},'Handoff accepted. You have the next step.')));target.append(handoff);
    if(row.decision?.current){const decision=el('p',`Review outcome: ${row.decision.decision==='reviewed'?'Evidence reviewed':'Changes requested'} · ${row.decision.reason.replaceAll('_',' ')} · ${time(row.decision.at)}`,'notice');target.append(decision);}
    if(row.gaps.length){const gaps=el('div',undefined,'gaps'),list=el('ul');gaps.append(el('strong','Context needed'));row.gaps.forEach(g=>list.append(el('li',g)));gaps.append(list);target.append(gaps);}
    if(row.can.takeReviewer||row.can.takeDeputy){const section=el('section',undefined,'review-actions');section.append(el('h3','Take responsibility'));const form=el('div',undefined,'form-row'),group=el('div'),label=el('label','Your display label'),input=el('input');input.id='review-label';input.maxLength=60;input.placeholder='Name or team role';label.htmlFor=input.id;group.append(label,input);form.append(group);
      if(row.can.takeReviewer)form.append(button('Take review',()=>action(row,'take_reviewer',{label:input.value.trim()},'Independent review responsibility recorded.')));
      if(row.can.takeDeputy)form.append(button('Be deputy',()=>action(row,'take_deputy',{label:input.value.trim()},'Deputy responsibility recorded.')));
      section.append(form,el('p','Use a label your team recognizes. Your signed-in account controls the role. Owners review through a separate account.','muted'));target.append(section);}
    if(row.can.handoff){const section=el('section',undefined,'review-actions');section.append(el('h3','Hand over the next step'));const form=el('div',undefined,'form-row');const candidates=[['owner',row.owner],['reviewer',row.reviewer],['deputy',row.deputy]].filter(([,r])=>r&&!r.isYou);
      if(candidates.length){const to=choice('Recipient',candidates.map(([k,r])=>[k,`${k[0].toUpperCase()+k.slice(1)} · ${r.label}`]),form),purpose=choice('Purpose',Object.entries(purposes),form);form.append(button('Request handoff',()=>action(row,'handoff',{toRole:to.value,purpose:purpose.value},'Handoff requested. The recipient must explicitly accept it.')));section.append(form);}else section.append(el('p','A separate participant needs to take a reviewer or deputy role first.','muted'));target.append(section);}
    if(row.can.decide){const section=el('section',undefined,'review-actions');section.append(el('h3','Record your evidence review'));const form=el('div',undefined,'form-row'),decision=choice('Review outcome',[['reviewed','Evidence reviewed'],['needs_changes','Needs changes']],form),reason=choice('Review reason',[['context_checked','Context and evidence checked'],['changes_needed','Changes need attention'],['missing_context','More context needed']],form);
      decision.onchange=()=>{reason.value=decision.value==='reviewed'?'context_checked':'changes_needed';};
      form.append(button('Record review',()=>action(row,'decide',{decision:decision.value,reason:reason.value},'Evidence review recorded. Remediation completion stays in the evidence workflow.')));section.append(form);target.append(section);}
    const evidence=el('details',undefined,'evidence-box');evidence.append(el('summary',row.ageSeconds===null?'Evidence · age unknown':`Evidence · ${age(row.ageSeconds)} old`));const list=el('dl');for(const [k,v]of[['Age basis',row.ageBasis],['Evidence time',time(row.observedAt)],['Review window ends',time(row.expiresAt)],['Coverage',row.coverage],['Jira status',row.status],['Current SHA-256',row.digest||'Unavailable'],['Original SHA-256',row.baselineDigest]]){list.append(el('dt',k),el('dd',v,k.includes('SHA')?'digest':''));}evidence.append(list);target.append(evidence);
    if(row.history.length){const history=el('details',undefined,'evidence-box');history.append(el('summary',`${row.history.length} review and handoff receipts`));const events=el('ol',undefined,'receipt-list');for(const h of row.history){const li=el('li',`${h.actor}${h.isYou?' · you':''}: ${h.action.replaceAll('_',' ')}${h.toRole?` → ${h.toRole}`:''}${h.decision?` · ${h.decision.replaceAll('_',' ')}`:''}`);li.append(el('time',time(h.at)),el('span',`Evidence ${h.digest||'unavailable'}`,'digest'));events.append(li);}history.append(events);target.append(history);}
    const links=el('div',undefined,'review-actions');if(!local)links.append(button('Open Jira owner and issue',()=>bridge.router.open(`${site}/browse/${row.issueKey}`),'secondary'));
    if(row.can.releaseReviewer)links.append(button('Release review role',()=>action(row,'release_reviewer'),'secondary'));
    if(row.can.releaseDeputy)links.append(button('Release deputy role',()=>action(row,'release_deputy'),'secondary'));target.append(links);
  }
  function render(){
    if(!data)return;$('#project').textContent=`${data.project.key} · shared review`;$('#refreshed').textContent=`Refreshed ${time(data.refreshedAt)}${data.unavailable?` · ${data.unavailable} unavailable item(s) omitted`:''}`;
    $('#total').textContent=data.rows.length;$('#waiting').textContent=data.rows.filter(r=>r.reviewStatus==='Awaiting acceptance').length;$('#reviewed').textContent=data.rows.filter(r=>r.reviewed).length;$('#blocked').textContent=data.rows.filter(r=>!r.fresh).length;
    const filter=$('#filter').value,query=$('#search').value.toLowerCase();const rows=data.rows.filter(r=>(`${r.title} ${r.issueKey}`).toLowerCase().includes(query)&&(filter==='all'||filter==='mine'&&[r.owner,r.reviewer,r.deputy].some(v=>v?.isYou)||filter==='waiting'&&r.reviewStatus==='Awaiting acceptance'||filter==='required'&&!r.reviewed&&r.fresh||filter==='blocked'&&!r.fresh));
    if(!rows.some(r=>r.id===selected))selected=rows[0]?.id;$('#items').replaceChildren();
    if(!rows.length)$('#items').append(el('p',data.rows.length?'No items match these filters.':'No tracked work yet. Create a Jira remediation from validated evidence to begin.','empty'));
    for(const row of rows){const b=button('',()=>{selected=row.id;render();},'item');b.setAttribute('aria-pressed',String(row.id===selected));b.setAttribute('aria-label',`${row.issueKey} ${row.title}`);const meta=el('span',undefined,'item-meta');meta.append(el('span',row.issueKey),el('span',row.reviewStatus,`pill ${row.reviewed?'pass':row.fresh?'unknown':'stale'}`));b.append(meta,el('strong',row.title),el('span',`${row.owner?.label||'Owner needed'} · ${row.ageSeconds===null?'age unknown':age(row.ageSeconds)+' old'}`,'muted'));$('#items').append(b);}
    details(rows.find(r=>r.id===selected));
  }
  $('#filter').onchange=render;$('#search').oninput=render;$('#refresh').onclick=()=>run(()=>Promise.resolve(),'Queue refreshed. Evidence age and Jira ownership checked.');
  $('#runtime').textContent=local?'Local exercise · synthetic users and simulated Jira; state lasts until the preview stops.':'Forge development feature · review receipts are stored in this app and project.';
  if(local){root.querySelectorAll('nav a:not([aria-current])').forEach(a=>a.remove());root.querySelector('.brand').href='#queue';$('#lab-controls').hidden=false;$('#lab-actor').value=actor;$('#lab-actor').onchange=e=>{actor=e.target.value;run(()=>Promise.resolve(),'Synthetic participant changed.');};for(const [id,path]of[['#lab-change','change'],['#lab-expire','expire']])$(id).onclick=()=>run(async()=>{const r=await fetch(`/api/reviews/lab/${path}`,{method:'POST',headers:{'Content-Type':'application/json','X-OmniGuard-Local':'1'},body:'{}'});if(!r.ok)throw new Error('Lab change failed.');},'Synthetic evidence changed. Old reviews and handoffs were invalidated.');}
  try{await refresh();msg('Ready. Choose an item to review its evidence and next handoff.');}catch(e){msg(e.message,true);}
  return refresh;
}
