import Icon from './Icon.jsx';

export default function IssuesPanel() {
  return (
    <section className="panel issues-panel" aria-labelledby="issues-heading">
      <div className="panel-heading">
        <div className="heading-label"><Icon name="scan" /><h2 id="issues-heading">Accessibility issues</h2></div>
        <span className="badge badge-neutral">Not scanned</span>
      </div>
      <div className="issues-empty">
        <div className="scan-illustration" aria-hidden="true"><span /><Icon name="scan" size={30} /></div>
        <p className="eyebrow">A CLEARER PICTURE STARTS HERE</p>
        <h3>No scan has run yet.</h3>
        <p>Actual violations, affected elements and actionable guidance will appear here after a real scan.</p>
        <button type="button" className="button button-primary" disabled aria-describedby="scan-help">
          <Icon name="scan" size={17} />Scan Accessibility
        </button>
        <p id="scan-help" className="feature-help"><Icon name="lock" size={12} />Not connected · Detection arrives in Phase 2</p>
      </div>
      <div className="impact-section">
        <div className="impact-heading"><span>IMPACT LEVELS</span><span>Awaiting results</span></div>
        <dl className="impact-grid">
          {['Critical', 'Serious', 'Moderate', 'Minor'].map((impact) => (
            <div key={impact}>
              <dt><span className={`impact-dot ${impact.toLowerCase()}`} />{impact}</dt>
              <dd><span aria-hidden="true">—</span><span className="sr-only">Not scanned</span></dd>
            </div>
          ))}
        </dl>
        <p className="impact-note">Counts remain empty until an automated scan completes.</p>
      </div>
      <div className="issues-footnote"><Icon name="shield" size={16} /><span>Real browser checks, powered by Playwright + axe-core.<br /><strong>Engine integration is the next milestone.</strong></span></div>
    </section>
  );
}
