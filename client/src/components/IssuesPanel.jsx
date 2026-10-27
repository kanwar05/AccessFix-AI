import Icon from './Icon.jsx';

function ScanButton({ isScanning, onScan }) {
  return (
    <button
      type="button" className="button button-primary" disabled={isScanning}
      aria-describedby="scan-help" onClick={onScan}
    >
      <Icon name={isScanning ? 'clock' : 'scan'} size={17} className={isScanning ? 'spin' : ''} />
      {isScanning ? 'Scanning…' : 'Scan Accessibility'}
    </button>
  );
}

function IssueCard({ issue }) {
  return (
    <details className="issue-card">
      <summary>
        <span className="issue-summary-text">
          <span className="issue-title">{issue.help}</span>
          <span className="issue-rule-id">{issue.id} · {issue.affectedElementCount} affected {issue.affectedElementCount === 1 ? 'element' : 'elements'}</span>
        </span>
        <span className={`badge issue-impact impact-${issue.impact}`}>{issue.impact}</span>
      </summary>
      <div className="issue-details">
        <p>{issue.description}</p>
        <h3>Recommended action</h3>
        <p>{issue.recommendedAction}</p>
        {issue.wcagTags.length > 0 && (
          <ul className="issue-tags" aria-label="WCAG tags">
            {issue.wcagTags.map((tag) => <li key={tag}>{tag}</li>)}
          </ul>
        )}
        <h3>Affected elements</h3>
        <ol className="affected-elements">
          {issue.nodes.map((node, index) => (
            <li key={`${JSON.stringify(node.target)}-${index}`}>
              <span className="affected-element-label">Element {index + 1}</span>
              <code className="element-selector">{node.target.map((part) => typeof part === 'string' ? part : JSON.stringify(part)).join(' → ')}</code>
              <p className="failure-summary">{node.failureSummary || 'Review the rule documentation for guidance on this element.'}</p>
              {node.html && (
                <details className="element-markup">
                  <summary>Element HTML</summary>
                  <pre tabIndex={0} role="region" aria-label={`HTML for ${issue.id} element ${index + 1}`}><code>{node.html}</code></pre>
                </details>
              )}
            </li>
          ))}
        </ol>
        <a href={issue.helpUrl} target="_blank" rel="noreferrer" className="issue-documentation">
          Read {issue.id} documentation <Icon name="external" size={13} /><span className="sr-only"> (new tab)</span>
        </a>
      </div>
    </details>
  );
}

export default function IssuesPanel({ scan, isScanning, error, onScan }) {
  const resultDescription = scan
    ? `${scan.violatedRuleCount} violated ${scan.violatedRuleCount === 1 ? 'rule' : 'rules'} affecting ${scan.affectedElementCount} ${scan.affectedElementCount === 1 ? 'element' : 'elements'}.`
    : '';
  const status = isScanning ? 'Scanning…' : error ? 'Scan failed' : scan ? 'Scan complete' : 'Not scanned';

  return (
    <section className="panel issues-panel" aria-labelledby="issues-heading">
      <div className="panel-heading">
        <div className="heading-label"><Icon name="scan" /><h2 id="issues-heading">Accessibility issues</h2></div>
        <span className="badge badge-neutral">{status}</span>
      </div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {isScanning ? 'Accessibility scan in progress.' : error ? '' : scan ? `Scan complete. ${resultDescription}` : 'Ready to scan the local component.'}
      </p>
      {error && (
        <div className="scan-error" role="alert">
          <Icon name="info" size={18} />
          <div><strong>The scan could not complete.</strong><p>{error.message}</p><span>{error.code}</span></div>
        </div>
      )}
      {!scan ? (
        <div className="issues-empty" aria-busy={isScanning}>
          <div className="scan-illustration" aria-hidden="true"><span /><Icon name={isScanning ? 'clock' : 'scan'} size={30} /></div>
          <p className="eyebrow">REAL CHECKS. ACTIONABLE FINDINGS.</p>
          <h3>{isScanning ? 'Inspecting the rendered component.' : error ? 'Ready for another attempt.' : 'Start with a real scan.'}</h3>
          <p>{isScanning
            ? 'Chromium is opening the controlled preview and running axe-core. This may take a few moments.'
            : 'Scan the local preview to find violated rules, affected elements and remediation guidance.'}</p>
          <ScanButton isScanning={isScanning} onScan={onScan} />
          <p id="scan-help" className="feature-help">{isScanning ? 'One scan at a time. Please wait for this request to finish.' : 'Only the predefined local component is scanned.'}</p>
        </div>
      ) : (
        <div className="scan-results" aria-busy={isScanning}>
          <div className="scan-result-toolbar">
            <div><p className="eyebrow">LATEST COMPLETED SCAN</p><time dateTime={scan.scannedAt}>{new Date(scan.scannedAt).toLocaleString()}</time></div>
            <ScanButton isScanning={isScanning} onScan={onScan} />
          </div>
          <p id="scan-help" className="scan-result-help">{isScanning ? 'A new scan is running. The previous report remains below.' : 'Run another scan to refresh this report. The initial baseline is retained.'}</p>
          {error && <p className="previous-scan-notice">Showing the previous successful report. The latest attempt produced no new results.</p>}
          <dl className="scan-counts">
            <div><dt>Violated rules</dt><dd>{scan.violatedRuleCount}</dd></div>
            <div><dt>Affected elements</dt><dd>{scan.affectedElementCount}</dd></div>
          </dl>
          {scan.incompleteRuleCount > 0 && (
            <p className="incomplete-notice"><Icon name="info" size={15} />{scan.incompleteRuleCount} {scan.incompleteRuleCount === 1 ? 'rule needs' : 'rules need'} manual review because axe could not determine a result.</p>
          )}
          {scan.violations.length === 0 ? (
            <div className="scan-zero-state"><Icon name="shield" size={25} /><h3>No accessibility violations were detected by the automated scan.</h3><p>Automated checks cover some issues. Manual keyboard and screen reader testing is still needed.</p></div>
          ) : (
            <div className="issues-list" role="region" aria-label="Accessibility findings" tabIndex={0}>
              {scan.violations.map((issue) => <IssueCard key={issue.id} issue={issue} />)}
            </div>
          )}
        </div>
      )}
      <div className="impact-section">
        <div className="impact-heading"><span>IMPACT LEVELS</span><span>{scan ? 'Violated rule counts' : 'Awaiting results'}</span></div>
        <dl className="impact-grid">
          {['Critical', 'Serious', 'Moderate', 'Minor', 'Unclassified'].map((impact) => (
            <div key={impact} className={impact === 'Unclassified' ? 'unclassified-impact' : undefined}>
              <dt><span className={`impact-dot ${impact.toLowerCase()}`} />{impact}</dt>
              <dd>{scan ? scan.severityBreakdown[impact.toLowerCase()] : <><span aria-hidden="true">—</span><span className="sr-only">Not scanned</span></>}</dd>
            </div>
          ))}
        </dl>
        <p className="impact-note">{scan ? 'One rule can affect multiple elements; these counts measure different things.' : 'Counts remain empty until an automated scan completes.'}</p>
      </div>
      <div className="issues-footnote"><Icon name="shield" size={16} /><span>Real browser checks, powered by Playwright + axe-core.<br /><strong>Automated results do not establish full WCAG compliance.</strong></span></div>
    </section>
  );
}
