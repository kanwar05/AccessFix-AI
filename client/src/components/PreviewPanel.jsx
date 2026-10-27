import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

export default function PreviewPanel() {
  const frameRef = useRef(null);
  const [state, setState] = useState('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    function receiveReady(event) {
      if (
        event.origin === window.location.origin &&
        event.source === frameRef.current?.contentWindow &&
        event.data?.type === 'accessfix:preview-ready'
      ) {
        setState('ready');
      }
    }
    window.addEventListener('message', receiveReady);
    const timeout = setTimeout(() => {
      setState((current) => current === 'loading' ? 'error' : current);
    }, 15000);
    return () => {
      window.removeEventListener('message', receiveReady);
      clearTimeout(timeout);
    };
  }, [attempt]);

  return (
    <section className="panel preview-panel" aria-labelledby="preview-heading">
      <div className="panel-heading">
        <div className="heading-label"><Icon name="layers" /><h2 id="preview-heading">Component preview</h2></div>
        <a href="/preview" target="_blank" rel="noreferrer" className="text-link">
          Open preview <Icon name="external" size={14} /><span className="sr-only"> (new tab)</span>
        </a>
      </div>
      <div className="browser-bar">
        <span className="browser-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="preview-path"><Icon name="lock" size={12} />localhost / preview</span>
        <span className="jsx-badge">JSX</span>
      </div>
      <div className="preview-window" aria-busy={state === 'loading'}>
        <iframe
          ref={frameRef} key={attempt} src="/preview"
          title="Interactive login demo with intentional accessibility issues"
          className="demo-frame" aria-describedby="demo-warning"
          tabIndex={state === 'ready' ? 0 : -1} aria-hidden={state !== 'ready' ? true : undefined}
          onError={() => setState('error')}
        />
        {state !== 'ready' && (
          <div className="preview-overlay" role="status">
            <Icon name={state === 'loading' ? 'layers' : 'info'} size={28} />
            <strong>{state === 'loading' ? 'Loading component preview…' : 'The preview could not become ready.'}</strong>
            {state === 'error' && <>
              <p>Check the Vite terminal or open the preview directly.</p>
              <button type="button" className="button button-secondary" onClick={() => {
                setState('loading'); setAttempt((value) => value + 1);
              }}>Reload preview</button>
            </>}
          </div>
        )}
      </div>
      <div className="preview-caption">
        <p id="demo-warning"><Icon name="info" size={15} />This demo intentionally contains accessibility barriers.</p>
        <span className="preview-state" role="status">
          <span className={`status-dot ${state === 'ready' ? 'connected' : ''}`} />
          {state === 'ready' ? 'Preview ready' : state === 'error' ? 'Preview unavailable' : 'Loading'}
        </span>
      </div>
      <div className="panel-footer preview-footer">
        <div><strong>ActiveDemo.jsx</strong><span>Controlled local component</span></div>
        <div className="reset-control">
          <button type="button" className="button button-secondary button-small" disabled aria-describedby="reset-help">
            <Icon name="reset" size={14} />Reset Demo
          </button>
          <span id="reset-help">Not connected · Phase 4</span>
        </div>
      </div>
    </section>
  );
}
