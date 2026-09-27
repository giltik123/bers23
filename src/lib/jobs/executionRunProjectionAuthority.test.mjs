import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const projectionUrl = new URL('./executionRunProjection.js', import.meta.url);
const controlUrl = new URL('./creativeExecutionControl.js', import.meta.url);
const workflowRetryUrl = new URL('./boundedWorkflowRetryControl.js', import.meta.url);
const clientUrl = new URL('../../api/executionRunRecoveryClient.js', import.meta.url);
const rowUrl = new URL('../../components/editor/jobs/CanonicalExecutionRunRow.jsx', import.meta.url);
const centerUrl = new URL('../../components/editor/jobs/JobCenter.jsx', import.meta.url);
const queuePanelUrl = new URL('../../components/editor/jobs/JobQueuePanel.jsx', import.meta.url);

async function source(url) { return readFile(url, 'utf8'); }

test('canonical projection imports only the narrow recovery client and no browser execution authority', async () => {
  const text = await source(projectionUrl);
  assert.match(text, /executionRunRecoveryClient/);
  assert.match(text, /export function createExecutionRunProjection/);
  assert.doesNotMatch(text, /export const executionRunProjection/);
  assert.doesNotMatch(text, /coreClient|jobManager|jobStorage|subscriptionUsage|subscriptionValidator|jobQueue|jobWorker|Billing|billing|provider|stripe|\.cancel\(|\.retry\(|\.issue\(|\.start\(/);
  assert.match(text, /UNKNOWN/);
  assert.match(text, /WORKFLOW_STEP cannot be an ExecutionRun root/);
  assert.match(text, /generation !== this\.generation/);
  assert.match(text, /terminal time shape is invalid/);
  assert.match(text, /RESULT_PATH/);
  assert.match(text, /status !== 'SUCCEEDED' \|\| capability !== 'CREATIVE_EXECUTION' \|\| authorityKind !== 'CREATIVE_EXECUTION'/);
  assert.match(text, /result\.imageUrl is invalid/);
  assert.match(text, /LOCAL_AUTHORITY_STATE/);
  assert.match(text, /capability !== 'LOCAL_EXECUTION' \|\| authorityKind !== 'LOCAL_EXECUTION_TICKET'/);
  assert.match(text, /value\.cancellation !== 'UNSUPPORTED'/);
  assert.match(text, /localExecutionAuthorityStateLabel/);
});

test('recovery transport is explicitly GET-only and exposes no generic request or mutation API', async () => {
  const text = await source(clientUrl);
  assert.match(text, /method: 'GET'/);
  assert.doesNotMatch(text, /method: 'POST'|method: 'PATCH'|method: 'DELETE'|coreClient|entities|creative|localExecution|Billing|billing|provider/);
  assert.match(text, /return Object\.freeze\(\{\s*listRoots[\s\S]*get\(runId, projectId\)[\s\S]*listChildren/);
});

test('owning Creative control is separate from recovery and fail-closed on exact capability, authority and live lifecycle', async () => {
  const text = await source(controlUrl);
  assert.match(text, /CreativeExecutionControlPolicy/);
  assert.match(text, /run\.capability !== CREATIVE_CAPABILITY \|\| run\.authorityKind !== CREATIVE_AUTHORITY/);
  assert.match(text, /run\.status !== ACTIVE_RUN_STATUS/);
  assert.match(text, /this\.client\.status\(run\.authorityRef\)/);
  assert.match(text, /lifecycle\.status !== CANCELLABLE_LIFECYCLE_STATUS/);
  assert.match(text, /this\.client\.cancel\(control\.executionId\)/);
  assert.match(text, /response\.status !== 'SKIPPED'/);
  assert.doesNotMatch(text, /ExecutionRunRegistry|executionRunRecoveryClient|execution-runs|jobManager|jobStorage|subscriptionUsage|subscriptionValidator|Billing|billing|provider|stripe|retry|duplicate/);
});

test('owning Workflow retry control uses only canonical projection evidence and the bounded runner authority', async () => {
  const text = await source(workflowRetryUrl);
  assert.match(text, /BoundedWorkflowRetryControlPolicy/);
  assert.match(text, /WORKFLOW_CONTINUATION/);
  assert.match(text, /LOCAL_EXECUTION_TICKET/);
  assert.match(text, /FINALIZED_FAILED/);
  assert.match(text, /EXPIRED/);
  assert.match(text, /FINALIZED_UNKNOWN/);
  assert.match(text, /const latest = attempts\[attempts\.length - 1\]/);
  assert.match(text, /this\.runnerFactory\(project\)/);
  assert.match(text, /runner\.retry\(control\.executionId\)/);
  assert.doesNotMatch(text, /coreClient|executionRunRecoveryClient|ExecutionRunRegistry|execution-runs|creative\.execute|Billing|billing|provider|stripe|jobManager|jobStorage/);
});

test('canonical UI exposes owning Creative cancel and bounded Workflow retry without generic ExecutionRun mutation', async () => {
  const [row, center] = await Promise.all([source(rowUrl), source(centerUrl)]);
  assert.match(row, /data-canonical-execution-run/);
  assert.match(row, /run\.capability === 'CREATIVE_EXECUTION'/);
  assert.match(row, /run\.authorityKind === 'CREATIVE_EXECUTION'/);
  assert.match(row, /run\.status === 'RUNNING'/);
  assert.match(row, /control\?\.state === 'AVAILABLE'/);
  assert.match(row, /onClick=\{\(\) => onCancel\(run\)\}/);
  assert.match(row, /run\.status === 'SUCCEEDED'/);
  assert.match(row, /run\.result\?\.kind === 'FINAL_IMAGE'/);
  assert.match(row, /data-canonical-execution-result/);
  assert.match(row, /href=\{run\.result\.imageUrl\}/);
  assert.match(row, /target="_blank"/);
  assert.match(row, /rel="noopener noreferrer"/);
  assert.match(row, /run\.capability === 'LOCAL_EXECUTION'/);
  assert.match(row, /run\.authorityKind === 'LOCAL_EXECUTION_TICKET'/);
  assert.match(row, /data-local-execution-authority/);
  assert.match(row, /localExecutionAuthorityStateLabel\(localAuthority\.state\)/);
  assert.match(row, /Cancellation unsupported\./);
  assert.match(row, /run\.capability === 'WORKFLOW_CONTINUATION'/);
  assert.match(row, /run\.authorityKind === 'WORKFLOW_CONTINUATION'/);
  assert.match(row, /workflowControl\?\.state === 'AVAILABLE'/);
  assert.match(row, /onClick=\{\(\) => onRetry\(run\)\}/);
  assert.match(row, /Retry exact step/);
  assert.doesNotMatch(row, /jobManager|jobStorage|onRunAgain|onDuplicate|onMoveUp|runAgain|duplicate|coreClient|execution-runs/);

  const cancelButtonIndex = row.indexOf('onClick={() => onCancel(run)}');
  const creativeGateIndex = row.indexOf("const cancelAvailable = creativeRunning");
  assert.ok(creativeGateIndex >= 0 && cancelButtonIndex > creativeGateIndex, 'canonical cancel button must remain gated by Creative ownership only');

  assert.match(center, /useMemo\(\(\) => createExecutionRunProjection\(\), \[\]\)/);
  assert.match(center, /new CreativeExecutionControlPolicy\(coreClient\.creative\)/);
  assert.match(center, /new BoundedWorkflowRetryControlPolicy/);
  assert.match(center, /createBoundedAgentRunner\(\{ projectId: workflowProjectId \}\)/);
  assert.match(center, /canonicalScopeMatches = Boolean\(normalizedProjectId\) && canonical\.projectId === normalizedProjectId/);
  assert.match(center, /await creativeControl\.cancel\(run\)/);
  assert.match(center, /await canonicalProjection\.refresh\(\)/);
  assert.match(center, /Canonical recovery state · owning Creative \/ Workflow controls only/);
  assert.match(center, /workflowControl=\{canonicalWorkflowControls\[run\.runId\]\}/);
  assert.match(center, /onCancel=\{cancelCanonicalRun\}/);
  assert.match(center, /onRetry=\{retryCanonicalWorkflow\}/);
  assert.match(center, /await workflowRetryControl\.retry\(run, normalizedProjectId\)/);
  assert.doesNotMatch(center, /<CanonicalExecutionRunRow[^>]*(onRunAgain|onDuplicate|onMoveUp)=/);
  assert.doesNotMatch(center, /ExecutionRunRegistry|coreClient\.executionRuns|execution-runs\/.*(cancel|retry)|coreClient\.creative\.execute/);

  assert.match(center, /data-job-center-session-jobs/);
  assert.match(center, /onCancel=\{\(id\) => jobManager\.cancel\(id\)\}/);
  assert.match(center, /onRunAgain=\{\(id\) => jobManager\.runAgain\(id\)/);
  assert.match(center, /onDuplicate=\{\(id\) => jobManager\.duplicate\(id\)/);
  assert.doesNotMatch(center, /jobManager\.retry/);
});

test('JobQueuePanel scopes recovery to the current Editor project route without creating mutation authority', async () => {
  const text = await source(queuePanelUrl);
  assert.match(text, /URLSearchParams\(window\.location\.search\)\.get\('id'\)/);
  assert.match(text, /<JobCenter projectId=\{projectId \?\? editorProjectId\(\)\}/);
  assert.doesNotMatch(text, /coreClient|jobStorage|jobManager|cancel|retry|duplicate|runAgain|POST|PATCH|DELETE/);
});
