import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import test from 'node:test';
import { preProcessFile } from 'typescript';
import { createWorkflowEngine } from '../src/platform/workflow/createWorkflowEngine.ts';
import { workflowTemplates } from '../src/platform/workflow/WorkflowTemplates.ts';
import { WorkflowGraphBuilder } from '../src/platform/workflow/WorkflowGraph.ts';

const successResult = (stepId, attempt = 1) => ({ stepId, status: 'completed', attempt, output: { stepId }, durationMs: 5 });

const createOrchestrator = ({ failStep = null, recoverStep = null } = {}) => {
  const attempts = new Map();
  const calls = [];
  return {
    calls,
    async execute(plan) {
      const step = plan.steps[0].workflowStep;
      calls.push(step.id);
      const attempt = (attempts.get(step.id) || 0) + 1;
      attempts.set(step.id, attempt);
      if (step.id === recoverStep && attempt === 1) return { stepId: step.id, status: 'failed', attempt, error: 'temporary failure', durationMs: 3 };
      if (step.id === failStep) return { stepId: step.id, status: 'failed', attempt, error: 'hard failure', durationMs: 3 };
      return successResult(step.id, attempt);
    },
  };
};

test('регистрация workflow и готовые шаблоны', () => {
  const engine = createWorkflowEngine({ orchestrator: createOrchestrator() });
  assert.equal(engine.registry().has('image-edit-basic'), true);
  assert.equal(engine.registry().has('portrait-enhancement'), true);
  assert.equal(engine.registry().has('hair-color-edit'), true);
  assert.equal(engine.registry().has('virtual-try-on'), true);
  assert.equal(engine.registry().has('background-replacement'), true);
  assert.equal(engine.registry().list().length, 5);
});

test('validation отклоняет некорректные зависимости', () => {
  const engine = createWorkflowEngine({ orchestrator: createOrchestrator() });
  const base = workflowTemplates.find((workflow) => workflow.id === 'image-edit-basic');
  const broken = { ...base, steps: [{ ...base.steps[0], dependsOn: ['missing-step'] }] };
  const validation = engine.validate(broken);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes('missing-step')));
});

test('dependency ordering строит корректный порядок для Virtual Try-On', () => {
  const workflow = workflowTemplates.find((item) => item.id === 'virtual-try-on');
  const graph = new WorkflowGraphBuilder().build(workflow);
  assert.deepEqual(graph.order, ['person-analysis', 'garment-processing', 'virtual-try-on', 'quality-validation', 'composition']);
});

test('запуск workflow через Orchestrator', async () => {
  const orchestrator = createOrchestrator();
  const engine = createWorkflowEngine({ orchestrator });
  const run = await engine.execute({ workflowId: 'background-replacement' });
  assert.equal(run.status, 'completed');
  assert.deepEqual(orchestrator.calls, ['subject-segmentation', 'generate-background', 'compose-background']);
  assert.equal(run.stepResults.length, 3);
});

test('failure одного шага завершает workflow как failed и пишет history', async () => {
  const engine = createWorkflowEngine({ orchestrator: createOrchestrator({ failStep: 'compose-background' }) });
  const run = await engine.execute({ workflowId: 'background-replacement' });
  assert.equal(run.status, 'failed');
  assert.equal(run.error, 'hard failure');
  assert.equal(engine.history().listRuns('background-replacement').length, 1);
});

test('recovery через retry помечает workflow как recovered', async () => {
  const orchestrator = createOrchestrator({ recoverStep: 'apply-edit' });
  const engine = createWorkflowEngine({ orchestrator });
  const run = await engine.execute({ workflowId: 'image-edit-basic' });
  assert.equal(run.status, 'recovered');
  assert.equal(run.stepResults.find((result) => result.stepId === 'apply-edit').status, 'recovered');
  assert.deepEqual(orchestrator.calls, ['analyze-image', 'apply-edit', 'apply-edit', 'validate-quality']);
});

test('budget rejection отклоняет workflow до Orchestrator', async () => {
  const orchestrator = createOrchestrator();
  const engine = createWorkflowEngine({ orchestrator });
  const run = await engine.execute({ workflowId: 'virtual-try-on', policy: { budget: { maxCredits: 10 } } });
  assert.equal(run.status, 'rejected');
  assert.match(run.error, /budget/i);
  assert.deepEqual(orchestrator.calls, []);
});

test('risk rejection отклоняет workflow до Orchestrator', async () => {
  const orchestrator = createOrchestrator();
  const engine = createWorkflowEngine({ orchestrator });
  const run = await engine.execute({ workflowId: 'portrait-enhancement', policy: { maxRiskLevel: 'low' } });
  assert.equal(run.status, 'rejected');
  assert.match(run.error, /risk/i);
  assert.deepEqual(orchestrator.calls, []);
});

test('workflow history хранит runs и timeline', async () => {
  const engine = createWorkflowEngine({ orchestrator: createOrchestrator() });
  const run = await engine.execute({ workflowId: 'image-edit-basic' });
  assert.equal(engine.history().getRun(run.id).id, run.id);
  assert.ok(engine.history().timeline('image-edit-basic').some((event) => event.type === 'workflow_completed'));
});

test('debug snapshot содержит события исполнения', async () => {
  const engine = createWorkflowEngine({ orchestrator: createOrchestrator() });
  await engine.execute({ workflowId: 'background-replacement' });
  const snapshot = engine.debugSnapshot('background-replacement');
  assert.ok(snapshot.events.some((event) => event.type === 'workflow_started'));
  assert.ok(snapshot.events.some((event) => event.type === 'workflow_completed'));
});

test('отсутствие запрещённых импортов в workflow layer', async () => {
  const forbidden = ['/src/lib/', '@/lib/', '/components/', '@/components/', '/pages/', '@/pages/', 'Router', 'Runtime', 'Workers', 'Providers', 'Memory', 'Intelligence'];
  const workflowRoot = resolve('src/platform/workflow');
  const files = await collectWorkflowFiles(workflowRoot);
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const imports = preProcessFile(source, true, true).importedFiles
      .map(({ fileName }) => fileName)
      .filter((specifier) => {
        if (!specifier.startsWith('.')) return true;
        const importedPath = relative(workflowRoot, resolve(dirname(file), specifier));
        return importedPath === '..' || importedPath.startsWith(`..${sep}`);
      });
    for (const marker of forbidden) assert.equal(imports.some((specifier) => specifier.includes(marker)), false, `${file} imports forbidden marker ${marker}`);
  }
});

async function collectWorkflowFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? collectWorkflowFiles(full) : Promise.resolve(full.endsWith('.ts') ? [full] : []);
  }));
  return nested.flat();
}
