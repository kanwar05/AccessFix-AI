import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { createApp } from '../server/src/app.js';
import { createConfig, demoPaths } from '../server/src/config.js';
import { createFixGenerator } from '../server/src/services/fixGenerator.js';
import { createOllamaClient } from '../server/src/services/ollamaClient.js';
import { assertSafeProposal, compareVerification, hashSource } from '../server/src/services/applyProposal.js';
import { SCAN_POLICY } from '../server/src/services/accessibilityScanner.js';
import { normalizeScan } from '../server/src/services/normalizeScan.js';
import { validateProposal } from '../server/src/services/validateProposal.js';

// This is an opt-in, real integration proof. It starts its own local services,
// calls the configured Ollama model and pauses for review before any application.
// It deliberately has no mock, prepared patch, or automatic approval option.
const root = fileURLToPath(new URL('..', import.meta.url));
dotenv.config({ path: path.join(root, 'server/.env'), quiet: true });
const config = createConfig();
const apiOrigin = `http://${config.host}:${config.port}`;
const evidencePath = path.join(root, 'docs/evidence/phase6-proof.json');
const screenshotDirectory = path.join(root, 'docs/screenshots');
const started = Date.now();
const originalBytes = await readFile(demoPaths.original);
const initialActiveBytes = await readFile(demoPaths.active);
const proof = {
  schemaVersion: 1,
  status: 'running',
  startedAt: new Date().toISOString(),
  environment: {
    node: process.version, platform: process.platform,
    configuredModel: config.ollamaModel, ollamaBaseUrl: config.ollamaBaseUrl,
    apiOrigin, clientOrigin: config.clientOrigin, previewUrl: config.previewUrl,
    scanPolicy: SCAN_POLICY,
  },
  rawModelResponses: [],
  sourceIntegrity: {
    originalInitialHash: hashSource(originalBytes),
    activeInitialHash: hashSource(initialActiveBytes),
  },
};
let api;
let vite;
let browser;
let terminal;
let servicesReady = false;

