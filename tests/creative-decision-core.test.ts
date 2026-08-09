import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import test from "node:test";
import {
  AdaptivePersonas, ConfidenceEstimator, ConstraintSolver, CreativeDecisionCore, DecisionEvolution, DecisionEvaluator,
  DecisionMemory, DecisionTournament, ExplainabilityTree, GoalDetector, MetaDecisionEngine, OnlineWeightAdapter,
  RiskAnalyzer, UncertaintyResolver, UtilityOptimizer, UtilityPairwiseComparison, WeightedUtilityFunction,
  type AdaptiveWeights, type CoreCandidate, type CoreDecisionContext, type DecisionConstraint, type DecisionEpisode,
} from "../src/platform/creative/decision/intelligence/core/index";

const makeIds = () => { let value = 0; return () => `id-${++value}`; };
const candidates: readonly CoreCandidate[] = Object.freeze([
  Object.freeze({ id: "local", mode: "LOCAL", operations: Object.freeze(["lighting", "color"]), expectedQuality: .82,
    estimatedCost: 0, estimatedLatencyMs: 300, risk: .05, creativity: .3, successProbability: .96, preferenceMatch: .8 }),
  Object.freeze({ id: "hybrid", mode: "HYBRID", operations: Object.freeze(["lighting", "ai:background"]), expectedQuality: .94,
    estimatedCost: 10, estimatedLatencyMs: 4_000, risk: .25, creativity: .7, successProbability: .88, preferenceMatch: .9 }),
  Object.freeze({ id: "ai", mode: "AI", operations: Object.freeze(["ai:regenerate"]), expectedQuality: .97,
    estimatedCost: 25, estimatedLatencyMs: 8_000, risk: .45, creativity: .95, successProbability: .72, preferenceMatch: .65 }),
]);
const context: CoreDecisionContext = Object.freeze({ userId: "user-a", tenantId: "tenant-a", projectId: "project-a",
  prompt: "Хочу чтобы фото товара выглядело дорого для каталога", availableOperations: Object.freeze(["lighting", "color", "ai:background"]),
  constraints: Object.freeze([{ id: "budget", kind: "BUDGET", operator: "LTE", value: 15, reason: "Лимит" }]) });
const dependencies = (createId = makeIds()) => ({ createId, now: () => 1_700_000_000_000,
  generateCandidates: () => candidates, extractFeatures: (prompt: string) => prompt.includes("дорого") ? ["luxury", "catalog"] : [] });

test("GoalDetector создаёт immutable goal hierarchy", () => {
  const goal = new GoalDetector({ createId: makeIds() }).detect(context.prompt);
  assert.equal(goal.primaryGoal.name, "Luxury Brand");
  assert.equal(goal.primaryGoal.priority, "HIGH");
  assert.equal(goal.primaryGoal.qualityTarget, .95);
  assert.equal(goal.primaryGoal.budgetFlexibility, "FLEXIBLE");
  assert.ok(goal.goals.some(({ category }) => category === "CATALOG"));
  assert.equal(Object.isFrozen(goal.goals), true);
});

test("ConstraintSolver строит граф и применяет budget/latency/AI ограничения", () => {
  const constraints: DecisionConstraint[] = [{ id: "budget", kind: "BUDGET", operator: "LTE", value: 15, reason: "Лимит" },
    { id: "latency", kind: "LATENCY", operator: "LTE", value: 5_000, reason: "Быстро" },
    { id: "ai", kind: "AI_AVAILABILITY", operator: "EQ", value: true, reason: "Доступно" },
    { id: "provider", kind: "PROVIDER_AVAILABILITY", operator: "EQ", value: true, reason: "Доступно" }];
  const solver = new ConstraintSolver(); const graph = solver.solve(constraints);
  assert.equal(graph.feasible, true);
  assert.deepEqual(graph.nodes.find(({ constraint }) => constraint.id === "provider")!.dependsOn, ["ai"]);
  assert.equal(solver.allows(candidates[1], graph), true);
  assert.equal(solver.allows(candidates[2], graph), false);
});

test("UtilityOptimizer максимизирует многокритериальную utility через внедряемую функцию", () => {
  const persona = new AdaptivePersonas().get("LUXURY"); const solver = new ConstraintSolver();
  const optimizer = new UtilityOptimizer(new WeightedUtilityFunction(), solver);
  const result = optimizer.optimize(candidates, solver.solve(context.constraints!), persona.weights);
  assert.equal(result.selected.id, "hybrid");
  assert.ok(result.scores.every(({ utility }) => utility >= 0 && utility <= 1));
});

