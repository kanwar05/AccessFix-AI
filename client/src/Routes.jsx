import { lazy, Suspense } from 'react';

const isPreview = window.location.pathname.replace(/\/$/, '') === '/preview';
const Page = lazy(isPreview ? () => import('./preview/Preview.jsx') : () => import('./App.jsx'));
document.title = isPreview ? 'Login component preview · AccessFix AI' : 'AccessFix AI · Accessibility workspace';

export default function Routes() {
  return (
    <Suspense fallback={<p role="status" style={{ padding: 24, fontFamily: 'system-ui' }}>Loading workspace…</p>}>
      <Page />
    </Suspense>
  );
}
