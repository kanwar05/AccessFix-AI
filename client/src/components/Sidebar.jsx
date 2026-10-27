import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';

const navigation = [
  { href: '#workspace', label: 'Workspace', icon: 'grid' },
  { href: '#source-review', label: 'Source review', icon: 'code' },
  { href: '#verification', label: 'Verification', icon: 'shield' },
  { href: '#workflow', label: 'Workflow', icon: 'layers' },
];

export default function Sidebar() {
  const [current, setCurrent] = useState(window.location.hash || '#workspace');

  useEffect(() => {
    const update = () => setCurrent(window.location.hash || '#workspace');
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

  return (
    <aside className="sidebar" aria-label="Workspace sidebar">
      <a className="brand" href="#workspace" aria-label="AccessFix AI workspace">
        <span className="brand-mark"><Icon name="access" size={22} /></span>
        <span>AccessFix <span className="brand-ai">AI</span></span>
      </a>
      <div className="workspace-label">
        <span className="workspace-symbol"><Icon name="terminal" size={17} /></span>
        <div><strong>Local workspace</strong><span>React component sandbox</span></div>
      </div>
      <p className="nav-label">WORKSPACE</p>
      <nav aria-label="Main navigation" className="main-nav">
        {navigation.map(({ href, label, icon }) => (
          <a key={href} href={href} aria-current={current === href ? 'location' : undefined}>
            <Icon name={icon} /><span>{label}</span>
            {current === href && <span className="nav-indicator" />}
          </a>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="local-note">
          <span className="local-note-icon"><Icon name="lock" size={17} /></span>
          <strong>Local by design</strong>
          <p>One component.<br />Your machine. Your control.</p>
        </div>
        <p className="sidebar-tagline">Detect <span>→</span> Fix <span>→</span> Verify</p>
      </div>
    </aside>
  );
}
