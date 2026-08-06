import assert from 'node:assert/strict';
import test from 'node:test';
import { AIEscalationManager, CreativeExperimentPlanner, CreativePipelineOptimizer, CreativePipelinePlanner, CreativePipelineTemplates, OperationDependencyResolver, PipelineCostSimulator, PipelineDecisionLog, PipelineExplanationEngine, PipelineQualityGate } from '../src/platform/creative/pipeline';

test('Каталог одежды: prompt строит local + AI + local pipeline', () => {
  const pipeline = new CreativePipelinePlanner().plan('Сделай фото одежды для каталога');
  assert.equal(pipeline.intent, 'fashion_catalog');
  assert.deepEqual(pipeline.steps.map((step) => step.source), ['LOCAL', 'LOCAL', 'AI', 'LOCAL', 'QUALITY_GATE']);
  assert.equal(pipeline.steps[2].operation, 'virtual_try_on');
  assert.equal(pipeline.totalCost, 15);
});

test('Экономия: original cost 40 оптимизируется до 10', () => {
  const pipeline = { pipelineId: 'expensive', intent: 'luxury', confidence: 0.8, totalCost: 40, steps: [{ operation: 'background_replacement' as const, source: 'AI' as const, reason: 'new background', estimatedCost: 10 }, { operation: 'style_generation' as const, source: 'AI' as const, reason: 'style', estimatedCost: 15 }, { operation: 'virtual_try_on' as const, source: 'AI' as const, reason: 'clothes', estimatedCost: 15 }] };
  const optimized = new CreativePipelineOptimizer().optimize(pipeline, 40);
  assert.equal(optimized.originalCost, 40);
  assert.equal(optimized.optimizedCost, 10);
  assert.equal(optimized.savedCredits, 30);
  assert.ok(optimized.changes.includes('Keep only AI step with unique semantic value'));
});

test('Правильный порядок: segmentation перед background replacement', () => {
  const ordered = new OperationDependencyResolver().order([{ operation: 'background_replacement', source: 'AI', reason: 'replace background', estimatedCost: 10 }, { operation: 'color_correction', source: 'LOCAL', reason: 'finish color', estimatedCost: 0 }]);
  assert.equal(ordered[0].operation, 'segmentation');
  assert.ok(ordered.findIndex((step) => step.operation === 'segmentation') < ordered.findIndex((step) => step.operation === 'background_replacement'));
});

test('AI escalation: local insufficient выбирает AI на полезном этапе', () => {
  const pipeline = new CreativePipelinePlanner().plan('Сделай фото одежды для каталога');
  const gate = new PipelineQualityGate().evaluate('local_enhancement', 0.62, 0.75);
  const decision = new AIEscalationManager().decide(pipeline, gate);
  assert.equal(gate.decision, 'ESCALATE_AI');
  assert.equal(decision.selectedOperation, 'virtual_try_on');
  assert.equal(decision.estimatedCost, 15);
});

test('Quality gate: quality >= threshold пропускает AI', () => {
  const pipeline = new CreativePipelinePlanner().plan('Сделай фото для каталога');
  const gate = new PipelineQualityGate().evaluate('local_enhancement', 0.82, 0.75);
  const decision = new AIEscalationManager().decide(pipeline, gate);
  assert.equal(gate.decision, 'SKIP_AI');
  assert.equal(decision.estimatedCost, 0);
  assert.match(decision.reason, /local quality sufficient/);
});

test('Explanation: пользователь получает понятное объяснение стоимости', () => {
  const pipeline = new CreativePipelinePlanner().plan('Сделай фото одежды для каталога');
  const explanation = new PipelineExplanationEngine().explain(pipeline);
  assert.equal(explanation.requiresConfirmation, true);
  assert.match(explanation.userMessage, /бесплатно/);
  assert.match(explanation.userMessage, /AI потребуется/);
  assert.match(explanation.userMessage, /15 кредитов/);
});

test('Decision log: сохраняет почему выбран путь и сколько сэкономлено', () => {
  const log = new PipelineDecisionLog();
  const entry = log.record('SKIP_AI', 'local quality sufficient', 15, 123);
  assert.equal(entry.decision, 'SKIP_AI');
  assert.equal(entry.savedCredits, 15);
  assert.deepEqual(log.all(), [entry]);
});

test('Cost simulator и experiment mode рекомендуют дешевые варианты первыми', () => {
  const simulation = new PipelineCostSimulator().simulateVariants(5);
  const experiment = new CreativeExperimentPlanner().plan();
  assert.deepEqual(simulation.recommended, ['Option A', 'Option B']);
  assert.equal(simulation.totalCost, 10);
  assert.equal(experiment.totalCost, 0);
  assert.deepEqual(experiment.variants.map((variant) => variant.source), ['LOCAL', 'LOCAL', 'AI']);
});

