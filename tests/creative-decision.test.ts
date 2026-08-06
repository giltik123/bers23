import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { CreativeDecisionEngine, DecisionContext } from '../src/platform/creative/decision';

const baseContext = (overrides = {}) => ({ userId: 'user-a', tenantId: 'tenant-a', projectId: 'project-a', prompt: 'улучшить цвет', availableOperations: ['brightness', 'contrast', 'color_correction', 'crop', 'light_adjustment', 'lighting', 'final_enhancement', 'virtual_try_on', 'background_generation', 'object_removal', 'generative_fill'], ...overrides });

test('Local path: улучшить цвет выбирает LOCAL и 0 credits', () => {
  const decision = new CreativeDecisionEngine().decide(baseContext());
  assert.equal(decision.mode, 'LOCAL');
  assert.equal(decision.estimatedCredits, 0);
  assert.deepEqual(decision.operations, ['color_correction']);
});

test('AI path: замени фон на Париж выбирает AI', () => {
  const decision = new CreativeDecisionEngine().decide(baseContext({ prompt: 'замени фон на Париж' }));
  assert.equal(decision.mode, 'AI');
  assert.equal(decision.operations.includes('background_generation'), true);
  assert.equal(decision.requiresConfirmation, true);
});

test('Hybrid path: фото одежды для каталога содержит LOCAL lighting и AI try-on', () => {
  const decision = new CreativeDecisionEngine().decide(baseContext({ prompt: 'сделай фото одежды для каталога' }));
  assert.equal(decision.mode, 'HYBRID');
  assert.equal(decision.operations.includes('lighting'), true);
  assert.equal(decision.operations.includes('virtual_try_on'), true);
});

test('Preference influence: luxury preference влияет на рекомендацию, но не меняет настройки', () => {
  const decision = new CreativeDecisionEngine().decide(baseContext({ prompt: 'создай фото товара', preferences: { styles: ['luxury'], workflows: ['catalog'], confidence: 0.85 } }));
  assert.equal(decision.operations.includes('luxury_catalog_direction'), true);
  assert.ok(decision.reasons.some((reason) => reason.category === 'PREFERENCE'));
});

test('Budget optimization: 40 credits оптимизируется до 10', () => {
  const decision = new CreativeDecisionEngine().decide(baseContext({ prompt: 'сделай фото одежды для каталога и замени фон', budget: { availableCredits: 10 } }));
  assert.equal(decision.estimatedCredits, 10);
  assert.equal(decision.savedCredits, 30);
  assert.ok(decision.reasons.some((reason) => reason.category === 'COST'));
});

test('Quality escalation: LOCAL insufficient приводит к AI escalation', () => {
  const decision = new CreativeDecisionEngine().decide(baseContext({ prompt: 'улучшить цвет', quality: { expectedQuality: 0.55, minimumQuality: 0.75 } }));
  assert.equal(decision.mode, 'HYBRID');
  assert.equal(decision.operations.includes('background_generation'), true);
  assert.ok(decision.reasons.some((reason) => reason.id === 'quality-escalation'));
});

test('Quality sufficient: LOCAL quality >= requiredQuality пропускает AI', () => {
  const decision = new CreativeDecisionEngine().decide(baseContext({ prompt: 'замени фон на Париж', quality: { expectedQuality: 0.9, minimumQuality: 0.75 } }));
  assert.equal(decision.mode, 'ASK_USER');
  assert.equal(decision.operations.includes('background_generation'), false);
  assert.ok(decision.reasons.some((reason) => reason.id === 'quality-sufficient'));
});

test('Explanation объясняет почему выбран путь и экономию', () => {
  const engine = new CreativeDecisionEngine();
  const decision = engine.decide(baseContext({ prompt: 'сделай фото одежды для каталога и замени фон' }));
  const explanation = engine.explain(decision.id);
  assert.equal(explanation.mode, 'HYBRID');
  assert.match(explanation.explanation, /бесплатные улучшения/);
  assert.match(explanation.explanation, /Экономия/);
});

test('History immutable и содержит decision events', () => {
  const engine = new CreativeDecisionEngine();
  const decision = engine.decide(baseContext());
  const history = engine.history();
  assert.ok(history.some((event) => event.type === 'decision.created'));
  assert.throws(() => history.push({ type: 'decision.created', decisionId: decision.id, userId: 'x', tenantId: 'x', projectId: 'x', createdAt: 1, message: 'x' }), /object is not extensible|read only|Cannot add property/);
});

test('Debug API показывает цепочку User → Prompt → Decision → Reasons', () => {
  const engine = new CreativeDecisionEngine();
  const decision = engine.decide(baseContext({ preferences: { styles: ['luxury'], workflows: ['catalog'], confidence: 0.8 }, budget: { availableCredits: 20 }, quality: { expectedQuality: 0.8, minimumQuality: 0.75 } }));
  const debug = engine.debug(decision.id);
  assert.match(debug, /User:user-a/);
  assert.match(debug, /Prompt:/);
  assert.match(debug, /Decision:/);
  assert.match(debug, /Reasons:/);
});

test('Security: DecisionContext immutable и проверяет tenant/project isolation', () => {
  const context = new DecisionContext().create(baseContext());
  assert.equal(new DecisionContext().canAccess(context, { userId: 'user-a', tenantId: 'tenant-a', projectId: 'project-a' }), true);
  assert.equal(new DecisionContext().canAccess(context, { userId: 'user-a', tenantId: 'tenant-b', projectId: 'project-a' }), false);
  assert.throws(() => context.availableOperations.push('new_operation'), /object is not extensible|read only|Cannot add property/);
});

test('Forbidden imports: decision layer не зависит от UI/Agent/Workflow/Provider/Runtime/Memory/Billing', () => {
  const forbidden = [/src\/lib\//, /src\/application\//, /agent/i, /workflow/i, /runtime/i, /provider/i, /memory/i, /react/i, /base44/i, /billing/i, /gateway/i];
  const directory = 'src/platform/creative/decision';
  for (const file of readdirSync(directory)) {
    if (!file.endsWith('.ts')) continue;
    const dependencyLines = readFileSync(join(directory, file), 'utf8').split('\n').filter((line) => /^import|^export .* from/.test(line)).join('\n');
    for (const pattern of forbidden) assert.equal(pattern.test(dependencyLines), false, `${file} contains forbidden import/dependency ${pattern}`);
  }
});
