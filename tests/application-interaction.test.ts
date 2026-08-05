import assert from 'node:assert/strict';
import test from 'node:test';
import { InteractionController } from '../src/application/interaction/index.ts';
import { StateManager } from '../src/application/state/index.ts';

const scope = { userId: 'user-1', tenantId: 'tenant-1', projectId: 'project-1' };

const createState = () => {
  const state = new StateManager();
  const currentState = state.create({ ...scope, id: 'state-1', workspaceId: 'workspace-1', sessionId: 'session-1', experienceId: 'experience-1' });
  state.transition('state-1', 'READY', scope);
  state.transition('state-1', 'PROCESSING', scope);
  return { state, currentState };
};

const createContext = () => ({
  ...scope,
  stateId: 'state-1',
  workspaceId: 'workspace-1',
  sessionId: 'session-1',
  experienceId: 'experience-1',
  memory: ['preferred style: catalog'],
  workflowHistory: ['try-on'],
  intelligence: { confidence: 0.94 },
});

const createRequest = (overrides = {}) => ({
  id: 'interaction-1',
  ...scope,
  type: 'EDIT_IMAGE',
  payload: { prompt: 'Сделай одежду красной' },
  currentState: { id: 'state-1', workspaceId: 'workspace-1', sessionId: 'session-1', experienceId: 'experience-1', status: 'PROCESSING' },
  metadata: {},
  ...overrides,
});

test('получение пользовательского действия', () => {
  const { state } = createState();
  const controller = new InteractionController({ state });
  const response = controller.receive(createRequest());

  assert.equal(response.status, 'RECEIVED');
  assert.equal(response.action, 'EDIT_IMAGE');
  assert.equal(controller.inspect('interaction-1', scope).requestId, 'interaction-1');
});

test('запуск workflow через существующий контракт', () => {
  const { state } = createState();
  const controller = new InteractionController({ state });

  controller.receive(createRequest());
  const response = controller.process('interaction-1', scope, createContext());
  const applicationState = state.load('state-1', scope);

  assert.equal(response.status, 'COMPLETED');
  assert.equal(response.detectedIntent, 'try_on_edit');
  assert.equal(response.selectedWorkflow, 'try-on');
  assert.equal(applicationState.currentCommand, 'interaction-1');
  assert.equal(applicationState.currentWorkflow, 'try-on');
});

test('ожидание подтверждения', () => {
  const { state } = createState();
  const controller = new InteractionController({ state });

  controller.receive(createRequest({ metadata: { requiresConfirmation: true } }));
  const response = controller.process('interaction-1', scope, createContext());

  assert.equal(response.status, 'WAITING_USER');
  assert.equal(state.load('state-1', scope).status, 'WAITING_USER');
  assert.equal(response.requiredDecisions.length, 1);
  assert.ok(controller.history('interaction-1', scope).some((event) => event.type === 'interaction.waiting_user'));
});

test('продолжение после approve', () => {
  const { state } = createState();
  const controller = new InteractionController({ state });

  controller.receive(createRequest({ metadata: { requiresConfirmation: true } }));
  const waiting = controller.process('interaction-1', scope, createContext());
  const response = controller.confirm('interaction-1', waiting.requiredDecisions[0], scope, createContext());

  assert.equal(response.status, 'PROCESSING');
  assert.equal(response.executionStatus, 'PROCESSING');
  assert.equal(state.load('state-1', scope).status, 'PROCESSING');
  assert.ok(controller.history('interaction-1', scope).some((event) => event.type === 'interaction.confirmed'));
});

test('reject flow', () => {
  const { state } = createState();
  const controller = new InteractionController({ state });

  controller.receive(createRequest({ metadata: { requiresConfirmation: true } }));
  const waiting = controller.process('interaction-1', scope, createContext());
  const response = controller.reject('interaction-1', waiting.requiredDecisions[0], scope);

  assert.equal(response.status, 'REJECTED');
  assert.equal(response.executionStatus, 'REJECTED');
  assert.ok(controller.history('interaction-1', scope).some((event) => event.type === 'interaction.rejected'));
});

test('undo/redo integration', () => {
  const { state } = createState();
  const controller = new InteractionController({ state });

  controller.receive(createRequest());
  controller.process('interaction-1', scope, createContext());

  controller.receive(createRequest({ id: 'interaction-undo', type: 'UNDO' }));
  const undo = controller.process('interaction-undo', scope, createContext());
  assert.equal(undo.executionStatus, 'UNDO_COMPLETED');

  controller.receive(createRequest({ id: 'interaction-redo', type: 'REDO' }));
  const redo = controller.process('interaction-redo', scope, createContext());
  assert.equal(redo.executionStatus, 'REDO_COMPLETED');
});

test('suggestion generation', () => {
  const controller = new InteractionController();
  const suggestions = controller.suggest(createContext(), 'TRY_ON');

  assert.ok(suggestions.some((suggestion) => suggestion.title === 'Улучшить фон'));
  assert.ok(suggestions.some((suggestion) => suggestion.title === 'Сделать вариант для каталога'));
});

test('history immutable', () => {
  const { state } = createState();
  const controller = new InteractionController({ state });

  controller.receive(createRequest());
  controller.process('interaction-1', scope, createContext());
  const history = controller.history('interaction-1', scope);

  assert.ok(Object.isFrozen(history));
  assert.ok(Object.isFrozen(history[0]));
  assert.throws(() => { (history as unknown as unknown[]).push({}); }, /Cannot add property|object is not extensible|read only/i);
});

test('tenant isolation', () => {
  const { state } = createState();
  const controller = new InteractionController({ state });

  controller.receive(createRequest());

  assert.throws(() => controller.process('interaction-1', { ...scope, tenantId: 'tenant-2' }, createContext()), /access denied/i);
  assert.throws(() => controller.inspect('interaction-1', { ...scope, projectId: 'project-2' }), /access denied/i);
});

test('debug explainability', () => {
  const { state } = createState();
  const controller = new InteractionController({ state });

  controller.receive(createRequest({ metadata: { requiresConfirmation: true } }));
  controller.process('interaction-1', scope, createContext());
  const tree = controller.debug('interaction-1', scope);

  assert.equal(tree.userRequest.id, 'interaction-1');
  assert.equal(tree.detectedIntent, 'try_on_edit');
  assert.equal(tree.selectedWorkflow, 'try-on');
  assert.equal(tree.executionStatus, 'WAITING_USER');
  assert.equal(tree.requiredDecisions.length, 1);
});

test('forbidden imports', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const interactionPath = `${process.cwd()}/src/application/interaction`;
  const files = (await readdir(interactionPath)).filter((file) => file.endsWith('.ts'));

  for (const file of files) {
    const source = await readFile(`${interactionPath}/${file}`, 'utf8');
    assert.doesNotMatch(
      source,
      /from ['"]\.\.\/\.\.\/(lib|platform)|from ['"]\.\.\/(gateway|commands|workspace)|from ['"]\.\.\/\.\.\/\.\.\/(runtime|workers|providers|agent|orchestrator)/,
    );
  }
});
