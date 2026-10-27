import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';

export default function ApiStatus() {
  const [status, setStatus] = useState('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    const timeout = setTimeout(() => controller.abort(), 5000);

    async function checkHealth() {
      try {
        const response = await fetch('/api/health', {
          signal: controller.signal, headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error('API unavailable');
        const health = await response.json();
        if (health.status !== 'ok' || health.service !== 'AccessFix AI API') {
          throw new Error('Unexpected health response');
        }
        if (mounted) setStatus('connected');
      } catch {
        if (mounted) setStatus('unavailable');
      } finally {
        clearTimeout(timeout);
      }
    }

    checkHealth();
    return () => {
      mounted = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);

  const labels = { loading: 'Checking API…', connected: 'API connected', unavailable: 'API unavailable' };

  return (
    <div className="api-status" data-state={status}>
      <span role="status" aria-live="polite" aria-atomic="true" className="api-status-text">
        <span className={`status-dot ${status}`} />{labels[status]}
      </span>
      <button
        type="button" className="icon-button" disabled={status === 'loading'}
        aria-label="Recheck API connection" aria-describedby="api-status-help"
        onClick={() => { setStatus('loading'); setAttempt((value) => value + 1); }}
      >
        <Icon name="reset" size={14} className={status === 'loading' ? 'spin' : ''} />
      </button>
      <span id="api-status-help" className="sr-only">
        Checks Express connectivity only. Use Scan Accessibility to test the browser and preview. Ollama availability is checked when you generate a proposal.
      </span>
    </div>
  );
}
