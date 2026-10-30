import { useState } from 'react';
import originalSource from '../demo/OriginalDemo.jsx?raw';
import activeSource from '../demo/ActiveDemo.jsx?raw';
import Icon from './Icon.jsx';
import SourceCode from './SourceCode.jsx';

function GenerateButton({ canGenerate, isGenerating, onGenerate }) {
  return (
    <button
      type="button" className="button button-ai" disabled={!canGenerate || isGenerating}
      aria-describedby="generate-help" onClick={onGenerate}
    >
      <Icon name={isGenerating ? 'clock' : 'sparkles'} size={17} className={isGenerating ? 'spin' : ''} />
      {isGenerating ? 'Generating proposal…' : 'Generate AI Fix'}
    </button>
  );
}

export default function CodeComparison({ scan, isScanning, scanError, proposal, isGenerating, isApplying, error, canGenerate, canApply, onGenerate, onApply }) {
  const [version, setVersion] = useState('original');
  const source = proposal ? proposal.originalCode : version === 'original' ? originalSource : activeSource;
  const fileName = proposal || version === 'active' ? 'ActiveDemo.jsx' : 'OriginalDemo.jsx';
  const generationHelp = isScanning ? 'A new scan is running. Any previous proposal has been discarded.'
    : scanError ? 'Run a successful scan before requesting another proposal.'
      : !scan ? 'Complete an accessibility scan to enable local AI generation.'
        : scan.violatedRuleCount === 0 ? 'This scan detected no violations to send to the model. Manual testing is still needed.'
          : isGenerating ? 'The local model is proposing a targeted edit. Your preview and source files remain unchanged.'
            : !canGenerate ? 'Run a new accessibility scan before generating a proposal.'
              : 'Uses the configured local Ollama model. Generation does not apply or verify a change.';

  return (
    <section id="source-review" className="page-section" aria-labelledby="source-heading" tabIndex={-1}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">02 / SOURCE REVIEW</p>
          <h2 id="source-heading">Understand every change.</h2>
          <p>Your source on the left. An AI-generated proposal on the right.</p>
        </div>
        <span className="subtle-label"><Icon name="lock" size={14} />You approve what gets applied</span>
      </div>
      <div className="comparison-grid">
        <div className="panel code-panel">
          <div className="panel-heading">
            <div className="heading-label"><Icon name="code" /><h3>Component source</h3></div>
            <span className="badge badge-neutral">{proposal ? 'Generation basis' : 'Read only'}</span>
          </div>
          <SourceCode
            key={proposal ? `${proposal.proposalId}-original` : version}
            source={source} fileName={fileName}
            copyLabel={proposal ? 'Copy original JSX used for proposal' : undefined}
            statusLabel={proposal ? 'Exact source sent to the model' : 'Loaded from the actual source file'}
            toolbar={proposal ? <span className="source-view-label">Source used for this proposal</span> : (
              <div className="source-switch" role="group" aria-label="Choose component source">
                <button type="button" aria-pressed={version === 'original'} onClick={() => setVersion('original')}>Original</button>
                <button type="button" aria-pressed={version === 'active'} onClick={() => setVersion('active')}>Active</button>
              </div>
            )}
          />
        </div>
        <div className={`panel suggestion-panel${proposal ? ' has-proposal' : ''}`} aria-busy={isGenerating}>
          <div className="panel-heading">
            <div className="heading-label"><Icon name="sparkles" /><h3>AI suggested code</h3></div>
            <span className="badge badge-purple">{isGenerating ? 'Generating' : proposal?.applied ? 'Applied & verified' : proposal ? 'Proposal only' : 'Local Ollama'}</span>
          </div>
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {isGenerating ? 'The local coding model is generating a JSX proposal.'
              : proposal?.applied ? 'AI-generated change applied. Verification results are available below.'
                : proposal ? 'AI-generated proposal ready for review. It is not applied or verified.' : ''}
          </p>
          {error && (
            <div className="scan-error generation-error" role="alert">
              <Icon name="info" size={18} />
              <div><strong>AI generation could not complete.</strong><p>{error.message}</p><span>{error.code}</span></div>
            </div>
          )}
          {proposal ? (
            <>
              <p className="proposal-notice"><Icon name="info" size={16} />{proposal.applied ? 'AI-generated change applied. See independent scan results below.' : 'AI-generated proposal — not yet applied or verified.'}</p>
              <div className="proposal-metadata">
                <span><strong>Model</strong> {proposal.model}</span>
                <time dateTime={proposal.generatedAt}>{new Date(proposal.generatedAt).toLocaleString()}</time>
              </div>
              {proposal.editPlan?.edits.map((edit) => (
                <p key={edit.target} className="generation-help"><strong>Model rationale:</strong> {edit.reason}</p>
              ))}
              <SourceCode
                key={proposal.proposalId} source={proposal.proposedCode} fileName="AIProposal.jsx"
                copyLabel="Copy AI-proposed JSX" statusLabel={proposal.applied ? 'Applied to the controlled demo' : 'Proposal text only · Not executed'}
                toolbar={<span className="source-view-label">Proposed JSX · read only</span>}
              />
              <div className="proposal-actions">
                <GenerateButton canGenerate={canGenerate} isGenerating={isGenerating} onGenerate={onGenerate} />
                {canApply && (
                  <button
                    type="button" className="button button-primary" disabled={isApplying}
                    onClick={() => {
                      if (window.confirm('Apply this approved proposal to the local ActiveDemo component and run verification?')) onApply();
                    }}
                  >
                    {isApplying ? 'Applying & verifying…' : 'Approve & Apply'}
                  </button>
                )}
                <p id="generate-help" className="generation-help">{generationHelp}</p>
              </div>
            </>
          ) : (
            <div className="suggestion-empty">
              <div className="suggestion-symbol"><Icon name={isGenerating ? 'clock' : 'sparkles'} size={30} className={isGenerating ? 'spin' : ''} /></div>
              <p className="eyebrow">THOUGHTFUL CHANGES. YOUR CALL.</p>
              <h3>{isGenerating ? <>Waiting for your<br />local model.</> : error ? <>Check the error,<br />then try again.</> : <>A suggestion starts<br />with a scan.</>}</h3>
              <p>{isGenerating
                ? 'Ollama is using the current component and genuine scan findings to propose a targeted repair.'
                : 'Ask the local coding model for a JSX proposal. Review the complete component before approving any change.'}</p>
              <GenerateButton canGenerate={canGenerate} isGenerating={isGenerating} onGenerate={onGenerate} />
              <p id="generate-help" className="feature-help">{generationHelp}</p>
            </div>
          )}
          {!proposal && <div className="suggestion-note"><Icon name="code" size={15} /><span>No proposal has been applied. Your component is unchanged.</span></div>}
        </div>
      </div>
      <div className="review-footer">
        <p><Icon name="shield" size={17} />A proposal is a suggestion, not a verified accessibility fix.</p>
        <div className="apply-control">
          <span id="apply-help">{proposal?.applied ? 'Applied and verified below.' : 'Approve the reviewed proposal above to modify the local demo.'}</span>
          <button type="button" className="button button-secondary" disabled={!canApply || isApplying} aria-describedby="apply-help" onClick={() => {
            if (window.confirm('Apply this approved proposal to the local ActiveDemo component and run verification?')) onApply();
          }}>
            <Icon name="check" size={17} />{isApplying ? 'Applying…' : 'Apply & Verify'}
          </button>
        </div>
      </div>
    </section>
  );
}
