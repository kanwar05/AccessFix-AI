import Icon from './Icon.jsx';

function Result({ label, result }) {
  return (
    <div className="verification-state">
      <div className="verification-label"><span><Icon name="scan" size={17} />{label}</span></div>
      <div className="result-value"><span>{result?.violatedRuleCount ?? '—'}</span><span>violated rules</span></div>
      <p>{result ? `${result.affectedElementCount} affected ${result.affectedElementCount === 1 ? 'element' : 'elements'}` : 'No verification result'}</p>
    </div>
  );
}

export default function VerificationPanel({ baseline, verification, proposal, error, onReset }) {
  const status = verification?.status === 'verified-improvement' ? 'Verified improvement'
    : verification ? 'Verification complete' : error ? 'Verification incomplete' : 'Not verified';
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
        <span className={`badge ${verification ? 'badge-purple' : 'badge-neutral'}`}>
        <Icon name={verification ? 'shield' : 'clock'} size={12} />{status}
        </span>
      </div>
      <div className="panel verification-panel">
        <div className="verification-grid">
          <Result label="Before repair" result={verification?.before ?? baseline} />
          <span className="comparison-arrow" aria-hidden="true">
            <Icon name="arrow" />
          </span>
          <Result label="After repair" result={verification?.after} />
        </div>
        {verification && (
          <div className="verification-note">
            <Icon name="sparkles" size={16} />
            <span>
              {verification.reductionPercentage == null ? 'No baseline violations were available for a reduction calculation.' : `${verification.reductionPercentage}% rule reduction.`}
              {verification.resolvedRuleIds.length ? ` Resolved: ${verification.resolvedRuleIds.join(', ')}.` : ' No rules were resolved.'}
              {verification.remainingRuleIds.length ? ` Remaining: ${verification.remainingRuleIds.join(', ')}.` : ''}
              {verification.introducedRuleIds.length ? ` Introduced: ${verification.introducedRuleIds.join(', ')}.` : ''}
            </span>
          </div>
        )}
        <p className="verification-note">
          <Icon name="info" size={16} />Automated checks find some accessibility issues. Manual keyboard and screen reader testing is still needed.
        </p>
        <div className="proposal-actions">
          <span className="generation-help">{proposal?.applied ? 'The reviewed proposal was applied to the controlled demo.' : 'Reset restores the trusted inaccessible baseline.'}</span>
          <button type="button" className="button button-secondary" onClick={onReset}>Reset Demo</button>
        </div>
      </div>
    </section>
  );
}
