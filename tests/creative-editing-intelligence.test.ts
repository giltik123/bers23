import assert from 'node:assert/strict';
import test from 'node:test';
import { AIEscalationPolicy, CreativeDecisionLog, CreativeEditIntentAnalyzer, CreativeEditStack, CreativeIntelligenceConfig, CreativePresetEngine, CreativeQualityEstimator, EditDecisionSignals, EditExplanationEngine, EditStrategyPlanner, LocalCapabilityAnalyzer, OperationGrouping, PreferenceSignalExtractor, PreviewDecisionEngine, SmartCostSimulator } from '../src/platform/creative/editing/intelligence';

const intentAnalyzer = new CreativeEditIntentAnalyzer();

test('Intent analysis supports premium, product, portrait, fashion, background, object, color, and artistic requests', () => {
  assert.equal(intentAnalyzer.analyze('сделай фото дороже').intent, 'premium_enhancement');
  assert.equal(intentAnalyzer.analyze('фото товара для магазина').intent, 'product_photo');
  assert.equal(intentAnalyzer.analyze('улучши портрет').intent, 'portrait_improvement');
  assert.equal(intentAnalyzer.analyze('замени одежду').intent, 'fashion_style');
  assert.equal(intentAnalyzer.analyze('замени фон на Париж').intent, 'background_change');
  assert.equal(intentAnalyzer.analyze('убери объект слева').intent, 'object_removal');
  assert.equal(intentAnalyzer.analyze('исправь цвет и контраст').intent, 'color_correction');
  assert.equal(intentAnalyzer.analyze('сделай кино стиль').intent, 'artistic_transformation');
});

test('Local free path: brightness request is LOCAL and costs zero credits', () => {
  const intent = intentAnalyzer.analyze('увеличь яркость');
  const capability = new LocalCapabilityAnalyzer().analyze(intent);
  assert.equal(capability.mode, 'LOCAL');
  assert.equal(capability.cost, 0);
  assert.equal(capability.credits, 0);
});

test('AI escalation: background replacement is AI required', () => {
  const intent = intentAnalyzer.analyze('замени фон на Париж');
  const capability = new LocalCapabilityAnalyzer().analyze(intent);
  assert.equal(capability.mode, 'AI');
  assert.equal(capability.workflow, 'background-replacement');
  assert.equal(capability.estimatedCredits, 10);
});

test('Strategy planning: premium photo recommends LOCAL_ENHANCEMENT with AI alternatives', () => {
  const intent = intentAnalyzer.analyze('сделай фото как у дорогого бренда');
  const plan = new EditStrategyPlanner().plan(intent);
  assert.equal(plan.recommended, 'LOCAL_ENHANCEMENT');
  assert.equal(plan.recommendedStrategy.cost, 0);
  assert.deepEqual(plan.alternatives.map((strategy) => strategy.id), ['STUDIO_AI', 'FULL_CREATIVE']);
  assert.match(plan.reason, /local improvements/);
});

test('Quality decision: local result at threshold skips AI', () => {
  const plan = new EditStrategyPlanner().plan(intentAnalyzer.analyze('сделай фото дороже'));
  const quality = new CreativeQualityEstimator().estimate(0.52, plan.recommendedStrategy.operations, 0.75);
  const escalation = new AIEscalationPolicy().decide(quality, new LocalCapabilityAnalyzer().analyze(intentAnalyzer.analyze('сделай фото дороже')));
  assert.equal(quality.beforeQuality, 0.52);
  assert.ok(quality.afterQuality >= 0.75);
  assert.equal(quality.recommendation, 'SKIP_AI');
  assert.equal(escalation.tryLocal, true);
  assert.equal(escalation.escalateToAI, false);
});

test('Preview shows operation cost before execution', () => {
  const plan = new EditStrategyPlanner().plan(intentAnalyzer.analyze('замени фон на Париж'));
  const preview = new PreviewDecisionEngine().decide(plan);
  assert.equal(preview.beforeExecution, true);
  assert.equal(preview.requiresConfirmation, true);
  assert.equal(preview.totalCost, 25);
  assert.deepEqual(preview.operations.map((operation) => [operation.name, operation.source, operation.cost]), [['Style transformation', 'AI', 10], ['Scene generation', 'AI', 15]]);
});

test('Explanation helps user understand why AI is needed', () => {
  const plan = new EditStrategyPlanner().plan(intentAnalyzer.analyze('замени фон на Париж'));
  const preview = new PreviewDecisionEngine().decide(plan);
  const explanation = new EditExplanationEngine().explain(preview);
  assert.match(explanation.userMessage, /потребуется AI/);
  assert.match(explanation.userMessage, /Локально нельзя/);
  assert.match(explanation.costExplanation, /25 кредитов/);
  assert.equal(explanation.aiExplainability.length, 2);
  assert.equal(explanation.aiExplainability[0].estimatedCost, 10);
});