async function saveProof() {
  await mkdir(path.dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
}

async function post(pathname, body = {}) {
  const response = await fetch(`${apiOrigin}${pathname}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(config.scanTimeoutMs + 15000),
  });
  const payload = await response.json();
  assert.ok(response.ok, `${pathname} failed (HTTP ${response.status}): ${JSON.stringify(payload)}`);
  return payload;
}

function changedLines(before, after) {
  const original = before.split(/\r?\n/);
  const proposed = after.split(/\r?\n/);
  const changes = [];
  for (let index = 0; index < Math.max(original.length, proposed.length); index++) {
    if (original[index] !== proposed[index]) {
      changes.push({ line: index + 1, before: original[index] ?? null, after: proposed[index] ?? null });
    }
  }
  return changes;
}

async function assertOriginalUnchanged() {
  assert.deepEqual(await readFile(demoPaths.original), originalBytes, 'OriginalDemo.jsx changed');
}

async function expandFindings(page) {
  await page.locator('.issue-card').evaluateAll((cards) => {
    for (const card of cards) card.open = true;
  });
}

try {
  await mkdir(screenshotDirectory, { recursive: true });
  const realChat = createOllamaClient(config);
  const recordedChat = async (messages, options) => {
    const record = {
      attempt: proof.rawModelResponses.length + 1,
      requestedAt: new Date().toISOString(),
      messages: structuredClone(messages),
    };
    proof.rawModelResponses.push(record);
    try {
      // Pass through the genuine model response without replacing any content.
      const response = await realChat(messages, options);
      record.completedAt = new Date().toISOString();
      record.model = response.model;
      record.content = response.content;
      await saveProof();
      return response;
    } catch (error) {
      record.completedAt = new Date().toISOString();
      record.error = { code: error.code ?? null, message: error.message };
      throw error;
    }
  };
  const app = createApp({ config, generateFix: createFixGenerator(config, { chat: recordedChat }) });
  api = app.listen(config.port, config.host);
  await once(api, 'listening');
  vite = await createViteServer({
    configFile: path.join(root, 'client/vite.config.js'),
    root: path.join(root, 'client'),
    server: {
      host: new URL(config.clientOrigin).hostname,
      port: Number(new URL(config.clientOrigin).port || 80), strictPort: true,
      proxy: { '/api': { target: apiOrigin } },
    },
  });
  await vite.listen();
  servicesReady = true;
  console.log(`Real E2E proof: ${config.ollamaModel} at ${config.ollamaBaseUrl}`);

  proof.initialReset = await post('/api/reset');
  assert.equal(proof.initialReset.status, 'reset');
  const baselineBytes = await readFile(demoPaths.active);
  assert.deepEqual(baselineBytes, originalBytes, 'Reset did not restore the trusted source');
  proof.sourceIntegrity.baselineHash = hashSource(baselineBytes);

  browser = await chromium.launch({ headless: true });
  proof.environment.browserVersion = browser.version();
  const dashboardContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 }, colorScheme: 'light', reducedMotion: 'reduce',
  });
  const page = await dashboardContext.newPage();
  const runtimeErrors = [];
  let applyRequestCount = 0;
  page.on('pageerror', (error) => { runtimeErrors.push(error.message); });
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/apply-and-verify') applyRequestCount++;
  });
  const waitForPost = (pathname, timeout = config.scanTimeoutMs + 15000) => page.waitForResponse(
    (response) => response.request().method() === 'POST' && new URL(response.url()).pathname === pathname,
    { timeout },
  );
  await page.goto(config.clientOrigin, { waitUntil: 'networkidle' });
  await page.getByRole('checkbox', { name: 'Ghost Mode' }).check();
  const baselineResponsePromise = waitForPost('/api/scan');
  await page.getByRole('button', { name: 'Scan Accessibility', exact: true }).click();
  const baselineResponse = await baselineResponsePromise;
  proof.beforeScan = await baselineResponse.json();
  assert.ok(baselineResponse.ok(), JSON.stringify(proof.beforeScan));
  assert.equal(proof.beforeScan.sourceHash, hashSource(baselineBytes));
  assert.deepEqual(proof.beforeScan.violations.map((finding) => finding.id).sort(), ['button-name', 'color-contrast', 'label']);
  assert.equal(proof.beforeScan.violatedRuleCount, 3);
  assert.equal(proof.beforeScan.affectedElementCount, 4);
  await page.locator('.issue-card').first().waitFor();
  await expandFindings(page);
  assert.equal(await page.locator('.ghost-status-detected').count(), proof.beforeScan.violatedRuleCount);
  await page.screenshot({ path: path.join(screenshotDirectory, 'phase6-baseline.png'), fullPage: true });
  proof.screenshots = { baseline: 'docs/screenshots/phase6-baseline.png' };
  await saveProof();

  const generationResponsePromise = waitForPost('/api/generate-fix', config.ollamaTimeoutMs + 15000);
  await page.getByRole('button', { name: 'Generate AI Fix', exact: true }).click();
  const generationResponse = await generationResponsePromise;
  const proposal = await generationResponse.json();
  proof.generationHttpStatus = generationResponse.status();
  proof.proposal = proposal;
  assert.ok(generationResponse.ok(), `Real model generation rejected: ${JSON.stringify(proposal)}`);
  assert.equal(proposal.status, 'proposed');
  assert.equal(proposal.applied, false);
  assert.equal(proposal.verified, false);
  assert.equal(proposal.scanId, proof.beforeScan.scanId);
  assert.ok(proof.rawModelResponses.length >= 1 && proof.rawModelResponses.length <= 2);
  assert.equal(proposal.model, proof.rawModelResponses.at(-1).model);
  assert.equal(validateProposal(proposal.proposedCode), proposal.proposedCode);
  assertSafeProposal(proposal.originalCode, proposal.proposedCode);
  assert.equal(proposal.originalCode, baselineBytes.toString('utf8'));
  assert.deepEqual(await readFile(demoPaths.active), baselineBytes, 'Generation modified source before approval');
  await assertOriginalUnchanged();
  proof.validation = { completeJsxValidated: true, existingAstGateAccepted: true, generationLeftSourceUnchanged: true };
  proof.sourceDiff = changedLines(proposal.originalCode, proposal.proposedCode);

  const approveButton = page.getByRole('button', { name: 'Approve & Apply', exact: true });
  await approveButton.waitFor();
  const cancelledDialogPromise = page.waitForEvent('dialog');
  const cancelledClick = approveButton.click();
  const cancelledDialog = await cancelledDialogPromise;
  assert.equal(cancelledDialog.type(), 'confirm');
  await cancelledDialog.dismiss();
  await cancelledClick;
  assert.equal(applyRequestCount, 0, 'Cancelling approval sent an apply request');
  assert.deepEqual(await readFile(demoPaths.active), baselineBytes, 'Cancelling approval changed the source');
  proof.approval = {
    cancelledBrowserConfirmation: true,
    applyRequestsAfterCancellation: applyRequestCount,
    sourceUnchangedAfterCancellation: true,
  };
  proof.status = 'awaiting-explicit-review';
  await saveProof();
  console.log(`\nProposal ${proposal.proposalId} from ${proposal.model}`);
  console.log(`Baseline: ${proof.beforeScan.violatedRuleCount} rules; ${proof.beforeScan.affectedElementCount} affected elements.`);
  console.log('Actual model response:');
  console.log(proof.rawModelResponses.at(-1).content);
  console.log('Validated source changes:');
  for (const change of proof.sourceDiff) {
    console.log(`@@ line ${change.line} @@\n- ${change.before ?? '[absent]'}\n+ ${change.after ?? '[absent]'}`);
  }
  console.log(`Full proposal and raw model output: ${evidencePath}`);
  terminal = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await terminal.question(`Review the proposal. To apply it, type: approve ${proposal.proposalId}\n> `);
  terminal.close();
  terminal = null;
  assert.equal(answer.trim(), `approve ${proposal.proposalId}`, 'The proposal was not explicitly approved');
  proof.approval.terminalReview = { proposalId: proposal.proposalId, approved: true, approvedAt: new Date().toISOString() };

  const applyResponsePromise = waitForPost('/api/apply-and-verify');
  const approvedDialogPromise = page.waitForEvent('dialog');
  const approvedClick = approveButton.click();
  const approvedDialog = await approvedDialogPromise;
  assert.equal(approvedDialog.type(), 'confirm');
  await approvedDialog.accept();
  await approvedClick;
  proof.approval.acceptedBrowserConfirmation = true;
  const applyResponse = await applyResponsePromise;
  proof.applyHttpStatus = applyResponse.status();
  proof.applyResult = await applyResponse.json();
  assert.ok(applyResponse.ok(), JSON.stringify(proof.applyResult));
  assert.equal(proof.applyResult.verified, true);
  assert.equal(proof.applyResult.status, 'verified-improvement');
  assert.ok(proof.applyResult.verification.resolvedRuleIds.length >= 1);
  assert.deepEqual(proof.applyResult.verification.introducedRuleIds, []);
  assert.equal(applyRequestCount, 1);
  proof.approval.totalApplyRequests = applyRequestCount;
  assert.equal(hashSource(await readFile(demoPaths.active)), hashSource(proposal.proposedCode));
  await assertOriginalUnchanged();

  // Fresh context and a direct AxeBuilder invocation, independent of the API's
  // scanner and report. Match its published browser policy exactly.
  const independentContext = await browser.newContext({
    viewport: { ...SCAN_POLICY.viewport }, colorScheme: SCAN_POLICY.colorScheme,
    reducedMotion: SCAN_POLICY.reducedMotion, serviceWorkers: 'block',
  });
  try {
    const independentPage = await independentContext.newPage();
    const independentErrors = [];
    independentPage.on('pageerror', (error) => { independentErrors.push(error.message); });
    const response = await independentPage.goto(config.previewUrl, { waitUntil: 'networkidle' });
    assert.ok(response?.ok());
    await independentPage.locator('[data-testid="active-demo"][data-demo-ready="true"]').waitFor();
    await independentPage.evaluate(() => globalThis.document.fonts.ready);
    const results = await new AxeBuilder({ page: independentPage }).analyze();
    assert.deepEqual(independentErrors, []);
    proof.independentAfterScan = {
      scanId: 'independent-playwright-after', scannedAt: new Date().toISOString(),
      sourceHash: hashSource(await readFile(demoPaths.active)),
      configuration: { ...SCAN_POLICY, engine: results.testEngine.name, engineVersion: results.testEngine.version },
      ...normalizeScan(results),
    };
    proof.independentComparison = compareVerification(proof.beforeScan, proof.independentAfterScan);
    assert.equal(proof.independentComparison.status, 'verified-improvement');
    assert.deepEqual(proof.independentComparison.introducedRuleIds, []);
    assert.deepEqual(
      proof.independentAfterScan.violations.map((finding) => finding.id).sort(),
      proof.applyResult.afterScan.violations.map((finding) => finding.id).sort(),
    );
    assert.equal(proof.independentAfterScan.affectedElementCount, proof.applyResult.afterScan.affectedElementCount);
  } finally {
    await independentContext.close();
  }

  await page.locator('#verification').getByText('Verified improvement', { exact: true }).waitFor();
  await expandFindings(page);
  const ghostFindings = await page.locator('.issue-card').evaluateAll((cards) => cards.map((card) => ({
    ruleId: card.querySelector('.issue-rule-id')?.textContent?.split(' · ')[0],
    status: card.querySelector('.ghost-finding-status strong')?.textContent,
  })));
  for (const ruleId of proof.applyResult.verification.resolvedRuleIds) {
    assert.ok(!ghostFindings.some((finding) => finding.ruleId === ruleId), `Resolved ${ruleId} remains a detected Ghost`);
  }
  for (const ruleId of proof.applyResult.verification.remainingRuleIds) {
    assert.ok(ghostFindings.some((finding) => finding.ruleId === ruleId && finding.status === 'Still Haunting'));
  }
  proof.ghostMode = { enabled: true, findingsAfterVerification: ghostFindings, resolvedRulesAbsentFromCurrentFindings: true };
  await page.screenshot({ path: path.join(screenshotDirectory, 'phase6-verified.png'), fullPage: true });
  proof.screenshots.verified = 'docs/screenshots/phase6-verified.png';
  await saveProof();

  const resetResponsePromise = waitForPost('/api/reset');
  await page.locator('#verification').getByRole('button', { name: 'Reset Demo', exact: true }).click();
  const resetResponse = await resetResponsePromise;
  proof.finalReset = await resetResponse.json();
  assert.ok(resetResponse.ok(), JSON.stringify(proof.finalReset));
  assert.equal(proof.finalReset.status, 'reset');
  await page.locator('.issues-empty').waitFor();
  await page.getByRole('button', { name: 'Scan Accessibility', exact: true }).waitFor();
  const restorationResponsePromise = waitForPost('/api/scan');
  await page.getByRole('button', { name: 'Scan Accessibility', exact: true }).click();
  const restorationResponse = await restorationResponsePromise;
  proof.restorationScan = await restorationResponse.json();
  assert.ok(restorationResponse.ok());
  assert.deepEqual(
    proof.restorationScan.violations.map((finding) => finding.id).sort(),
    proof.beforeScan.violations.map((finding) => finding.id).sort(),
  );
  assert.equal(proof.restorationScan.violatedRuleCount, proof.beforeScan.violatedRuleCount);
  assert.equal(proof.restorationScan.affectedElementCount, proof.beforeScan.affectedElementCount);
  assert.equal(proof.restorationScan.sourceHash, proof.beforeScan.sourceHash);
  assert.deepEqual(await readFile(demoPaths.active), originalBytes);
  await assertOriginalUnchanged();
  assert.deepEqual(runtimeErrors, [], 'Dashboard had a browser runtime error');
  proof.sourceIntegrity.originalFinalHash = hashSource(await readFile(demoPaths.original));
  proof.sourceIntegrity.activeFinalHash = hashSource(await readFile(demoPaths.active));
  proof.sourceIntegrity.originalBytesUnchanged = true;
  proof.sourceIntegrity.resetRestoredOriginalBytes = true;
  proof.status = 'passed';
  console.log(`\nReal AI improvement verified: ${proof.beforeScan.violatedRuleCount} → ${proof.applyResult.afterScan.violatedRuleCount} rules.`);
  console.log(`Resolved: ${proof.applyResult.verification.resolvedRuleIds.join(', ')}`);
  console.log(`Remaining: ${proof.applyResult.verification.remainingRuleIds.join(', ') || 'none'}`);
  console.log(`Introduced: ${proof.applyResult.verification.introducedRuleIds.join(', ') || 'none'}`);
  console.log('Independent axe verification passed; reset and restoration rescan passed.');
} catch (error) {
  proof.status = 'failed';
  proof.failure = { code: error.code ?? null, message: error.message };
  console.error(`Real E2E proof failed: ${error.message}`);
  if (servicesReady) {
    try { proof.failureCleanupReset = await post('/api/reset'); }
    catch (resetError) { proof.failureCleanupReset = { error: resetError.message }; }
  }
  proof.sourceIntegrity.originalFinalHash = hashSource(await readFile(demoPaths.original));
  proof.sourceIntegrity.activeFinalHash = hashSource(await readFile(demoPaths.active));
  proof.sourceIntegrity.originalBytesUnchanged = (await readFile(demoPaths.original)).equals(originalBytes);
  proof.sourceIntegrity.resetRestoredOriginalBytes = (await readFile(demoPaths.active)).equals(originalBytes);
  process.exitCode = 1;
} finally {
  terminal?.close();
  proof.completedAt = new Date().toISOString();
  proof.elapsedMs = Date.now() - started;
  await saveProof();
  await browser?.close();
  await vite?.close();
  if (api?.listening) {
    api.closeIdleConnections();
    await new Promise((resolve, reject) => api.close((error) => error ? reject(error) : resolve()));
  }
  console.log(`Evidence saved: ${evidencePath} (${proof.status})`);
}
