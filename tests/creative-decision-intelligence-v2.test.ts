import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import test from "node:test";
import {
  AdaptiveStrategyProfiles, DecisionConfidenceCalibrator, DecisionEmbedding, DecisionEvolution,
  DecisionExplainabilityGraph, DecisionFeatureExtractor, DecisionKnowledgeGraph, DecisionLearningDataset,
  DecisionOutcomePredictor, DecisionReplayEngine, DecisionScenarioSimulator, DecisionStrategySearcher,
  HeuristicDecisionScoringModel, MultiCandidateGenerator, MultiObjectiveOptimizer, NearestDecisionSearch,
  UserSatisfactionPredictor, type DecisionDatasetRecord, type DecisionIntelligenceContext,
  CreativeConfidenceBands, DecisionConflictDetector, DecisionCounterfactualAnalyzer, DecisionDiversitySelector,
  DecisionHealthAnalyzer, DecisionStabilityAnalyzer, DecisionStoryBuilder, DecisionTraceCompressor,
  DecisionTrainingExporter, DiminishingReturnsAnalyzer, DynamicCostCurve, GoalSatisfactionScorer,
  HierarchicalIntentDecomposer, OpportunityDetector, OperationSynergyCalculator, PreferenceReliabilityAnalyzer,
  ProviderIndependenceAnalyzer, SemanticOperationGraphBuilder,
} from "../src/platform/creative/decision/intelligence/index";

let id = 0;
const generator = new MultiCandidateGenerator({ createId: () => `candidate-${++id}` });
const context: DecisionIntelligenceContext = Object.freeze({ userId: "user-1", tenantId: "tenant-1", projectId: "project-1",
  prompt: "Профессиональный luxury fashion каталог, замени фон и одежду", intent: "luxury_catalog",
  availableOperations: Object.freeze(["brightness", "contrast", "color", "crop", "lighting", "ai:try-on", "ai:background", "ai:upscale"]),
  preferredOperations: Object.freeze(["lighting", "color"]), availableCredits: 20, currentQuality: .48, minimumQuality: .8 });

const record = (overrides: Partial<DecisionDatasetRecord> = {}): DecisionDatasetRecord => ({ id: "record-1", userId: context.userId,
  tenantId: context.tenantId, projectId: context.projectId, prompt: context.prompt, intent: context.intent,
  operations: ["lighting", "ai:try-on"], strategy: "HYBRID_2", decision: "candidate-2", accepted: true,
  rejected: false, undo: false, quality: .86, credits: 8, executionTimeMs: 900, provider: "provider-a", createdAt: 100, ...overrides });

test("multi generator строит десятки immutable кандидатов всех режимов", () => {
  const candidates = generator.generate(context);
  assert.ok(candidates.length >= 20);
  assert.deepEqual(new Set(candidates.map(({ mode }) => mode)), new Set(["LOCAL", "HYBRID", "AI"]));
  assert.equal(Object.isFrozen(candidates), true);
  assert.throws(() => (candidates as unknown[]).push({}));
});

test("strategy search строит дерево и позволяет его обойти", () => {
  const searcher = new DecisionStrategySearcher();
  const tree = searcher.build(generator.generate(context));
  assert.deepEqual(tree.children.map(({ label }) => label), ["LOCAL", "HYBRID", "AI"]);
  assert.ok(searcher.flatten(tree).length > 20);
  assert.equal(Object.isFrozen(tree.children), true);
});

test("Pareto optimizer сравнивает семь целей без сведения frontier к одному score", () => {
  const profile = new AdaptiveStrategyProfiles().get("BALANCED");
  const result = new MultiObjectiveOptimizer(new HeuristicDecisionScoringModel()).optimize(generator.generate(context), context, profile);
  assert.ok(result.frontier.length > 1);
  assert.ok(result.recommended.utility >= 0 && result.recommended.utility <= 1);
  assert.deepEqual(Object.keys(result.recommended.objectives).sort(), ["creativity", "credits", "latency", "preference", "probability", "quality", "risk"]);
});

test("adaptive scoring profiles выбираются по бюджету, качеству и настройке", () => {
  const profiles = new AdaptiveStrategyProfiles();
  assert.equal(profiles.select({ availableCredits: 0 }).name, "ECONOMY");
  assert.equal(profiles.select({ minimumQuality: .95 }).name, "MAXIMUM_QUALITY");
  assert.equal(profiles.select({}, "EXPERIMENTAL").name, "EXPERIMENTAL");
});

