import { coreClient } from '../src/api/coreClient.js';
import { LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES } from '../src/platform/creative/canonical/localComposite.ts';

const EXECUTION_KEY = 'bers:c5b:execution-id';

async function loadFixture() {
  const response = await fetch('/__c5b-fixture.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`C5B fixture load failed (${response.status})`);
  return response.json();
}

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function requireCondition(value, message) {
  if (!value) throw new Error(message);
}

function v1Result(ticket, evidence) {
  requireCondition(ticket?.version === '1', 'Expected v1 composite segmentation ticket');
  requireCondition(ticket.operation?.capability === LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment, 'Unexpected composite segmentation capability');
  requireCondition(ticket.cost?.paidCloudCredits === 0 && ticket.cost?.providerCalls === 0, 'Composite segmentation ticket contains forbidden cloud cost');
  requireCondition(Array.isArray(ticket.allowedModels) && ticket.allowedModels.length === 1, 'Composite segmentation ticket must authorize one test model');
  return Object.freeze({
    ticketId: ticket.ticketId,
    ticketVersion: '1',
    requestId: ticket.requestId,
    workflowId: ticket.workflowId,
    stepId: ticket.stepId,
    nonce: ticket.nonce,
    model: ticket.allowedModels[0],
    runtime: 'WASM',
    accelerator: 'wasm',
    outputs: Object.freeze([Object.freeze({ ...evidence })]),
    metrics: Object.freeze({ latencyMs: 7 }),
  });
}

function v2Result(ticket, evidence) {
  requireCondition(ticket?.version === '2', 'Expected v2 composite Background Isolation ticket');
  requireCondition(ticket.operation?.capability === LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation, 'Unexpected composite Background Isolation capability');
  requireCondition(ticket.cost?.paidCloudCredits === 0 && ticket.cost?.providerCalls === 0, 'Composite Background Isolation ticket contains forbidden cloud cost');
  requireCondition(Array.isArray(ticket.allowedExecutors) && ticket.allowedExecutors.length === 1, 'Composite Background Isolation ticket must authorize one deterministic executor');
  return Object.freeze({
    ticketId: ticket.ticketId,
    ticketVersion: '2',
    requestId: ticket.requestId,
    workflowId: ticket.workflowId,
    stepId: ticket.stepId,
    nonce: ticket.nonce,
    executor: ticket.allowedExecutors[0],
    runtime: 'BROWSER_JS',
    accelerator: 'cpu',
    outputs: Object.freeze([Object.freeze({ ...evidence })]),
    metrics: Object.freeze({ latencyMs: 3 }),
    benchmarkEvidence: Object.freeze({ pixelCount: 16, deterministicTool: 'background-isolation@1' }),
  });
}

/** First page lifetime: authenticate, start, finish segment, persist only executionId. */
globalThis.beginC5BBrowserAcceptance = async () => {
  const fixture = await loadFixture();
  const user = await coreClient.auth.me();
  requireCondition(user?.id === fixture.userId || user?.user_id === fixture.userId, 'Authenticated browser user does not match fixture scope');
  const started = await coreClient.compositeContinuations.start({
    projectId: fixture.projectId,
    clientRequestId: fixture.clientRequestId,
    inputArtifactId: fixture.inputArtifactId,
    analysis: fixture.analysis,
    points: fixture.points,
  });
  requireCondition(started.state === 'WAITING_FOR_LOCAL_RESULT' && started.nextAction?.type === 'LOCAL_EXECUTION', 'Composite start did not return a Core-selected local ticket');
  const ticket = started.nextAction.ticket;
  sessionStorage.clear();
  sessionStorage.setItem(EXECUTION_KEY, started.executionId);
  const evidence = await coreClient.compositeContinuations.uploadOutput({
    executionId: started.executionId,
    projectId: fixture.projectId,
    bytes: decodeBase64(fixture.maskAlphaBase64),
    mimeType: 'application/octet-stream',
  });
  const afterSegment = await coreClient.compositeContinuations.submitResult({
    executionId: started.executionId,
    projectId: fixture.projectId,
    result: v1Result(ticket, evidence),
  });
  requireCondition(afterSegment.state === 'WAITING_FOR_LOCAL_RESULT' && afterSegment.nextAction?.ticket?.version === '2', 'Composite did not advance to Background Isolation');
  requireCondition(sessionStorage.length === 1 && sessionStorage.getItem(EXECUTION_KEY) === started.executionId, 'Browser persisted workflow state beyond executionId');
  return Object.freeze({
    executionId: started.executionId,
    afterSegmentState: afterSegment.state,
    backgroundTicketId: afterSegment.nextAction.ticket.ticketId,
    sessionStorageKeys: Object.freeze([...Array(sessionStorage.length)].map((_, index) => sessionStorage.key(index))),
  });
};

/** Second page lifetime after real reload: prove CSRF memory reset, restore auth context, resume and finish. */
globalThis.resumeC5BBrowserAcceptanceAfterReload = async () => {
  const fixture = await loadFixture();
  const executionId = sessionStorage.getItem(EXECUTION_KEY);
  requireCondition(executionId && sessionStorage.length === 1, 'Reload did not preserve exactly one durable execution reference');

  // GET resume is safe and must work from cookie authority even though module-memory CSRF is gone.
  const beforeAuthRefresh = await coreClient.compositeContinuations.resume({ executionId, projectId: fixture.projectId });
  requireCondition(beforeAuthRefresh.state === 'WAITING_FOR_LOCAL_RESULT' && beforeAuthRefresh.nextAction?.ticket?.version === '2', 'Reload resume did not recover the outstanding Background Isolation ticket');

  // Prove reload cleared the module-memory anti-forgery token. The cookie is still present,
  // therefore a mutation before /auth/context must fail CSRF before upload persistence.
  let preRefreshFailure;
  try {
    await coreClient.compositeContinuations.uploadOutput({
      executionId,
      projectId: fixture.projectId,
      bytes: decodeBase64(fixture.compositePngBase64),
      mimeType: 'image/png',
    });
  } catch (error) {
    preRefreshFailure = Object.freeze({ code: error?.code, status: error?.status });
  }
  requireCondition(preRefreshFailure?.code === 'csrf_denied' && preRefreshFailure?.status === 403, 'Reload mutation did not fail closed before CSRF restoration');

  await coreClient.auth.me();
  const resumed = await coreClient.compositeContinuations.resume({ executionId, projectId: fixture.projectId });
  requireCondition(resumed.nextAction?.ticket?.ticketId === beforeAuthRefresh.nextAction.ticket.ticketId, 'Reconnect changed the durable outstanding ticket');
  const ticket = resumed.nextAction.ticket;
  const evidence = await coreClient.compositeContinuations.uploadOutput({
    executionId,
    projectId: fixture.projectId,
    bytes: decodeBase64(fixture.compositePngBase64),
    mimeType: 'image/png',
  });
  const completed = await coreClient.compositeContinuations.submitResult({
    executionId,
    projectId: fixture.projectId,
    result: v2Result(ticket, evidence),
  });
  requireCondition(completed.state === 'SUCCESS' && completed.terminalArtifactId, 'Reloaded browser did not reach durable SUCCESS');
  requireCondition(sessionStorage.length === 1 && sessionStorage.getItem(EXECUTION_KEY) === executionId, 'Browser accumulated workflow authority after reconnect');
  return Object.freeze({
    executionId,
    csrfFailureCode: preRefreshFailure.code,
    resumedTicketId: ticket.ticketId,
    state: completed.state,
    terminalArtifactId: completed.terminalArtifactId,
  });
};

/** Third page lifetime: terminal replay must be durable and side-effect free. */
globalThis.replayC5BBrowserAcceptanceAfterSecondReload = async () => {
  const fixture = await loadFixture();
  const executionId = sessionStorage.getItem(EXECUTION_KEY);
  requireCondition(executionId, 'Execution reference missing after second reload');
  await coreClient.auth.me();
  const replay = await coreClient.compositeContinuations.resume({ executionId, projectId: fixture.projectId });
  requireCondition(replay.state === 'SUCCESS' && replay.terminalArtifactId, 'Terminal continuation did not survive second browser reload');
  return Object.freeze({ executionId, state: replay.state, terminalArtifactId: replay.terminalArtifactId, sessionStorageLength: sessionStorage.length });
};
