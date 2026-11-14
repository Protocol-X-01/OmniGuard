import { invoke, view } from '@forge/bridge';
const $ = (id) => document.getElementById(id);
const node = (tag, text, className) => { const n=document.createElement(tag); n.textContent=text; if(className)n.className=className; return n; };
async function load() {
  $('refresh').disabled=true; $('notice').textContent='Checking the current pull-request commit…';
  $('findings').replaceChildren(); $('identity').replaceChildren(); $('summary').textContent=''; $('pr-url').value='';
  try {
    const context=await view.getContext();
    const scan=await invoke('getPullRequestScan', {url: context.extension?.location}); const p=scan.provenance;
    $('summary').textContent=`${scan.report.findings.length} findings · ${scan.report.scanned_files} source files · engine ${scan.report.engine_version} · ${scan.report.analysis.mode} · ${scan.report.coverage.rules.length} rules`;
    for (const [label,value] of [['Pull request',`${p.workspace}/${p.repository} #${p.pullRequestId}`],['Source commit',p.commit],['Destination commit',p.destinationCommit],['Evidence digest',scan.digest]]) $('identity').append(node('dt',label),node('dd',value));
    for (const finding of scan.report.findings) {
      const article=node('article',''); article.append(node('p',`${finding.rule_id} · ${finding.severity} · ${finding.confidence} confidence`,'eyebrow'),node('h3',finding.title),node('p',`${finding.location.file}:${finding.location.start_line}`,'help'),node('pre',finding.evidence.excerpt),node('p',finding.remediation)); $('findings').append(article);
    }
    if (!scan.report.findings.length) $('findings').append(node('p','No detections in this report. Review the code change and verify the matching Jira remediation.'));
    $('pr-url').value=p.url; $('notice').textContent='Current PR source bytes match the complete report. Both commit identities were checked.'; $('notice').className='success';
  } catch(error) { $('notice').textContent=error.message || 'The PR scan could not be checked.'; $('notice').className='error'; }
  finally { $('refresh').disabled=false; }
}
$('refresh').addEventListener('click',load); await load();