test("dataset хранит полный immutable опыт с tenant/project isolation", () => {
  const dataset = new DecisionLearningDataset();
  dataset.add(record());
  const own = dataset.list(context);
  assert.equal(own.length, 1);
  assert.equal(Object.isFrozen(own[0].operations), true);
  assert.equal(dataset.list({ userId: context.userId, tenantId: "other", projectId: context.projectId }).length, 0);
  assert.equal(dataset.list({ userId: context.userId, tenantId: context.tenantId, projectId: "other" }).length, 0);
});

test("feature extractor и математический embedding кодируют творческий запрос", () => {
  const extractor = new DecisionFeatureExtractor();
  const embedding = new DecisionEmbedding();
  const features = extractor.extract(context.prompt, context.intent);
  assert.ok(features.labels.includes("luxury"));
  assert.ok(features.labels.includes("catalog"));
  const vector = embedding.embed(features);
  assert.equal(vector.dimensions.length, 9);
  assert.ok(vector.dimensions.every((value) => value >= 0 && value <= 1));
  assert.equal(embedding.similarity(vector, vector), 1);
});

test("nearest search находит похожий опыт и агрегирует acceptance/cost", () => {
  const extractor = new DecisionFeatureExtractor(); const embedding = new DecisionEmbedding();
  const vectorize = (item: DecisionDatasetRecord) => embedding.embed(extractor.extract(item.prompt, item.intent));
  const search = new NearestDecisionSearch({ vectorize }, embedding);
  const matches = search.search(vectorize(record()), [record(), record({ id: "record-2", accepted: false, credits: 12 })]);
  assert.equal(matches[0].similarity, 1);
  assert.deepEqual(search.summarize(matches), { acceptanceRate: .5, averageCredits: 10 });
});

test("outcome и satisfaction predictors оценивают результат до исполнения", () => {
  const profile = new AdaptiveStrategyProfiles().get("PROFESSIONAL");
  const strategy = new HeuristicDecisionScoringModel().evaluate(generator.generate(context)[1], context, profile);
  const outcome = new DecisionOutcomePredictor().predict(strategy, []);
  const satisfaction = new UserSatisfactionPredictor().predict(strategy, outcome);
  Object.values(outcome).forEach((value) => assert.ok(value >= 0 && value <= 1));
  assert.ok(satisfaction >= 0 && satisfaction <= 100);
});

test("confidence calibration учитывает dataset, similarity, history и variance", () => {
  const calibrator = new DecisionConfidenceCalibrator();
  const weak = calibrator.calibrate({ rawConfidence: .7, datasetSize: 0, similarity: 0, historySuccessRate: .5, variance: .8 });
  const strong = calibrator.calibrate({ rawConfidence: .7, datasetSize: 1000, similarity: .95, historySuccessRate: .9, variance: .05 });
  assert.ok(strong > weak);
  assert.ok(strong <= 1);
});

test("explainability graph содержит всю причинную цепочку", () => {
  const graph = new DecisionExplainabilityGraph().build({ prompt: context.prompt, intent: context.intent,
    features: ["luxury", "catalog"], candidates: 24, ranking: "Pareto frontier", optimization: "Balanced",
    decision: "HYBRID_2", confidence: .84, expectedQuality: .86, expectedCost: 8, expectedSatisfaction: 91 });
  const labels: string[] = []; let cursor = graph;
  while (cursor) { labels.push(cursor.label); cursor = cursor.children[0] as typeof graph; }
  assert.deepEqual(labels, ["Prompt", "Intent", "Features", "Candidates", "Ranking", "Optimization", "Decision", "Confidence", "Expected Quality", "Expected Cost", "Expected Satisfaction"]);
});

test("what-if и replay пересчитывают решение без исполнения", () => {
  const simulator = new DecisionScenarioSimulator(generator, new AdaptiveStrategyProfiles());
  const noBudget = simulator.simulate(context, { availableCredits: 0, priority: "COST" });
  assert.equal(noBudget.profile.name, "ECONOMY");
  const unavailable = simulator.simulate(context, { providerAvailable: false });
  assert.ok(unavailable.candidates.every(({ mode }) => mode === "LOCAL"));
  const replay = new DecisionReplayEngine(simulator).replay(record(), context, { priority: "QUALITY" });
  assert.equal(replay.current.profile.name, "MAXIMUM_QUALITY");
  assert.equal(Object.isFrozen(replay.changes), true);
});

