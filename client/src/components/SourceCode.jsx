import { useEffect, useRef, useState } from 'react';
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

export default function SourceCode({ source, fileName, copyLabel, statusLabel, toolbar }) {
  const [copyStatus, setCopyStatus] = useState('idle');
  const copyTimer = useRef(null);
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

  return (
    <>
      <div className="source-toolbar">
        {toolbar}
        <button type="button" className="text-button" onClick={copySource} aria-label={copyLabel || `Copy ${fileName} source`}>
          <Icon name={copyStatus === 'copied' ? 'check' : 'copy'} size={14} />
          {copyStatus === 'copied' ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="code-file"><Icon name="file" size={13} /><span>{fileName}</span><span>JSX</span></div>
      <pre className="source-code" tabIndex={0} role="region" aria-label={`${fileName} source code`}><code>{lines.map((line, index) => (
        <span className="code-line" key={index}><span className="line-number" aria-hidden="true">{index + 1}</span><span><SourceLine line={line} />{'\n'}</span></span>
      ))}</code></pre>
      <div className="code-status">
        <span>{lines.length} lines · JavaScript JSX</span>
        <span role="status" aria-live="polite">
          {copyStatus === 'error' ? 'Clipboard unavailable. Select and copy the code.'
            : copyStatus === 'copied' ? 'Source copied to clipboard.' : statusLabel}
        </span>
      </div>
    </>
  );
}
