import { useEffect, useRef, useState } from 'react';
import originalSource from '../demo/OriginalDemo.jsx?raw';
import activeSource from '../demo/ActiveDemo.jsx?raw';
import Icon from './Icon.jsx';

const tokenPattern = /(\/\/.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|<\/?[\w.]+|\b(?:import|from|export|default|function|const|return|if|true|false)\b)/g;

function SourceLine({ line }) {
  return line.split(tokenPattern).map((token, index) => {
    let color;
    if (token.startsWith('//')) color = 'syntax-comment';
    else if (/^["']/.test(token)) color = 'syntax-string';
    else if (token.startsWith('<')) color = 'syntax-tag';
    else if (/^(import|from|export|default|function|const|return|if|true|false)$/.test(token)) color = 'syntax-keyword';
    return <span key={index} className={color}>{token}</span>;
  });
}

export default function CodeComparison() {
  const [version, setVersion] = useState('original');
  const [copyStatus, setCopyStatus] = useState('idle');
  const copyTimer = useRef(null);
  const source = version === 'original' ? originalSource : activeSource;
  const fileName = version === 'original' ? 'OriginalDemo.jsx' : 'ActiveDemo.jsx';
  const lines = source.trimEnd().split('\n');

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  async function copySource() {
    clearTimeout(copyTimer.current);
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(source);
      setCopyStatus('copied');
      copyTimer.current = setTimeout(() => setCopyStatus('idle'), 2500);
    } catch {
      setCopyStatus('error');
    }
  }

  function selectVersion(next) {
    clearTimeout(copyTimer.current);
    setVersion(next);
    setCopyStatus('idle');
  }

  return (
    <section id="source-review" className="page-section" aria-labelledby="source-heading" tabIndex={-1}>
      <div className="section-heading">
        <div><p className="eyebrow">02 / SOURCE REVIEW</p><h2 id="source-heading">Understand every change.</h2><p>Your source on the left. A proposed improvement on the right.</p></div>
        <span className="subtle-label"><Icon name="lock" size={14} />You approve what gets applied</span>
      </div>
      <div className="comparison-grid">
        <div className="panel code-panel">
          <div className="panel-heading">
            <div className="heading-label"><Icon name="code" /><h3>Component source</h3></div>
            <span className="badge badge-neutral">Read only</span>
          </div>
          <div className="source-toolbar">
            <div className="source-switch" role="group" aria-label="Choose component source">
              <button type="button" aria-pressed={version === 'original'} onClick={() => selectVersion('original')}>Original</button>
              <button type="button" aria-pressed={version === 'active'} onClick={() => selectVersion('active')}>Active</button>
            </div>
            <button type="button" className="text-button" onClick={copySource} aria-label={`Copy ${fileName} source`}>
              <Icon name={copyStatus === 'copied' ? 'check' : 'copy'} size={14} />{copyStatus === 'copied' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="code-file"><Icon name="file" size={13} /><span>{fileName}</span><span>JSX</span></div>
          <pre className="source-code" tabIndex={0} role="region" aria-label={`${fileName} source code`}><code>{lines.map((line, index) => (
            <span className="code-line" key={index}><span className="line-number" aria-hidden="true">{index + 1}</span><span><SourceLine line={line} />{'\n'}</span></span>
          ))}</code></pre>
          <div className="code-status"><span>{lines.length} lines · JavaScript JSX</span><span role="status" aria-live="polite">{copyStatus === 'error' ? 'Clipboard unavailable. Select and copy the code.' : copyStatus === 'copied' ? 'Source copied to clipboard.' : 'Loaded from the actual source file'}</span></div>
        </div>
        <div className="panel suggestion-panel">
          <div className="panel-heading">
            <div className="heading-label"><Icon name="sparkles" /><h3>AI suggested code</h3></div>
            <span className="badge badge-purple">Phase 3</span>
          </div>
          <div className="suggestion-empty">
            <div className="suggestion-symbol"><Icon name="sparkles" size={30} /></div>
            <p className="eyebrow">THOUGHTFUL CHANGES. YOUR CALL.</p>
            <h3>A suggestion starts<br />with a scan.</h3>
            <p>A local coding model will propose improved JSX here. Review the complete component before approving any change.</p>
            <button type="button" className="button button-ai" disabled aria-describedby="generate-help"><Icon name="sparkles" size={17} />Generate AI Fix</button>
            <p id="generate-help" className="feature-help">Not connected · Local AI arrives in Phase 3</p>
          </div>
          <div className="suggestion-note"><Icon name="code" size={15} /><span>No generated code yet. Your component is unchanged.</span></div>
        </div>
      </div>
      <div className="review-footer">
        <p><Icon name="shield" size={17} />Every proposed change will require your explicit approval.</p>
        <div className="apply-control">
          <span id="apply-help">Apply and verification are not connected · Phase 4</span>
          <button type="button" className="button button-secondary" disabled aria-describedby="apply-help"><Icon name="check" size={17} />Apply &amp; Verify</button>
        </div>
      </div>
    </section>
  );
}
