import Icon from './Icon.jsx';

export default function VerificationPanel() {
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
          <Icon name="clock" size={12} />Awaiting integration
        </span>
      </div>
      <div className="panel verification-panel">
        <div className="verification-grid">
          <div className="verification-state">
            <div className="verification-label">
              <span>
                <Icon name="scan" size={17} />Before repair
              </span>
              <span className="badge badge-neutral">Not scanned</span>
            </div>
            <div className="result-value">
              <span aria-hidden="true">—</span>
              <span className="sr-only">No scan result</span>
              <span>automated violations</span>
            </div>
            <p>A real baseline scan will establish the starting point.</p>
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
              <span>automated violations</span>
            </div>
            <p>Verification will report resolved and remaining problems.</p>
          </div>
        </div>
        <p className="verification-note">
          <Icon name="info" size={16} />Automated checks find some accessibility issues. Manual keyboard and screen reader testing is still needed.
        </p>
      </div>
    </section>
  );
}
