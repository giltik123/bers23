import assert from 'node:assert/strict';
import test from 'node:test';
import { AIApplicationGateway } from '../src/application/gateway/AIApplicationGateway.ts';

const baseRequest = {
  requestId: 'req-1',
  userId: 'user-1',
  tenantId: 'tenant-1',
  projectId: 'project-1',
  prompt: 'Замени одежду на костюм, сохрани лицо',
  imageContext: { imageUrl: 'person.png', garmentImageUrl: 'suit.png' },
  budget: { maxCredits: 50, availableCredits: 100 },
  preferences: { confirmation: true },
};

const createRun = ({ id = 'exec-1', status = 'completed', providers = ['SAM3', 'FASHN', 'Reve'], output = { imageUrl: 'final.png' }, error = null } = {}) => ({
  id,
  workflowId: 'virtual-try-on',
  status,
  startedAt: Date.now(),
  completedAt: Date.now(),
  durationMs: 10,
  stepResults: providers.map((provider, index) => ({ stepId: provider.toLowerCase(), status: 'completed', attempt: 1, output: { provider }, durationMs: 3, metadata: { provider, cost: { credits: index + 1 } } })),
  output,
  error,
});

const createWorkflowEngine = ({ unavailableFashn = false, delayUntilCancel = false } = {}) => {
  const calls = [];
  return {
    calls,
    inspect(workflowId) {
      calls.push(['inspect', workflowId]);
      return { definition: { id: workflowId }, graph: { order: ['sam3', 'fashn', 'reve'] }, orderedSteps: [{ capability: 'SAM3' }, { capability: 'FASHN' }, { capability: 'Reve' }], estimatedBudget: { maxCredits: 50, maxDurationMs: 1000, maxProviderCalls: 3 } };
    },
    async execute(request) {
      calls.push(['execute', request.workflowId]);
      if (delayUntilCancel) {
        if (!request.signal.aborted) await new Promise((resolve) => request.signal.addEventListener('abort', resolve, { once: true }));
        return createRun({ status: 'failed', providers: [], error: 'cancelled' });
      }
      if (unavailableFashn && request.workflowId === 'virtual-try-on') return createRun({ status: 'failed', providers: ['SAM3'], error: 'FASHN unavailable' });
      if (request.workflowId === 'image-edit-basic') return createRun({ id: 'fallback-exec', providers: ['SAM3', 'Reve'], output: { imageUrl: 'fallback.png' } });
      return createRun();
    },
  };
};

const createGateway = (workflowEngine, agentDecision = {}) => new AIApplicationGateway({
  workflowEngine,
  agent: { process() { return { workflowId: 'virtual-try-on', confidence: 0.91, capabilities: ['virtual.tryon'], riskLevel: 'medium', fallbackWorkflowId: 'image-edit-basic', ...agentDecision }; } },
  identity: { authorize(request) { return { allowed: request.tenantId === 'tenant-1', reason: 'bad tenant' }; } },
  memory: { load() { return { previousLooks: 2 }; }, update(_context, run) { return [{ type: 'workflow-result', executionId: run.id }]; } },
  intelligence: { summarize(_context, run) { return { steps: run.stepResults.length, providers: run.stepResults.map((step) => step.metadata.provider) }; }, feedback() {} },
  analytics: { track() {} },
  project: { load(request) { return { id: request.projectId, owner: request.userId }; } },
});

test('Scenario 1: Gateway -> Agent -> Workflow -> SAM3 -> FASHN -> Reve', async () => {
  const workflowEngine = createWorkflowEngine();
  const gateway = createGateway(workflowEngine);
  const response = await gateway.execute(baseRequest);

  assert.equal(response.status, 'COMPLETED');
  assert.equal(response.workflowId, 'virtual-try-on');
  assert.equal(response.executionId, 'exec-1');
  assert.equal(response.cost.credits, 6);
  assert.deepEqual(response.intelligenceSummary.providers, ['SAM3', 'FASHN', 'Reve']);
  assert.deepEqual(workflowEngine.calls.map(([type, id]) => `${type}:${id}`), ['inspect:virtual-try-on', 'execute:virtual-try-on']);
});