test('Group undo: four local operations become one history entry', () => {
  const plan = new EditStrategyPlanner().plan(intentAnalyzer.analyze('сделай фото дороже'));
  const groups = new OperationGrouping().group(plan.recommendedStrategy.operations, 'Studio Enhancement');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, 'Studio Enhancement');
  assert.deepEqual(groups[0].operations.map((operation) => operation.type), ['brightness', 'contrast', 'color', 'sharpness']);
});

test('Non destructive edit stack keeps original unchanged and versions operations', () => {
  const stackEngine = new CreativeEditStack();
  const base = stackEngine.create('asset-1');
  const operation = new EditStrategyPlanner().plan(intentAnalyzer.analyze('увеличь яркость')).recommendedStrategy.operations[0];
  const next = stackEngine.apply(base, operation);
  const undone = stackEngine.undo(next);
  assert.equal(base.baseAsset, 'asset-1');
  assert.equal(base.operations.length, 0);
  assert.equal(next.baseAsset, 'asset-1');
  assert.equal(next.currentVersion, 'asset-1:v1');
  assert.equal(undone.currentVersion, 'asset-1:v0');
});

test('Cost optimization: AI avoided and saved credits are calculated', () => {
  const plan = new EditStrategyPlanner().plan(intentAnalyzer.analyze('сделай фото дороже'));
  const cost = new SmartCostSimulator().simulate(plan);
  assert.equal(cost.localOperations, 4);
  assert.equal(cost.aiOperations, 0);
  assert.equal(cost.estimatedCost, 0);
  assert.equal(cost.savedCredits, 25);
});

test('Preference signals and preset foundation prepare personalization without touching Memory', () => {
  const plan = new EditStrategyPlanner().plan(intentAnalyzer.analyze('сделай фото дороже'));
  const signals = new PreferenceSignalExtractor().extract(plan.recommendedStrategy.operations);
  const preset = new CreativePresetEngine().find('Luxury Brand');
  const decisionSignal = new EditDecisionSignals().record('preferred_free_editing');
  assert.ok(signals.some((signal) => signal.signal === 'prefers_minimal_ai'));
  assert.equal(preset?.costEstimate, 10);
  assert.equal(decisionSignal.confidenceDelta, 0.1);
});


test('Creative decision log records local, AI, and escalation decisions for later analysis', () => {
  const log = new CreativeDecisionLog();
  const aiPlan = new EditStrategyPlanner().plan(intentAnalyzer.analyze('замени фон на Париж'));
  const localPlan = new EditStrategyPlanner().plan(intentAnalyzer.analyze('увеличь яркость'));
  const aiEntry = log.record(aiPlan.recommendedStrategy.operations[1], 'AI_REQUIRED', aiPlan.confidence, 100);
  const localEntry = log.record(localPlan.recommendedStrategy.operations[0], 'LOCAL_SELECTED', localPlan.confidence, 101);
  assert.equal(aiEntry.operation, 'scene_generation');
  assert.equal(aiEntry.estimatedCost, 15);
  assert.equal(localEntry.decision, 'LOCAL_SELECTED');
  assert.equal(log.aiRequired().length, 1);
  assert.equal(log.all().length, 2);
});

test('Creative intelligence config changes quality and AI escalation thresholds per plan', () => {
  const config = new CreativeIntelligenceConfig();
  const free = config.forPlan('Free');
  const studio = config.forPlan('Studio');
  const quality = { beforeQuality: 0.5, afterQuality: 0.7, confidence: 0.82, recommendation: 'ESCALATE_TO_AI' as const };
  const capability = { mode: 'LOCAL' as const, cost: 10, credits: 10, estimatedCredits: 10, reason: 'optional AI polish' };
  const freeDecision = new AIEscalationPolicy().decide(quality, capability, free);
  const studioDecision = new AIEscalationPolicy().decide(quality, capability, studio);
  assert.equal(free.qualityThreshold, 0.85);
  assert.equal(studio.qualityThreshold, 0.65);
  assert.equal(freeDecision.escalateToAI, true);
  assert.equal(studioDecision.escalateToAI, false);
});

test('Explainability contract is mandatory for every AI preview operation', () => {
  const plan = new EditStrategyPlanner().plan(intentAnalyzer.analyze('замени фон на Париж'));
  const preview = new PreviewDecisionEngine().decide(plan);
  const aiOperations = preview.operations.filter((operation) => operation.source === 'AI');
  assert.ok(aiOperations.length > 0);
  assert.ok(aiOperations.every((operation) => operation.explainability));
  assert.deepEqual(Object.keys(aiOperations[0].explainability ?? {}).sort(), ['estimatedCost', 'expectedBenefit', 'operation', 'whyAI', 'whyNotLocal']);
});
