import { useCallback, useEffect, useRef, useState } from 'react';

const emptyState = { context: null, proposal: null, isGenerating: false, isApplying: false, error: null, verification: null };
const rescanErrors = new Set(['SCAN_REQUIRED', 'SCAN_NOT_FOUND', 'STALE_SCAN', 'SOURCE_CHANGED']);

function validateProposal(result, scan) {
  if (
    !result || result.status !== 'proposed' || result.applied !== false || result.verified !== false ||
    typeof result.proposalId !== 'string' || !result.proposalId || result.scanId !== scan.scanId ||
    result.sourceHash !== scan.sourceHash || typeof result.model !== 'string' || !result.model ||
    typeof result.generatedAt !== 'string' || !Number.isFinite(Date.parse(result.generatedAt)) ||
    typeof result.originalCode !== 'string' || !result.originalCode.trim() ||
    typeof result.proposedCode !== 'string' || !result.proposedCode.trim()
  ) {
    throw new Error('The AI API returned an invalid proposal. Check the backend terminal and try again.');
  }
  return result;
}

export default function useAIFix({ scan, baseline, isScanning, scanError, replaceScan, clearResults }) {
  const [state, setState] = useState(emptyState);
  const activeRequest = useRef(null);
  const mounted = useRef(false);
  const context = `${scan?.scanId ?? ''}:${baseline?.scanId ?? ''}`;
  const eligibleScan = Boolean(scan?.status === 'completed' && scan.violatedRuleCount > 0 && !isScanning && !scanError);
  const isCurrent = state.context === context && !isScanning && !scanError;
  const proposal = isCurrent ? state.proposal : null;
  const error = isCurrent ? state.error : null;
  const isGenerating = isCurrent && state.isGenerating;
  const isApplying = isCurrent && state.isApplying;
  const canGenerate = eligibleScan && !isGenerating && !rescanErrors.has(error?.code);
  const canApply = isCurrent && Boolean(proposal) && !isApplying && !proposal.applied;

  const cancelRequest = useCallback(() => {
    const request = activeRequest.current;
    activeRequest.current = null;
    request?.controller.abort();
  }, []);

  const invalidateProposal = useCallback(() => {
    cancelRequest();
    setState(emptyState);
  }, [cancelRequest]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelRequest();
    };
  }, [cancelRequest]);

  // A response from an older scan must never become the current proposal.
  useEffect(() => () => cancelRequest(), [context, isScanning, scanError, cancelRequest]);

  const generateFix = useCallback(async () => {
    if (!eligibleScan || activeRequest.current) return;
    const request = { controller: new AbortController(), context };
    activeRequest.current = request;
    setState({ context, proposal: null, isGenerating: true, isApplying: false, error: null, verification: null });
    let timedOut = false;
    // The server permits up to ten minutes; leave time for its error response.
    const timeout = setTimeout(() => {
      timedOut = true;
      request.controller.abort();
    }, 610000);

    try {
      const response = await fetch('/api/generate-fix', {
        method: 'POST', signal: request.controller.signal,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanId: scan.scanId }),
      });
      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new Error('The AI API did not return JSON. Check the backend terminal and try again.');
      }
      if (!response.ok) {
        const failure = new Error(typeof payload?.error?.message === 'string'
          ? payload.error.message
          : `The AI request could not complete (HTTP ${response.status}). Check Ollama and retry.`);
        failure.code = typeof payload?.error?.code === 'string' ? payload.error.code : 'AI_REQUEST_FAILED';
        throw failure;
      }
      const result = validateProposal(payload, scan);
      if (mounted.current && activeRequest.current === request) {
        setState({ context, proposal: result, isGenerating: false, error: null });
      }
    } catch (failure) {
      if (!mounted.current || activeRequest.current !== request) return;
      setState({
        context, proposal: null, isGenerating: false,
        error: {
          code: timedOut ? 'AI_REQUEST_TIMEOUT' : failure.code || 'AI_REQUEST_FAILED',
          message: timedOut
            ? 'The AI request timed out. Check the backend and Ollama terminals, then retry.'
            : failure instanceof TypeError
              ? 'Could not reach the local AI API. Check that Express is running, then retry.'
              : failure.message || 'The AI request could not complete. Check Ollama and retry.',
        },
      });
    } finally {
      clearTimeout(timeout);
      if (activeRequest.current === request) activeRequest.current = null;
    }
  }, [context, eligibleScan, scan]);

  const applyFix = useCallback(async () => {
    if (!canApply || activeRequest.current) return;
    const request = { controller: new AbortController(), context };
    activeRequest.current = request;
    setState((current) => ({ ...current, isApplying: true, error: null }));
    try {
      const response = await fetch('/api/apply-and-verify', {
        method: 'POST', signal: request.controller.signal,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId: proposal.proposalId, scanId: scan.scanId, approved: true }),
      });
      const payload = await response.json();
      if (!response.ok) {
        const failure = new Error(payload?.error?.message || `Apply failed (HTTP ${response.status}).`);
        failure.code = payload?.error?.code || 'APPLY_FAILED';
        throw failure;
      }
      replaceScan(payload.afterScan);
      const appliedContext = `${payload.afterScan.scanId}:${baseline?.scanId ?? ''}`;
      setState((current) => ({
        ...current, context: appliedContext, isApplying: false,
        proposal: { ...current.proposal, applied: true, verified: true },
        verification: payload.verification, error: null,
      }));
    } catch (failure) {
      if (mounted.current && activeRequest.current === request) {
        setState((current) => ({
          ...current, isApplying: false,
          error: { code: failure.code || 'APPLY_FAILED', message: failure.message || 'The approved proposal could not be applied.' },
        }));
      }
    } finally {
      if (activeRequest.current === request) activeRequest.current = null;
    }
  }, [baseline, canApply, context, proposal, scan, replaceScan]);

  const resetDemo = useCallback(async () => {
    if (activeRequest.current) return;
    const request = { controller: new AbortController(), context };
    activeRequest.current = request;
    setState(emptyState);
    try {
      const response = await fetch('/api/reset', {
        method: 'POST', signal: request.controller.signal,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: '{}',
      });
      const payload = await response.json();
      if (!response.ok) {
        const failure = new Error(payload?.error?.message || `Reset failed (HTTP ${response.status}).`);
        failure.code = payload?.error?.code || 'RESET_FAILED';
        throw failure;
      }
      clearResults();
    } catch (failure) {
      if (mounted.current && activeRequest.current === request) {
        setState({ ...emptyState, context, error: { code: failure.code || 'RESET_FAILED', message: failure.message || 'The demo could not be reset.' } });
      }
    } finally {
      if (activeRequest.current === request) activeRequest.current = null;
    }
  }, [clearResults, context]);

  return { proposal, isGenerating, isApplying, error, verification: isCurrent ? state.verification : null, canGenerate, canApply, generateFix, applyFix, resetDemo, invalidateProposal };
}
