import Sidebar from './components/Sidebar.jsx';
import ApiStatus from './components/ApiStatus.jsx';
import PreviewPanel from './components/PreviewPanel.jsx';
import IssuesPanel from './components/IssuesPanel.jsx';
import CodeComparison from './components/CodeComparison.jsx';
import VerificationPanel from './components/VerificationPanel.jsx';
import Icon from './components/Icon.jsx';
import useAccessibilityScan from './hooks/useAccessibilityScan.js';
import './styles.css';

const workflow = [
  { number: '01', icon: 'scan', title: 'Detect', phase: 'Connected', description: 'Scan the rendered component with Playwright and axe-core.' },
  { number: '02', icon: 'sparkles', title: 'Fix', phase: 'Phase 3', description: 'Review a JSX proposal from a real local coding model.' },
  { number: '03', icon: 'shield', title: 'Verify', phase: 'Phase 4', description: 'Approve the change and rerun the same automated checks.' },
];

export default function App() {
  const { scan, baseline, isScanning, error, runScan } = useAccessibilityScan();
  const detectionStatus = isScanning ? 'Scanning…' : error ? 'Scan failed' : scan
    ? `${scan.violatedRuleCount} violated ${scan.violatedRuleCount === 1 ? 'rule' : 'rules'}`
    : 'Not scanned';
  const detectionDetail = error && scan ? 'Previous report retained' : scan
    ? `${scan.affectedElementCount} affected ${scan.affectedElementCount === 1 ? 'element' : 'elements'}`
    : 'Ready for a real scan';

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Sidebar />
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <span aria-hidden="true">/</span>
            <span>
              <Icon name="file" size={14} />Login form
            </span>
          </div>
          <div className="topbar-status">
            <span className="local-badge">
              <span className="status-dot" />Local environment
            </span>
            <ApiStatus />
          </div>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>
          <section
            id="workspace"
            className="workspace-section"
            aria-labelledby="workspace-heading"
            tabIndex={-1}
          >
            <div className="page-title-row">
              <div>
                <p className="eyebrow">BETTER CODE. FEWER BARRIERS.</p>
                <h1 id="workspace-heading">
                  Accessibility workspace<span className="title-dot">.</span>
                </h1>
                <p className="page-description">
                  Detect <span>→</span> Fix <span>→</span> Verify <span className="description-divider">/</span> A little more access, one component at a time.
                </p>
              </div>
              <span className="phase-badge">
                <span className="phase-indicator" />Phase 2<span>Real detection</span>
              </span>
            </div>
            <div className="milestone-notice">
              <span className="notice-icon">
                <Icon name="info" size={17} />
              </span>
              <p>
                <strong>Real detection is connected.</strong> Scan the local component to collect results. AI fixes and verification arrive in later phases.
              </p>
              <a href="#workflow">
                See what’s next <Icon name="arrow" size={14} />
              </a>
            </div>
            <div className="workspace-summary" aria-label="Current workspace state">
              <div>
                <span className="summary-icon">
                  <Icon name="code" size={20} />
                </span>
                <div>
                  <p>COMPONENT</p>
                  <strong>
                    React login form <span className="jsx-badge">JSX</span>
                  </strong>
                </div>
              </div>
              <div>
                <span className="summary-icon">
                  <Icon name="scan" size={20} />
                </span>
                <div>
                  <p>DETECTION</p>
                  <strong>
                    {detectionStatus}<span className="summary-detail">{detectionDetail}</span>
                  </strong>
                </div>
              </div>
              <div>
                <span className="summary-icon">
                  <Icon name="sparkles" size={20} />
                </span>
                <div>
                  <p>AI ENGINE</p>
                  <strong>
                    Not connected<span className="summary-detail">Local inference planned</span>
                  </strong>
                </div>
              </div>
            </div>
            <div className="preview-section-label">
              <p className="eyebrow">01 / COMPONENT INSPECTION</p>
              <span>
                <span className="status-dot" />One controlled demo
              </span>
            </div>
            <div className="inspection-grid">
              <PreviewPanel />
              <IssuesPanel scan={scan} isScanning={isScanning} error={error} onScan={runScan} />
            </div>
          </section>
          <CodeComparison />
          <VerificationPanel baseline={baseline} />
          <section
            id="workflow"
            className="page-section workflow-section"
            aria-labelledby="workflow-heading"
            tabIndex={-1}
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">THE ROAD AHEAD</p>
                <h2 id="workflow-heading">A clear path from detect to verify.</h2>
              </div>
              <span className="subtle-label">Local repair workflow</span>
            </div>
            <ol className="workflow-grid">
              {workflow.map(({ number, icon, title, phase, description }) => (
                <li key={number}>
                  <div className="workflow-step-top">
                    <span className="workflow-step-icon">
                      <Icon name={icon} size={18} />
                    </span>
                    <span>{phase}</span>
                  </div>
                  <h3>
                    <span>{number}</span>{title}
                  </h3>
                  <p>{description}</p>
                </li>
              ))}
            </ol>
          </section>
          <footer className="page-footer">
            <span>
              <Icon name="access" size={15} />AccessFix AI
            </span>
            <p>Built with care. Reviewed by you.</p>
            <a href="/api/health" target="_blank" rel="noreferrer">
              API health <Icon name="external" size={12} /><span className="sr-only"> (new tab)</span>
            </a>
          </footer>
        </main>
      </div>
    </div>
  );
}