test("DecisionMemory хранит immutable episodes с полной изоляцией", () => {
  const memory = new DecisionMemory(); const goal = new GoalDetector({ createId: makeIds() }).detect(context.prompt);
  const constraints = new ConstraintSolver().solve(context.constraints!);
  const episode: DecisionEpisode = { id: "episode", userId: context.userId, tenantId: context.tenantId, projectId: context.projectId,
    goal, constraints, candidates, selectedDecision: candidates[1], executionSummary: "ok", userReaction: "ACCEPTED",
    actualCost: 9, actualLatencyMs: 3_500, actualQuality: .93, createdAt: 100 };
  memory.remember(episode); const own = memory.history(context);
  assert.equal(own.length, 1); assert.equal(Object.isFrozen(own[0].candidates), true);
  assert.equal(memory.history({ userId: "other", tenantId: context.tenantId, projectId: context.projectId }).length, 0);
  assert.equal(memory.history({ userId: context.userId, tenantId: "other", projectId: context.projectId }).length, 0);
  assert.equal(memory.history({ userId: context.userId, tenantId: context.tenantId, projectId: "other" }).length, 0);
  assert.equal(memory.replay("episode", context)?.selectedDecision.id, "hybrid");
  assert.equal(memory.statistics(context).acceptanceRate, 1);
});

test("Bayesian Confidence учитывает историю, similarity, variance и preferences", () => {
  const estimator = new ConfidenceEstimator();
  const weak = estimator.estimate({ datasetSize: 1, historicalAcceptance: .5, similarity: .2, variance: .8, preferenceConfidence: .2 });
  const strong = estimator.estimate({ datasetSize: 100, historicalAcceptance: .92, similarity: .9, variance: .05, preferenceConfidence: .9 });
  assert.ok(strong.mean > weak.mean); assert.ok(strong.interval[1] - strong.interval[0] < weak.interval[1] - weak.interval[0]);
});

test("UncertaintyResolver выбирает ASK_USER при высокой неопределённости", () => {
  const confidence = new ConfidenceEstimator().estimate({ datasetSize: 0, historicalAcceptance: .2, similarity: 0, variance: 1, preferenceConfidence: .1 });
  const uncertainty = new UncertaintyResolver().resolve(confidence, { total: .8, level: "HIGH", risks: [], mitigations: [] }, .02);
  assert.equal(uncertainty.level, "HIGH"); assert.equal(uncertainty.recommendedAction, "ASK_USER");
});

test("RiskAnalyzer оценивает identity, copyright, provider, budget и large edit", () => {
  const risky = { ...candidates[2], operations: ["one", "two", "three", "four", "five", "six"] } as CoreCandidate;
  const result = new RiskAnalyzer().analyze(risky, ["identity", "copyright"], 10);
  assert.equal(result.level, "HIGH");
  assert.ok(result.risks.some(({ category }) => category === "IDENTITY"));
  assert.ok(result.risks.some(({ category }) => category === "BUDGET"));
  assert.ok(result.mitigations.length >= 4);
});

test("Adaptive Personas содержат отдельные utility weights", () => {
  const personas = new AdaptivePersonas();
  assert.equal(personas.select("LUXURY").name, "LUXURY");
  assert.ok(personas.get("ECONOMY").weights.cost > personas.get("LUXURY").weights.cost);
  assert.ok(personas.get("CREATIVE").weights.creativity > personas.get("CATALOG").weights.creativity);
});

test("OnlineWeightAdapter детерминированно адаптирует веса статистикой", () => {
  const initial: AdaptiveWeights = { persona: "PROFESSIONAL", weights: new AdaptivePersonas().get("PROFESSIONAL").weights, version: 1, sampleSize: 10 };
  const adapter = new OnlineWeightAdapter(); const evolution = adapter.adapt(initial, "ACCEPTED", { quality: 1 });
  assert.equal(evolution.after.version, 2); assert.equal(evolution.after.sampleSize, 11);
  assert.ok(evolution.after.weights.quality > initial.weights.quality);
  assert.equal(adapter.statistics(evolution.after, 8, 2).acceptanceRate, .8);
});

test("MetaDecisionEngine может пропустить AI и запросить пользователя", () => {
  const engine = new MetaDecisionEngine();
  const skip = engine.decide({ uncertainty: { score: .1, level: "LOW", reasons: [], recommendedAction: "LOCAL_FIRST" },
    risk: { total: .1, level: "LOW", risks: [], mitigations: [] }, estimatedCost: 10, budget: 15, localQualitySufficient: true });
  assert.equal(skip.action, "SKIP_AI");
  const ask = engine.decide({ uncertainty: { score: .8, level: "HIGH", reasons: [], recommendedAction: "ASK_USER" },
    risk: { total: .8, level: "HIGH", risks: [], mitigations: [] }, estimatedCost: 10, localQualitySufficient: false });
  assert.equal(ask.action, "ASK_USER");
});