test("knowledge graph агрегирует пути, а evolution хранит происхождение", () => {
  const graph = new DecisionKnowledgeGraph();
  graph.addPath(["Portrait", "Luxury", "Studio", "Try-on", "Success"], true);
  graph.addPath(["Portrait", "Luxury", "Studio", "Try-on", "Success"], true);
  assert.deepEqual(graph.snapshot()[0], { from: "Portrait", to: "Luxury", occurrences: 2, successes: 2 });
  const evolution = new DecisionEvolution({ now: () => 200 });
  evolution.record("decision-5"); evolution.record("decision-12", "decision-5"); evolution.record("decision-21", "decision-12");
  assert.deepEqual(evolution.lineage("decision-21").map(({ decisionId }) => decisionId), ["decision-21", "decision-12", "decision-5"]);
});

test("hierarchical intent decomposition раскрывает intent, goals и operations", () => {
  const result = new HierarchicalIntentDecomposer().decompose("Хочу luxury fashion фото одежды для каталога");
  assert.equal(result.primaryIntent, "LUXURY");
  assert.ok(result.secondaryIntents.includes("CATALOG"));
  assert.ok(result.creativeGoals.includes("premium_lighting"));
  assert.ok(result.operations.includes("ai:try-on"));
  assert.equal(Object.isFrozen(result.operations), true);
});

test("goal satisfaction измеряет приближение к цели отдельно от quality", () => {
  const score = new GoalSatisfactionScorer().score(.42, ["premium_lighting", "brand_consistency"],
    ["premium_lighting", "brand_consistency"], .3);
  assert.equal(score.current, .42);
  assert.ok(score.predicted >= .89);
  assert.ok(score.improvement > 0);
});

test("semantic operation graph добавляет зависимости и правильный порядок", () => {
  const graph = new SemanticOperationGraphBuilder().build(["contrast", "color_balance"]);
  assert.ok(graph.executionOrder.indexOf("lighting") < graph.executionOrder.indexOf("exposure"));
  assert.ok(graph.executionOrder.indexOf("exposure") < graph.executionOrder.indexOf("contrast"));
  assert.ok(graph.executionOrder.indexOf("white_balance") < graph.executionOrder.indexOf("color_balance"));
});

test("operation synergy добавляет совместный quality bonus", () => {
  const synergy = new OperationSynergyCalculator().calculate(["lighting", "contrast", "color_balance"],
    { lighting: .04, contrast: .03, color_balance: .02 });
  assert.equal(synergy.baseGain, .09);
  assert.equal(synergy.synergyBonus, .12);
  assert.equal(synergy.totalGain, .21);
});

test("conflict detector находит творческие и бюджетные противоречия", () => {
  const conflicts = new DecisionConflictDetector().detect(["luxury", "low_cost", "fast"]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].severity, "WARNING");
});

test("opportunity detector находит бесплатное улучшение", () => {
  const candidate = generator.generate(context)[0];
  const opportunities = new OpportunityDetector().detect(candidate, ["lighting", "contrast", "color_balance"]);
  assert.ok(opportunities.some(({ additionalCredits }) => additionalCredits === 0));
  assert.ok(opportunities.every((item) => Object.isFrozen(item)));
});

test("dynamic cost curve отсекает невыгодную marginal utility", () => {
  const curve = new DynamicCostCurve().analyze([{ credits: 0, quality: .5 }, { credits: 5, quality: .75 },
    { credits: 25, quality: .76 }], .01);
  assert.equal(curve.recommendedCredits, 5);
  assert.equal(curve.points[2].worthwhile, false);
});

test("diminishing returns обнаруживает слабый прирост после высокого качества", () => {
  const result = new DiminishingReturnsAnalyzer().analyze(.91, .2);
  assert.equal(result.diminishing, true);
  assert.ok(result.effectiveGain < .02);
});

test("provider independence показывает переносимость операций", () => {
  const result = new ProviderIndependenceAnalyzer().analyze(["lighting", "ai:background", "provider:special-style"]);
  assert.equal(result.score, 2 / 3);
  assert.deepEqual(result.restrictedOperations, ["provider:special-style"]);
});

