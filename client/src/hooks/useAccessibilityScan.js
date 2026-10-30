import { useCallback, useEffect, useRef, useState } from 'react';

const impacts = ['critical', 'serious', 'moderate', 'minor', 'unclassified'];
const isCount = (value) => Number.isSafeInteger(value) && value >= 0;
const isStringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');
const isTarget = (value) => Array.isArray(value) && value.length > 0 && value.every(
  (part) => typeof part === 'string' || isTarget(part),
);

function isDocumentationUrl(value) {
  try {
    return ['https:', 'http:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function validateScan(result) {
  if (
    !result || result.status !== 'completed' ||
    typeof result.scanId !== 'string' || !result.scanId ||
    typeof result.scannedAt !== 'string' || !Number.isFinite(Date.parse(result.scannedAt)) ||
    typeof result.sourceHash !== 'string' || !result.sourceHash ||
    typeof result.configuration?.id !== 'string' ||
    !isCount(result.violatedRuleCount) || !isCount(result.affectedElementCount) ||
    !isCount(result.incompleteRuleCount) ||
    !impacts.every((impact) => isCount(result.severityBreakdown?.[impact])) ||
    !Array.isArray(result.violations) || result.violations.length !== result.violatedRuleCount ||
    impacts.reduce((sum, impact) => sum + result.severityBreakdown[impact], 0) !== result.violatedRuleCount
  ) {
    throw new Error('The scan API returned an invalid report. Check the backend terminal and try again.');
  }

  for (const issue of result.violations) {
    if (
      !issue || typeof issue.id !== 'string' || typeof issue.help !== 'string' ||
      typeof issue.description !== 'string' || typeof issue.recommendedAction !== 'string' ||
      !impacts.includes(issue.impact) || !isStringArray(issue.tags) || !isStringArray(issue.wcagTags) ||
      !isDocumentationUrl(issue.helpUrl) || !isCount(issue.affectedElementCount) ||
      !Array.isArray(issue.nodes) ||
      !issue.nodes.every((node) => node && isTarget(node.target) && typeof node.failureSummary === 'string' &&
        (node.html == null || typeof node.html === 'string')) ||
      new Set(issue.nodes.map((node) => JSON.stringify(node.target))).size !== issue.affectedElementCount
    ) {
      throw new Error('The scan API returned incomplete finding details. Check the backend terminal and try again.');
    }
  }
  return result;
}

export default function useAccessibilityScan() {
  const [scan, setScan] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState(null);
  const activeRequest = useRef(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      activeRequest.current?.abort();
    };
  }, []);

  const runScan = useCallback(async () => {
    if (activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setIsScanning(true);
    setError(null);
    let timedOut = false;
    // The server's maximum scan budget is 120 seconds; allow its error response to arrive first.
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 130000);

    try {
      const response = await fetch('/api/scan', {
        method: 'POST', signal: controller.signal, headers: { Accept: 'application/json' },
      });
      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new Error('The scan API did not return JSON. Check the backend terminal and try again.');
      }
      if (!response.ok) {
        const failure = new Error(typeof payload?.error?.message === 'string'
          ? payload.error.message
          : `The scan could not complete (HTTP ${response.status}). Check the backend and retry.`);
        failure.code = typeof payload?.error?.code === 'string' ? payload.error.code : 'SCAN_REQUEST_FAILED';
        throw failure;
      }
      const completedScan = validateScan(payload);
      if (mounted.current) {
        setScan(completedScan);
        setBaseline((initial) => initial ?? completedScan);
      }
    } catch (failure) {
      if (!mounted.current) return;
      setError({
        code: timedOut ? 'SCAN_REQUEST_TIMEOUT' : failure.code || 'SCAN_REQUEST_FAILED',
        message: timedOut
          ? 'The scan request timed out. Check the backend terminal, wait for browser cleanup, then retry.'
          : failure instanceof TypeError
            ? 'Could not reach the local scan API. Check that Express is running, then retry.'
            : failure.message || 'The scan could not complete. Check the backend terminal and retry.',
      });
    } finally {
      clearTimeout(timeout);
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        if (mounted.current) setIsScanning(false);
      }
    }
  }, []);

  const replaceScan = useCallback((completedScan) => {
    setScan(completedScan);
    setError(null);
  }, []);
  const clearResults = useCallback(() => {
    setScan(null);
    setBaseline(null);
    setError(null);
  }, []);

  return { scan, baseline, isScanning, error, runScan, replaceScan, clearResults };
}