test('Creative Pipeline Templates содержат творческие сценарии без workflow templates', () => {
  const templates = new CreativePipelineTemplates().list();
  assert.ok(templates.some((template) => template.name === 'Product Catalog'));
  assert.ok(templates.some((template) => template.name === 'Luxury Brand'));
  assert.ok(templates.some((template) => template.operations.includes('background_check')));
});

test('Intent confidence loop asks clarification for ambiguous creative direction', async () => {
  const { CreativeIntentConfidenceLoop } = await import('../src/platform/creative/pipeline');
  const decision = new CreativeIntentConfidenceLoop().decide('Сделай красиво', 0.62);
  assert.equal(decision.action, 'ASK_CLARIFICATION');
  assert.ok(decision.clarificationOptions.some((option) => option.includes('Luxury brand')));
});

test('Creative sandbox creates preview-only local, cheap AI, and full AI versions', async () => {
  const { CreativeSandbox } = await import('../src/platform/creative/pipeline');
  const sandbox = new CreativeSandbox().create('image-1');
  assert.equal(sandbox.originalImage, 'image-1');
  assert.equal(sandbox.finalGenerationRequiresConfirmation, true);
  assert.deepEqual(sandbox.versions.map((version) => version.mode), ['LOCAL_ONLY', 'LOCAL_PLUS_CHEAP_AI', 'FULL_AI']);
  assert.ok(sandbox.versions.every((version) => version.previewOnly));
});

test('AI preview compression turns 20 AI calls into local previews plus one final AI generation', async () => {
  const { AIPreviewCompression } = await import('../src/platform/creative/pipeline');
  const plan = new AIPreviewCompression().plan(20, 'variant-7');
  assert.equal(plan.localPreviewCount, 20);
  assert.equal(plan.finalAICalls, 1);
  assert.equal(plan.aiCallsAvoided, 19);
  assert.equal(plan.savedCredits, 285);
});

test('Creative decision memory suggests repeated luxury preferences without Memory Core', async () => {
  const { CreativeDecisionMemory } = await import('../src/platform/creative/pipeline');
  const memory = new CreativeDecisionMemory();
  memory.record({ decision: 'style', value: 'luxury', confidence: 0.8 });
  memory.record({ decision: 'background', value: 'dark', confidence: 0.76 });
  memory.record({ decision: 'lighting', value: 'soft', confidence: 0.78 });
  memory.record({ decision: 'style', value: 'luxury', confidence: 0.84 });
  const suggestion = memory.suggest();
  assert.equal(suggestion.autoApply, true);
  assert.match(suggestion.message, /премиальный стиль/);
});

test('Cost intelligence compares professional quality with almost same quality savings', async () => {
  const { CostIntelligenceLayer, CreativePipelinePlanner } = await import('../src/platform/creative/pipeline');
  const pipeline = new CreativePipelinePlanner().plan('Сделай фото одежды для каталога');
  const report = new CostIntelligenceLayer().analyze(pipeline);
  const recommended = report.recommendations.find((option) => option.recommended);
  assert.equal(report.aiOperations[0].operation, 'virtual_try_on');
  assert.equal(recommended?.option, 'Almost same quality');
  assert.equal(recommended?.saveCredits, 12);
});

test('Quality prediction warns before expensive AI when success probability is low', async () => {
  const { QualityPredictionModel } = await import('../src/platform/creative/pipeline');
  const prediction = new QualityPredictionModel().predict({ imageQuality: 0.4, faceVisibility: 0.5, maskComplexity: 0.8, transformationComplexity: 0.9 });
  assert.equal(prediction.expectedQuality, 'Low');
  assert.match(prediction.recommendation, /сначала улучшить освещение/);
});

test('Creative workflow composer supports auto and pro workflows from one engine', async () => {
  const { CreativeWorkflowComposer } = await import('../src/platform/creative/pipeline');
  const auto = new CreativeWorkflowComposer().compose('Сделай фото для Instagram');
  const pro = new CreativeWorkflowComposer().compose('Профессиональная обработка', 'PRO');
  assert.equal(auto.mode, 'AUTO');
  assert.equal(auto.totalCost, 0);
  assert.equal(pro.mode, 'PRO');
  assert.deepEqual(pro.steps.map((step) => step.name), ['Skin correction', 'Lighting', 'Background replacement', 'Color grade']);
});