test("decision story объясняет local-first и условную AI эскалацию", () => {
  const hybrid = generator.generate(context).find(({ mode }) => mode === "HYBRID")!;
  const story = new DecisionStoryBuilder().build(hybrid, .8);
  assert.match(story.userMessage, /Сначала бесплатно/);
  assert.match(story.userMessage, /Затем оценим/);
  assert.match(story.userMessage, /предложим AI/);
});

test("stability analyzer замечает резкую смену решения", () => {
  const candidates = generator.generate(context);
  const local = candidates.find(({ mode }) => mode === "LOCAL")!;
  const ai = candidates.find(({ mode }) => mode === "AI")!;
  const result = new DecisionStabilityAnalyzer().compare(local, ai);
  assert.equal(result.stable, false);
  assert.ok(result.changedOperations.length > 0);
});

test("diversity selector возвращает разные top candidates", () => {
  const profile = new AdaptiveStrategyProfiles().get("BALANCED");
  const scored = generator.generate(context).map((candidate) => new HeuristicDecisionScoringModel().evaluate(candidate, context, profile));
  const result = new DecisionDiversitySelector().select(scored, 5);
  assert.equal(result.selected.length, 5);
  assert.ok(result.averageDiversity > 0);
});

test("creative confidence возвращает band и interval", () => {
  const result = new CreativeConfidenceBands().classify(.83, .04);
  assert.equal(result.band, "HIGH");
  assert.ok(result.interval[0] < .83 && result.interval[1] > .83);
});

test("trace compression поддерживает verbose, compact и minimal", () => {
  const trace = { prompt: context.prompt, intent: context.intent, candidates: 32, selected: "HYBRID_2",
    explanation: "лучший баланс", confidence: .83, quality: .86, credits: 8 };
  const compressor = new DecisionTraceCompressor();
  assert.equal(compressor.compress(trace, "VERBOSE").lines.length, 8);
  assert.equal(compressor.compress(trace, "COMPACT").lines.length, 2);
  assert.equal(compressor.compress(trace, "MINIMAL").lines.length, 1);
});

test("counterfactual analysis объясняет почему режимы не выбраны", () => {
  const candidates = generator.generate(context); const selected = candidates.find(({ mode }) => mode === "HYBRID")!;
  const reasons = new DecisionCounterfactualAnalyzer().analyze({ selected, alternatives: candidates,
    localQualitySufficient: false, budget: 10 });
  assert.equal(reasons.length, 3);
  assert.match(reasons.find(({ mode }) => mode === "LOCAL")!.reason, /не достигает/);
  assert.equal(reasons.find(({ mode }) => mode === "HYBRID")!.selected, true);
});

test("preference reliability игнорирует слабые предпочтения", () => {
  const preferences = new PreferenceReliabilityAnalyzer().analyze([{ value: "luxury", confidence: .95, evidenceCount: 12 },
    { value: "cinema", confidence: .21, evidenceCount: 1 }]);
  assert.equal(preferences[0].usable, true);
  assert.equal(preferences[1].usable, false);
});

test("decision health объединяет stability, risk, explanation, cost, quality и history", () => {
  const health = new DecisionHealthAnalyzer().analyze({ stability: .9, risk: .1, explainability: .95,
    costEfficiency: .8, quality: .9, historyReliability: .85 });
  assert.equal(health.grade, "EXCELLENT");
  assert.ok(health.score >= .85);
});

test("training export формирует immutable ML-compatible feature/decision/outcome dataset", () => {
  const exported = new DecisionTrainingExporter(new DecisionFeatureExtractor()).export([record()]);
  assert.equal(exported[0].decision, "candidate-2");
  assert.equal(exported[0].outcome.accepted, true);
  assert.ok(exported[0].features.labels.includes("luxury"));
  assert.equal(Object.isFrozen(exported[0].outcome), true);
});

test("advanced layer не импортирует запрещённые подсистемы", async () => {
  const directory = `${process.cwd()}/src/platform/creative/decision/intelligence/`;
  const files = (await readdir(directory)).filter((file) => file.endsWith(".ts"));
  const forbidden = /(?:src\/application|platform\/(?:workflow|runtime|providers)|src\/lib|react|billing|memory|personalization|gateway)/i;
  for (const file of files) {
    const dependencies = readFileSync(`${directory}${file}`, "utf8").split("\n").filter((line) => /^\s*(?:import|export)\b/.test(line)).join("\n");
    assert.doesNotMatch(dependencies, forbidden, file);
  }
});
