import Icon from './Icon.jsx';

export default function VerificationPanel({ baseline }) {
  return (
    <section
      id="verification"
      className="page-section"
      aria-labelledby="verification-heading"
      tabIndex={-1}
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">03 / VERIFICATION</p>
          <h2 id="verification-heading">Let the results speak.</h2>
          <p>The same automated checks, before and after a reviewed fix.</p>
        </div>
        <span className="badge badge-neutral">
          <Icon name="clock" size={12} />Verification arrives in Phase 4
        </span>
      </div>
      <div className="panel verification-panel">
        <div className="verification-grid">
          <div className="verification-state">
            <div className="verification-label">
              <span>
                <Icon name="scan" size={17} />Before repair
              </span>
              <span className="badge badge-neutral">{baseline ? 'Baseline saved' : 'Not scanned'}</span>
            </div>
            <div className="result-value">
              {baseline ? <span>{baseline.violatedRuleCount}</span> : <><span aria-hidden="true">—</span><span className="sr-only">No scan result</span></>}
              <span>violated rules</span>
            </div>
            {baseline ? <>
              <p>{baseline.affectedElementCount} affected {baseline.affectedElementCount === 1 ? 'element' : 'elements'} · <time dateTime={baseline.scannedAt}>{new Date(baseline.scannedAt).toLocaleString()}</time></p>
              <p className="baseline-note">The first successful scan is retained for this page session. Refreshing clears it.</p>
            </> : <p>The first successful scan will establish the starting point.</p>}
          </div>
          <span className="comparison-arrow" aria-hidden="true">
            <Icon name="arrow" />
          </span>
          <div className="verification-state">
            <div className="verification-label">
              <span>
                <Icon name="shield" size={17} />After repair
              </span>
              <span className="badge badge-neutral">Not verified</span>
            </div>
            <div className="result-value">
              <span aria-hidden="true">—</span>
              <span className="sr-only">No verification result</span>
              <span>violated rules</span>
            </div>
            <p>Apply and verification are not connected. A later phase will report remaining problems after an approved fix.</p>
          </div>
        </div>
        <p className="verification-note">
          <Icon name="info" size={16} />Automated checks find some accessibility issues. Manual keyboard and screen reader testing is still needed.
        </p>
      </div>
    </section>
  );
}
