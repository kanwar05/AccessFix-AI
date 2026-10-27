import { useEffect } from 'react';
import ActiveDemo from '../demo/ActiveDemo.jsx';
import './preview.css';

export default function Preview() {
  useEffect(() => {
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'accessfix:preview-ready' }, window.location.origin);
    }
  }, []);

  return <ActiveDemo />;
}
