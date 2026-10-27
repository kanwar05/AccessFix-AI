export default function App() {
  return (
    <main id="main-content" className="mx-auto flex min-h-svh max-w-3xl items-center px-6 py-16">
      <div className="w-full rounded-2xl border border-white/15 bg-white/[0.025] p-8 sm:p-12">
        <p className="mb-6 text-sm font-semibold tracking-wide text-cyan-300">
          LOCAL DEVELOPMENT · PHASE 0
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          AccessFix <span className="text-violet-300">AI</span>
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-slate-200">
          Detect. Review. Fix. Verify.
        </p>
        <p className="mt-4 max-w-prose leading-relaxed text-slate-300">
          The React and Express foundation is ready. The dashboard and controlled login
          demo arrive in Phase 1; scanning, AI proposals, and verification follow in later phases.
        </p>
        <a
          href="/api/health"
          className="mt-6 inline-flex min-h-11 items-center rounded-lg border border-cyan-300/40 px-4 py-2 font-medium text-cyan-200 underline-offset-4 hover:underline"
        >
          Check local API health
        </a>
        <p className="mt-8 border-t border-white/15 pt-6 text-sm leading-relaxed text-slate-300">
          Automated accessibility checks find some problems. Manual testing is still needed.
        </p>
      </div>
    </main>
  );
}
