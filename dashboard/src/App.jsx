import { useEffect, useMemo, useState } from 'react';
import { createRemediation, getRemediations, scanScenario } from './api.js';
import { version as dashboardVersion } from '../package.json';

const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

function ShieldMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 40 40" className="shield-mark">
      <path d="M20 3.5 34 9v9.7c0 8.5-5.5 14.2-14 18-8.5-3.8-14-9.5-14-18V9l14-5.5Z" />
      <path d="m12.2 20.2 5 5 10.6-11" />
    </svg>
  );
}

function SeverityPill({ severity }) {
  return <span className={`severity severity-${severity}`}>{severity}</span>;
}

function Step({ state, index, title, detail }) {
  return (
    <div className={`step step-${state}`}>
      <span className="step-index" aria-hidden="true">{state === 'done' ? '✓' : index}</span>
      <div>
        <p className="step-title"><span className="sr-only">{state === 'done' ? 'Complete: ' : state === 'current' ? 'Current step: ' : 'Pending: '}</span>{title}</p>
        <p className="step-detail">{detail}</p>
      </div>
    </div>
  );
}

export default function App() {
  const [scenario, setScenario] = useState('vulnerable');
  const [report, setReport] = useState(null);
  const [remediations, setRemediations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const incomplete = Boolean(report && (report.diagnostics.length || report.coverage?.complete === false));

  async function refresh(nextScenario = scenario) {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const [nextReport, nextRemediations] = await Promise.all([
        scanScenario(nextScenario),
        getRemediations(),
      ]);
      setScenario(nextScenario);
      setReport(nextReport);
      setRemediations(nextRemediations);
      setSelectedId(nextReport.findings[0]?.id ?? null);
      if (nextReport.diagnostics.length || nextReport.coverage?.complete === false) {
        setNotice('Fixture rescanned with analysis limitations. Review the diagnostics.');
      } else if (nextScenario === 'fixed') {
        setNotice(nextReport.findings.length ? 'Fixed fixture rescanned. Findings remain for review.' : 'Fixed fixture rescanned. No detections under the reported rules.');
      } else {
        setNotice('Vulnerable fixture rescanned with the Rust analyzer.');
      }
    } catch (scanError) {
      setReport(null);
      setSelectedId(null);
      setError(scanError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh('vulnerable');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleFindings = useMemo(() => {
    const findings = report?.findings ?? [];
    return findings
      .filter((finding) => filter === 'all' || finding.severity === filter)
      .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  }, [filter, report]);

  const activeFinding = visibleFindings.find((finding) => finding.id === selectedId) ?? visibleFindings[0];
  const hasIssueForFinding = activeFinding && remediations.some((issue) => issue.findingId === activeFinding.id);
  const fixedRescan = scenario === 'fixed' && remediations.length > 0 && report && !loading && !incomplete && report.findings.length === 0;

  async function handleCreateRemediation() {
    if (!activeFinding) return;
    setCreating(true);
    setError('');
    try {
      const created = await createRemediation(scenario, activeFinding.id);
      setRemediations((current) => [created, ...current]);
      setNotice(`${created.issueKey} created as a local Jira draft.`);
    } catch (createError) {
      setError(createError.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to scan review</a>
      <aside className="sidebar" aria-label="OmniGuard navigation">
        <a className="brand" href="#main" aria-label="OmniGuard home">
          <ShieldMark />
          <span>OmniGuard</span>
        </a>
        <div className="side-caption">WORKSPACE</div>
        <div className="workspace-chip"><span className="workspace-dot" /> Solidity review</div>
        <nav className="side-nav" aria-label="Workspace pages">
          <a className="nav-item active" href="#main" aria-current="page">
            <span className="nav-glyph glyph-grid" aria-hidden="true">▦</span> Scan review
          </a>
          <a className="nav-item muted" href="#workflow">
            <span className="nav-glyph" aria-hidden="true">↗</span> Remediation flow
          </a>
        </nav>
        <div className="sidebar-bottom">
          <div className="local-badge"><span aria-hidden="true">●</span> Local demo</div>
          <p>Fixture source only<br />No chain connection</p>
          <div className="engine-version">Engine {report?.engine_version ?? dashboardVersion}</div>
        </div>
      </aside>

      <main id="main" className="main-content" tabIndex={-1}>
        <header className="topbar">
          <div className="breadcrumb"><span>OmniGuard</span><span aria-hidden="true">/</span><strong>Scan review</strong></div>
          <div className="topbar-right"><span className="environment-tag">FOUNDRY FIXTURES</span><span className="avatar" aria-label="Local workspace">PX</span></div>
        </header>

        <div className="page-wrap">
          <section className="page-heading" aria-labelledby="page-title">
            <div>
              <p className="eyebrow">EVIDENCE REVIEW · V0.1</p>
              <h1 id="page-title">Make the fix<br className="mobile-break" /> easy to verify.</h1>
              <p className="heading-copy">A deterministic Solidity scan, with source evidence that stays attached to the remediation.</p>
            </div>
            <button className="button button-outline scan-toggle" onClick={() => refresh(scenario === 'vulnerable' ? 'fixed' : 'vulnerable')} disabled={loading}>
              <span aria-hidden="true">↻</span>{loading ? 'Scanning…' : scenario === 'vulnerable' ? 'Rescan fixed fixture' : 'Restore vulnerable fixture'}
            </button>
          </section>

          <section id="workflow" className="workflow" aria-label="Remediation workflow">
            <Step state={loading ? 'current' : report && !incomplete ? 'done' : 'idle'} index="1" title="Scan source" detail={loading ? 'Scanning the selected fixture' : !report ? 'Scan unavailable — retry' : incomplete ? 'Review the analysis limitations' : `${report.scanned_files} Solidity file(s) · ${scenario === 'vulnerable' ? 'vulnerable sample' : 'fixed sample'}`} />
            <span className="step-connector" aria-hidden="true" />
            <Step state={remediations.length ? 'done' : activeFinding ? 'current' : 'idle'} index="2" title="Track in Jira" detail={remediations[0]?.issueKey ?? 'Create a remediation draft'} />
            <span className="step-connector" aria-hidden="true" />
            <Step state={fixedRescan ? 'done' : 'idle'} index="3" title="Verify the fix" detail={fixedRescan ? 'No findings remain' : 'Rescan after the change'} />
          </section>

          {notice && <p className="notice" role="status"><span aria-hidden="true">✓</span>{notice}</p>}
          {error && <p className="error-banner" role="alert">{error}</p>}
          {incomplete && (
            <div className="diagnostic-banner" role="alert">
              <strong>Scan needs attention</strong>
              <p>{report.diagnostics.map((item) => item.message).join(' ') || 'Input coverage is incomplete.'}</p>
            </div>
          )}

          <section className="summary-grid" aria-label="Scan summary">
            <div className="summary-card summary-primary">
              <div className="summary-label">OPEN FINDINGS</div>
              <div className="summary-value">{report?.findings.length ?? '—'}<span> in this fixture</span></div>
              <div className="summary-rule"><span style={{ width: `${Math.min((report?.findings.length ?? 0) * 25, 100)}%` }} /></div>
            </div>
            <div className="summary-card">
              <div className="summary-label">HIGH SEVERITY</div>
              <div className="summary-value">{report?.findings.filter((finding) => finding.severity === 'high').length ?? '—'}</div>
              <div className="summary-note">{report ? incomplete ? 'Reported coverage is incomplete' : `${report.coverage?.rules.length ?? '—'} reported rules · source evidence rechecked` : 'Waiting for a completed scan'}</div>
            </div>
            <div className="summary-card">
              <div className="summary-label">JIRA REMEDIATIONS</div>
              <div className="summary-value">{remediations.length}<span> local draft{remediations.length === 1 ? '' : 's'}</span></div>
              <div className="summary-note">Demo records stay in this local session</div>
            </div>
          </section>

          <section className="review-section" aria-labelledby="findings-title">
            <div className="section-header">
              <div>
                <p className="eyebrow">SOURCE FINDINGS</p>
                <h2 id="findings-title">Evidence ledger</h2>
              </div>
              <label className="filter-control">Filter severity
                <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                  <option value="all">All findings</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </label>
            </div>

            {loading && !report ? (
              <div className="empty-panel"><span className="loader" aria-hidden="true" /><p>Running the fixture scan…</p></div>
            ) : !report ? (
              <div className="diagnostic-banner" role={error ? undefined : 'alert'}><strong>Fixture scan unavailable</strong><p>Start the local demo API, then rescan this page.</p></div>
            ) : !visibleFindings.length ? (
              <div className={`clear-panel ${incomplete ? 'needs-review' : ''}`}>
                <div className="clear-icon" aria-hidden="true">✓</div>
                <div><h3>{incomplete ? 'Scan incomplete' : report.findings.length ? 'No findings match this filter' : 'No findings in the fixed fixture'}</h3>
                  <p>{incomplete ? 'Review the parser diagnostics before treating this result as clean.' : report.findings.length ? 'Choose another severity to see the remaining results.' : 'No detections under the reported rules. Review the change and the analyzer limitations before completing a remediation.'}</p>
                </div>
                <span className="clear-state">{incomplete ? 'REVIEW NEEDED' : report.findings.length ? 'FILTERED VIEW' : 'RESCAN COMPLETE'}</span>
              </div>
            ) : (
              <div className="evidence-layout">
                <div className="finding-list" role="group" aria-label="Security findings">
                  {visibleFindings.map((finding) => (
                    <button
                      type="button"
                      className={`finding-row ${activeFinding?.id === finding.id ? 'selected' : ''}`}
                      key={finding.id}
                      onClick={() => setSelectedId(finding.id)}
                      aria-pressed={activeFinding?.id === finding.id}
                    >
                      <span className="finding-rail" aria-hidden="true" />
                      <span className="finding-row-top"><SeverityPill severity={finding.severity} /><span className="confidence">{finding.confidence} confidence</span></span>
                      <strong>{finding.title}</strong>
                      <span className="finding-path">{finding.location.file}<span aria-hidden="true"> · </span>line {finding.location.start_line}</span>
                    </button>
                  ))}
                </div>

                {activeFinding && <article className="evidence-card" aria-labelledby="evidence-title">
                  <div className="evidence-card-header">
                    <div><span className="rule-id">{activeFinding.rule_id}</span><SeverityPill severity={activeFinding.severity} /></div>
                    <span className="validated"><span aria-hidden="true">✓</span> Evidence checked</span>
                  </div>
                  <h3 id="evidence-title">{activeFinding.title}</h3>
                  <p className="evidence-message">{activeFinding.message}</p>

                  <div className="source-location"><span className="file-icon" aria-hidden="true">⌘</span><span>{activeFinding.location.file}</span><span className="location-separator">:</span><span>{activeFinding.location.start_line}:{activeFinding.location.start_column}</span></div>
                  <div className="code-frame" aria-label="Source evidence">
                    <div className="code-head"><span>VALIDATED SOURCE SPAN</span><span>{activeFinding.evidence.source_sha256.slice(0, 12)}</span></div>
                    <pre><code><span className="line-no">{String(activeFinding.location.start_line).padStart(2, '0')}</span><span className="code-text">{activeFinding.evidence.excerpt}</span></code></pre>
                  </div>

                  {activeFinding.context && <p className="source-context">Context: {activeFinding.context.contract ?? 'source'}.{activeFinding.context.function ?? 'scope'}</p>}
                  {(activeFinding.evidence.related ?? []).map((item, index) => <details className="related-evidence" key={`${item.location.byte_start}-${index}`}>
                    <summary>{item.label} · {item.location.file}:{item.location.start_line}</summary>
                    <pre><code>{item.excerpt}</code></pre>
                    {item.source_sha256 && <p className="source-context">Source SHA-256: {item.source_sha256}</p>}
                  </details>)}

                  <div className="remediation-note">
                    <span className="remediation-icon" aria-hidden="true">↳</span>
                    <div><strong>Suggested remediation</strong><p>{activeFinding.remediation}</p></div>
                  </div>

                  <div className="evidence-meta">
                    <span>SHA-256</span><code>{activeFinding.evidence.source_sha256.slice(0, 20)}…</code>
                    <span>BYTE SPAN</span><code>{activeFinding.location.byte_start}–{activeFinding.location.byte_end}</code>
                  </div>

                  <div className="evidence-actions">
                    <button className="button button-primary" onClick={handleCreateRemediation} disabled={creating || hasIssueForFinding || incomplete}>
                      {creating ? 'Preparing draft…' : hasIssueForFinding ? 'Jira draft created' : 'Create Jira remediation'}
                      {!hasIssueForFinding && <span aria-hidden="true">↗</span>}
                    </button>
                    <span className="demo-action-note">Creates a local demo draft</span>
                  </div>
                </article>}
              </div>
            )}
          </section>

          {remediations.length > 0 && <section className="jira-section" aria-labelledby="jira-title">
            <div className="section-header jira-header"><div><p className="eyebrow">REMEDIATION TRACKER</p><h2 id="jira-title">Jira issue drafts</h2></div><span className="local-tag">LOCAL DEMO</span></div>
            <div className="jira-list">
              {remediations.map((issue) => {
                const resolved = scenario === 'fixed' && report && !loading && !incomplete
                  && !(report.findings).some((finding) => finding.rule_id === issue.ruleId && finding.location.file === issue.file);
                return <div className="jira-row" key={issue.issueKey}>
                  <span className={`jira-status ${resolved ? 'status-resolved' : ''}`} aria-hidden="true">{resolved ? '✓' : '•'}</span>
                  <span className="jira-key">{issue.issueKey}</span>
                  <span className="jira-title">{issue.title}</span>
                  <span className={`issue-state ${resolved ? 'issue-state-resolved' : ''}`}>{resolved ? 'Resolved on rescan' : 'Open · demo draft'}</span>
                </div>;
              })}
            </div>
          </section>}

          <footer className="page-footer"><span>OmniGuard v{report?.engine_version ?? dashboardVersion}</span><span>{!report ? 'No scan loaded' : report.analysis?.mode === 'solc' ? `Compiler-assisted scan · ${report.analysis.compiler_version}` : 'Scoped AST scan · source-validated evidence'}</span><span className="footer-safe">Isolated fixtures only</span></footer>
        </div>
      </main>
    </div>
  );
}
