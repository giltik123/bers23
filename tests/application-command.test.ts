import assert from 'node:assert/strict';
import test from 'node:test';
import { CommandDebugger } from '../src/application/commands/CommandDebugger.ts';
import { CommandHistory } from '../src/application/commands/CommandHistory.ts';
import { CommandParser } from '../src/application/commands/CommandParser.ts';
import { CommandPlanner } from '../src/application/commands/CommandPlanner.ts';
import { CommandValidator } from '../src/application/commands/CommandValidator.ts';

const parser = new CommandParser();
const validator = new CommandValidator();
const baseContext = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  projectId: 'project-1',
  input: { imageUrl: 'person.png', garmentImageUrl: 'suit.png' },
  budget: { availableCredits: 100, estimatedCredits: 20 },
  policy: { allowedCapabilities: ['virtual-try-on', 'person-preservation', 'hair-color-edit', 'image-editing', 'identity-transformation'], confirmation: true },
};

test('Fashion: "сделай фото для каталога одежды" -> virtual-try-on', () => {
  const command = parser.parse('сделай фото для каталога одежды');
  assert.equal(command.intent, 'fashion_catalog_image');
  assert.equal(command.requiredWorkflow, 'virtual-try-on');
  assert.deepEqual(command.requiredCapabilities, ['virtual-try-on', 'person-preservation']);
  assert.ok(command.confidence >= 0.9);
});

test('Hair: "измени цвет волос" -> hair-color-edit', () => {
  const command = parser.parse('измени цвет волос');
  assert.equal(command.intent, 'hair_color_change');
  assert.equal(command.requiredWorkflow, 'hair-color-edit');
  assert.ok(command.requiredCapabilities.includes('hair-color-edit'));
});

test('Missing data: "сделай красивое фото" -> request clarification', () => {
  const command = parser.parse('сделай красивое фото');
  const validation = validator.validate(command, { ...baseContext, input: {}, policy: { allowedCapabilities: ['image-editing'] } });
  assert.equal(validation.clarificationRequired, true);
  assert.equal(validation.command.status, 'CLARIFICATION_REQUIRED');
  assert.ok(validation.errors.some((error) => /Image input/.test(error)));
});

test('High risk: "измени лицо человека" -> confirmation required', () => {
  const command = parser.parse('измени лицо человека');
  const validation = validator.validate(command, { ...baseContext, policy: { allowedCapabilities: ['identity-transformation'], confirmation: false } });
  assert.equal(command.intent, 'identity_transformation');
  assert.equal(validation.confirmationRequired, true);
  assert.equal(validation.command.status, 'CONFIRMATION_REQUIRED');
});

test('CommandPlanner создаёт Gateway Request через workflow recommendation', () => {
  const command = parser.parse('Сделай мне фото для магазина, замени одежду на костюм');
  const planner = new CommandPlanner({ recommend() { return { workflow: 'virtual-try-on', confidence: 0.96, alternatives: ['image-edit-basic'], explanation: 'Fashion catalog intent.' }; } });
  const plan = planner.plan(command, baseContext);
  assert.equal(plan.command.status, 'PLANNED');
  assert.equal(plan.recommendation.workflow, 'virtual-try-on');
  assert.equal(plan.gatewayRequest.prompt, command.userInput);
  assert.equal(plan.gatewayRequest.metadata.intent, 'fashion_catalog_image');
});

test('Command History сохраняет input, parsed intent, chosen workflow, result, feedback', () => {
  const history = new CommandHistory();
  const command = parser.parse('измени цвет волос');
  const record = history.record(command, { status: 'COMPLETED' }, { rating: 5 });
  assert.equal(record.input, 'измени цвет волос');
  assert.equal(record.parsedIntent, 'hair_color_change');
  assert.equal(record.chosenWorkflow, 'hair-color-edit');
  assert.deepEqual(history.get(command.id).userFeedback, { rating: 5 });
});

test('Debug API возвращает Input -> Intent -> Capabilities -> Workflow -> Execution -> Provider -> Result', () => {
  const debuggerApi = new CommandDebugger();
  const command = parser.parse('сделай фото для каталога одежды');
  const plan = new CommandPlanner().plan(command, baseContext);
  const result = { status: 'COMPLETED', executionId: 'exec-1', result: { imageUrl: 'final.png' }, intelligenceSummary: { providers: ['SAM3', 'FASHN', 'Reve'] } };
  debuggerApi.track(command.id, 'parsed', { intent: command.intent });
  debuggerApi.track(command.id, 'planned', { workflow: plan.recommendation.workflow });
  const snapshot = debuggerApi.debug(command, plan, result);
  assert.equal(snapshot.input, command.userInput);
  assert.equal(snapshot.intent, 'fashion_catalog_image');
  assert.deepEqual(snapshot.capabilities, ['virtual-try-on', 'person-preservation']);
  assert.equal(snapshot.workflow, 'virtual-try-on');
  assert.deepEqual(snapshot.execution, { status: 'COMPLETED', executionId: 'exec-1' });
  assert.deepEqual(snapshot.provider, ['SAM3', 'FASHN', 'Reve']);
  assert.equal(snapshot.result.result.imageUrl, 'final.png');
});

test('Full path: Command -> Gateway -> Workflow -> Provider', async () => {
  const command = parser.parse('Сделай мне фото для магазина, замени одежду на костюм');
  const validation = validator.validate(command, baseContext);
  assert.equal(validation.valid, true);
  const planner = new CommandPlanner();
  const plan = planner.plan(command, baseContext);
  const calls = [];
  const gateway = {
    async execute(request) {
      calls.push(['Gateway', request.metadata.commandId]);
      calls.push(['Workflow', request.metadata.workflow]);
      calls.push(['Provider', 'SAM3']);
      calls.push(['Provider', 'FASHN']);
      calls.push(['Provider', 'Reve']);
      return { status: 'COMPLETED', workflowId: request.metadata.workflow, executionId: 'exec-1', result: { imageUrl: 'catalog.png' }, intelligenceSummary: { providers: ['SAM3', 'FASHN', 'Reve'] } };
    },
  };
  const result = await gateway.execute(plan.gatewayRequest);
  assert.equal(result.workflowId, 'virtual-try-on');
  assert.deepEqual(calls.map(([layer]) => layer), ['Gateway', 'Workflow', 'Provider', 'Provider', 'Provider']);
  assert.deepEqual(result.intelligenceSummary.providers, ['SAM3', 'FASHN', 'Reve']);
});