test('Scenario 2: недостаточно credits -> budget rejection без workflow execution', async () => {
  const workflowEngine = createWorkflowEngine();
  const gateway = createGateway(workflowEngine);
  const response = await gateway.execute({ ...baseRequest, requestId: 'req-budget', budget: { maxCredits: 50, availableCredits: 10 } });

  assert.equal(response.status, 'REJECTED');
  assert.match(response.error, /credits/i);
  assert.deepEqual(workflowEngine.calls, []);
});

test('Scenario 3: FASHN unavailable -> fallback alternative route', async () => {
  const workflowEngine = createWorkflowEngine({ unavailableFashn: true });
  const gateway = createGateway(workflowEngine);
  const response = await gateway.execute({ ...baseRequest, requestId: 'req-fallback' });

  assert.equal(response.status, 'COMPLETED');
  assert.equal(response.executionId, 'fallback-exec');
  assert.deepEqual(workflowEngine.calls.map(([type, id]) => `${type}:${id}`), ['inspect:virtual-try-on', 'execute:virtual-try-on', 'execute:image-edit-basic']);
  assert.equal(response.result.imageUrl, 'fallback.png');
});

test('Scenario 4: cancel running workflow -> state CANCELLED', async () => {
  const workflowEngine = createWorkflowEngine({ delayUntilCancel: true });
  const gateway = createGateway(workflowEngine);
  const promise = gateway.execute({ ...baseRequest, requestId: 'req-cancel' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  gateway.cancel('req-cancel');
  const response = await promise;

  assert.equal(response.status, 'CANCELLED');
  assert.equal(gateway.inspect('req-cancel').state, 'CANCELLED');
});

test('policy requires confirmation for high risk identity replacement', async () => {
  const workflowEngine = createWorkflowEngine();
  const gateway = createGateway(workflowEngine, { riskLevel: 'high', confirmationRequired: true });
  const response = await gateway.execute({ ...baseRequest, requestId: 'req-risk', preferences: { confirmation: false } });

  assert.equal(response.status, 'REJECTED');
  assert.match(response.error, /confirmation/i);
});

test('debug API returns request, context, decision, workflow, graph, providers, cost, timeline, errors', async () => {
  const workflowEngine = createWorkflowEngine();
  const gateway = createGateway(workflowEngine);
  await gateway.execute({ ...baseRequest, requestId: 'req-debug' });
  const debug = gateway.debug('req-debug');

  assert.equal(debug.request.requestId, 'req-debug');
  assert.equal(debug.context.project.id, 'project-1');
  assert.equal(debug.agentDecision.workflowId, 'virtual-try-on');
  assert.equal(debug.workflow.id, 'virtual-try-on');
  assert.deepEqual(debug.executionGraph.order, ['sam3', 'fashn', 'reve']);
  assert.deepEqual(debug.providers, ['SAM3', 'FASHN', 'Reve']);
  assert.equal(debug.cost.credits, 6);
  assert.ok(debug.timeline.some((event) => event.state === 'COMPLETED'));
  assert.deepEqual(debug.errors, []);
});

test('metrics tracks success, cancellation, rejection, and averages', async () => {
  const gateway = createGateway(createWorkflowEngine());
  await gateway.execute({ ...baseRequest, requestId: 'req-metrics-ok' });
  await gateway.execute({ ...baseRequest, requestId: 'req-metrics-budget', budget: { maxCredits: 50, availableCredits: 0 } });
  const snapshot = gateway.metrics.snapshot();

  assert.equal(snapshot.requestsCount, 2);
  assert.equal(snapshot.rejectedRequests, 1);
  assert.equal(snapshot.successRate, 0.5);
  assert.equal(snapshot.averageCost, 3);
});