test("DecisionEvaluator сравнивает predicted/actual и накапливает calibration", () => {
  const evaluator = new DecisionEvaluator(); const result = evaluator.evaluate("decision", { quality: .9, cost: 10, latencyMs: 4_000 }, { quality: .88, cost: 11, latencyMs: 4_200 });
  assert.ok(result.error.absoluteMean > 0); assert.equal(evaluator.statistics().evaluations, 1);
});

test("DecisionTournament выполняет pairwise ranking с детерминированным winner", () => {
  const solver = new ConstraintSolver(); const optimized = new UtilityOptimizer(new WeightedUtilityFunction(), solver)
    .optimize(candidates, solver.solve([]), new AdaptivePersonas().get("PROFESSIONAL").weights);
  const bracket = new DecisionTournament(new UtilityPairwiseComparison()).run(candidates, optimized.scores);
  assert.equal(bracket.winner.id, optimized.selected.id); assert.ok(bracket.rounds.length >= 2); assert.equal(Object.isFrozen(bracket.rounds), true);
});

test("CreativeDecisionCore facade формирует полный debug и explainability tree", () => {
  const core = new CreativeDecisionCore(dependencies());
  const learning: AdaptiveWeights = { persona: "LUXURY", weights: new AdaptivePersonas().get("LUXURY").weights, version: 1, sampleSize: 10 };
  const snapshot = core.debug(context, { datasetSize: 20, historicalAcceptance: .85, similarity: .9, variance: .1, preferenceConfidence: .8 }, learning, 8, 2);
  assert.equal(snapshot.goal.primaryGoal.name, "Luxury Brand"); assert.equal(snapshot.selectedDecision.id, "hybrid");
  assert.deepEqual(snapshot.extractedFeatures, ["luxury", "catalog"]); assert.equal(snapshot.learningStatistics.acceptanceRate, .8);
  const tree = core.explain(snapshot); const labels: string[] = []; let cursor = tree;
  while (cursor) { labels.push(cursor.label); cursor = cursor.children[0] as typeof tree; }
  assert.deepEqual(labels, ["Decision Intelligence", "Goal", "Constraints", "Features", "Candidates", "Pareto", "Utility", "Tournament", "Selected Decision", "Confidence", "Risk", "Expected Quality", "Expected Cost", "Expected Satisfaction"]);
});

test("DecisionEvolution хранит parent/generation и статистику", () => {
  const evolution = new DecisionEvolution({ now: () => 100 }); evolution.add("d1"); evolution.add("d2", "d1"); evolution.add("d3", "d2");
  assert.deepEqual(evolution.lineage("d3").map(({ decisionId }) => decisionId), ["d3", "d2", "d1"]);
  assert.deepEqual(evolution.statistics(), { decisions: 3, roots: 1, maximumGeneration: 2 });
});

test("ядро детерминировано и все внешние эффекты внедряются", () => {
  const first = new CreativeDecisionCore(dependencies(makeIds())).debug(context,
    { datasetSize: 10, historicalAcceptance: .8, similarity: .8, variance: .1, preferenceConfidence: .8 },
    { persona: "LUXURY", weights: new AdaptivePersonas().get("LUXURY").weights, version: 1, sampleSize: 10 });
  const second = new CreativeDecisionCore(dependencies(makeIds())).debug(context,
    { datasetSize: 10, historicalAcceptance: .8, similarity: .8, variance: .1, preferenceConfidence: .8 },
    { persona: "LUXURY", weights: new AdaptivePersonas().get("LUXURY").weights, version: 1, sampleSize: 10 });
  assert.deepEqual(first, second); assert.equal(Object.isFrozen(first.candidates), true);
});

test("core не импортирует запрещённые подсистемы", async () => {
  const directory = `${process.cwd()}/src/platform/creative/decision/intelligence/core/`;
  const files = (await readdir(directory)).filter((file) => file.endsWith(".ts"));
  const forbidden = /(?:src\/(?:application|lib)|platform\/(?:workflow|runtime|providers|memory|billing|gateway|agent|creative\/(?:editing|pipeline))|(?:^|\/)react(?:\/|$)|personalization)/i;
  for (const file of files) {
    const imports = readFileSync(`${directory}${file}`, "utf8").split("\n").filter((line) => /^\s*(?:import|export)\b/.test(line)).join("\n");
    assert.doesNotMatch(imports, forbidden, file);
  }
});
