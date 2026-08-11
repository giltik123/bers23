import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import {
  AdaptiveCreativityLevel, CreativeGapAnalyzer, CreativeGoalHierarchy, CreativeHypothesisEngine,
  CreativeIntentSpace, CreativeMemoryCompression, CreativeMetaKnowledge, CreativeOpportunityDetectorV4,
  CreativePlanBuilder, CreativeUncertaintyMap, CreativeValuePredictor, CreativeWorldStateFactory,
  DecisionConfidenceDecomposer, DecisionConsistencyAnalyzer, DecisionDriftDetector, DecisionEvaluationBenchmark,
  DecisionEvolutionTreeV4, DecisionExperimentEngine, DecisionModelRegistry, DecisionQuestionGenerator,
  DecisionSelfReflection, DeterministicDecisionLatentSpace, HeuristicDecisionFeatureEncoder,
  HeuristicDecisionInferenceEngine, HeuristicDecisionModel, HeuristicDecisionTrainer,
  type CreativeDecisionSignal, type IntelligenceScope,
} from "../src/platform/creative/decision/intelligence/core/index";

const scope: IntelligenceScope = Object.freeze({ userId: "user-1", tenantId: "tenant-1", projectId: "project-1" });
const ids = () => { let value = 0; return () => `id-${++value}`; };
const dependencies = (createId = ids()) => ({ createId, now: () => 1_000 });
const observation = (value: string | number, confidence = 0.9) => Object.freeze({ value, confidence, source: "OBSERVATION" as const });

test("CreativeIntentSpace returns a distribution instead of one intent", () => {
  const distribution = new CreativeIntentSpace().analyze("Luxury premium catalog portrait for Instagram");
  assert.equal(distribution.length, 5);
  assert.equal(distribution[0].intent, "Luxury");
  assert.ok(distribution.filter(({ confidence }) => confidence > 0.3).length >= 4);
  assert.equal(Object.isFrozen(distribution), true);
});

test("intent analysis is multilingual and deterministic", () => {
  const space = new CreativeIntentSpace();
  assert.deepEqual(space.analyze("премиум каталог портрет"), space.analyze("премиум каталог портрет"));
});

test("goal hierarchy preserves business-to-operational causality", () => {
  const hierarchy = new CreativeGoalHierarchy(dependencies());
  const root = hierarchy.build([
    { goal: "Sell Product", level: "BUSINESS" }, { goal: "Increase Trust", level: "USER" },
    { goal: "Premium Look", level: "CREATIVE" }, { goal: "Luxury Lighting", level: "VISUAL" },
    { goal: "Warm Tone", level: "OPERATIONAL" },
  ]);
  assert.deepEqual(hierarchy.flatten(root).map(({ goal }) => goal), ["Sell Product", "Increase Trust", "Premium Look", "Luxury Lighting", "Warm Tone"]);
  assert.equal(Object.isFrozen(root.children), true);
});

test("world state uses injected ids and time and remains immutable", () => {
  const factory = new CreativeWorldStateFactory({ createId: () => "world-1", now: () => 42 });
  const state = factory.create(scope, { background: observation("good") });
  assert.deepEqual([state.id, state.createdAt], ["world-1", 42]);
  assert.equal(Object.isFrozen(state.attributes.background), true);
});

test("world state updates create a new version without mutation", () => {
  const factory = new CreativeWorldStateFactory(dependencies());
  const first = factory.create(scope, { lighting: observation("dark") });
  const second = factory.update(first, { lighting: observation("warm") });
  assert.equal(first.attributes.lighting?.value, "dark");
  assert.equal(second.attributes.lighting?.value, "warm");
  assert.notEqual(first.id, second.id);
});

test("gap analyzer compares current and desired world states", () => {
  const factory = new CreativeWorldStateFactory(dependencies());
  const current = factory.create(scope, { lighting: observation("flat"), background: observation("good") });
  const desired = factory.create(scope, { lighting: observation("luxury"), background: observation("good"), composition: observation("editorial") });
  assert.deepEqual(new CreativeGapAnalyzer().analyze(current, desired).map(({ attribute }) => attribute), ["composition", "lighting"]);
});

test("gap analyzer enforces tenant, project and user isolation", () => {
  const factory = new CreativeWorldStateFactory(dependencies());
  const current = factory.create(scope, {});
  const foreign = factory.create({ ...scope, tenantId: "other" }, { lighting: observation("warm") });
  assert.throws(() => new CreativeGapAnalyzer().analyze(current, foreign), /same scope/);
});

test("execution plan is hierarchical, ordered and includes validation and conditional AI", () => {
  const createId = ids(); const factory = new CreativeWorldStateFactory(dependencies(createId));
  const gaps = new CreativeGapAnalyzer().analyze(factory.create(scope, {}), factory.create(scope, { lighting: observation("warm"), composition: observation("strong") }));
  const plan = new CreativePlanBuilder(dependencies(createId)).build(scope, "sell", gaps);
  assert.deepEqual(plan.steps.slice(-3).map(({ kind }) => kind), ["QUALITY_CHECK", "CONDITION", "FINISH"]);
  assert.equal(plan.steps[1].dependsOn[0], plan.steps[0].id);
  assert.equal(Object.isFrozen(plan.steps), true);
});

test("hypothesis engine gives every gap confidence, probability and expected gain", () => {
  const factory = new CreativeWorldStateFactory(dependencies());
  const gaps = new CreativeGapAnalyzer().analyze(factory.create(scope, {}), factory.create(scope, { lighting: observation("warm"), quality: observation(0.9) }));
  const hypotheses = new CreativeHypothesisEngine(dependencies()).generate(gaps);
  assert.equal(hypotheses.length, 2);
  assert.ok(hypotheses.every(({ confidence, probability, expectedGain }) => confidence > 0 && probability > 0 && expectedGain > 0));
});

test("experiment engine creates at least A/B/C/D without AI", () => {
  const hypotheses = [{ id: "h", intervention: "lighting", consequence: "quality", confidence: 0.8, probability: 0.8, expectedGain: 0.2, evidence: [] }];
  const experiments = new DecisionExperimentEngine(dependencies()).design(hypotheses);
  assert.equal(experiments.length, 4);
  assert.deepEqual([...experiments].sort((a, b) => a.label.localeCompare(b.label)).map(({ label }) => label), ["A", "B", "C", "D"]);
});

test("opportunity detector finds free local fixes and avoids unnecessary AI", () => {
  const state = new CreativeWorldStateFactory(dependencies()).create(scope, {
    face: observation("dark"), colorBalance: observation("cold_skin"), background: observation("good"), noise: observation(0.8),
  });
  const opportunities = new CreativeOpportunityDetectorV4(dependencies()).detect(state);
  assert.equal(opportunities.length, 4);
  assert.ok(opportunities.every(({ local }) => local));
  assert.ok(opportunities.some(({ action }) => action === "preserve_background"));
});

test("confidence is a decomposed profile with aggregate and weakest dimension", () => {
  const profile = new DecisionConfidenceDecomposer().decompose({ technical: 0.9, creative: 0.8, goal: 0.7, economic: 0.2, historical: 0.6, preference: 0.5 });
  assert.equal(profile.weakest, "economic");
  assert.ok(profile.aggregate > 0.5 && profile.aggregate < 0.7);
});

test("uncertainty map explains exactly what is unknown", () => {
  const state = new CreativeWorldStateFactory(dependencies()).create(scope, { background: observation("good", 0.95), face: observation("visible", 0.5) });
  const map = new CreativeUncertaintyMap().build(state);
  assert.equal(map.length, 11);
  assert.equal(map.find(({ attribute }) => attribute === "background")?.level, "LOW");
  assert.equal(map.find(({ attribute }) => attribute === "style")?.level, "VERY_HIGH");
});

test("question generator derives questions from uncertainty", () => {
  const state = new CreativeWorldStateFactory(dependencies()).create(scope, {});
  const questions = new DecisionQuestionGenerator(dependencies()).generate(new CreativeUncertaintyMap().build(state), [{ intent: "Luxury", confidence: 0.8 }, { intent: "Catalog", confidence: 0.7 }]);
  assert.match(questions[0].text, /Luxury or Catalog/);
  assert.ok(questions.length >= 4);
});

test("memory compression aggregates decisions into scoped creative clusters", () => {
  const signals: CreativeDecisionSignal[] = Array.from({ length: 20 }, (_, index) => ({ id: `s${index}`, ...scope,
    intents: { Luxury: 0.9, Minimal: 0.1 }, operations: ["lighting"], quality: 0.8, accepted: index % 2 === 0, createdAt: index }));
  signals.push({ ...signals[0], id: "foreign", tenantId: "other" });
  const clusters = new CreativeMemoryCompression(dependencies()).compress(scope, signals);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].count, 20);
  assert.equal(clusters[0].acceptanceRate, 0.5);
});

test("drift detector notices long-term Luxury to Minimal change", () => {
  const signals: CreativeDecisionSignal[] = [
    ...Array.from({ length: 10 }, (_, index) => ({ id: `old-${index}`, ...scope, intents: { Luxury: 0.9 }, operations: [], quality: 0.8, accepted: true, createdAt: index })),
    ...Array.from({ length: 10 }, (_, index) => ({ id: `new-${index}`, ...scope, intents: { Minimal: 0.9 }, operations: [], quality: 0.8, accepted: true, createdAt: 100 + index })),
  ];
  const drift = new DecisionDriftDetector().detect(scope, signals, 50);
  assert.equal(drift.detected, true);
  assert.deepEqual([drift.from, drift.to], ["Luxury", "Minimal"]);
});

test("consistency analyzer detects economy-quality-variant conflicts", () => {
  const conflicts = new DecisionConsistencyAnalyzer().analyze([
    { id: "cost", objective: "COST", direction: "MINIMIZE", intensity: 1 },
    { id: "quality", objective: "QUALITY", direction: "MAXIMIZE", intensity: 1 },
    { id: "variants", objective: "VARIETY", direction: "MAXIMIZE", intensity: 1 },
  ]);
  assert.equal(conflicts.length, 2);
  assert.ok(conflicts.every(({ severity }) => severity === "BLOCKING"));
});

test("value predictor separates quality from contextual creative value", () => {
  const value = new CreativeValuePredictor().predict({ quality: 0.8, goalCompletion: 0.9, audienceFit: 0.9, economicFit: 0.8 }, ["Instagram", "Catalog", "Luxury"]);
  assert.ok(value.contexts.Luxury > value.contexts.Catalog);
  assert.ok(value.contexts.Catalog > value.contexts.Instagram);
});

test("adaptive creativity selects all five levels deterministically", () => {
  const selector = new AdaptiveCreativityLevel();
  const levels = [0, 0.25, 0.5, 0.75, 1].map((value) => selector.select({ riskTolerance: value, uncertainty: 0, experience: value, exploration: value }));
  assert.deepEqual(levels, ["CONSERVATIVE", "BALANCED", "CREATIVE", "EXPERIMENTAL", "WILD"]);
});

test("evolution tree records scoped idea lineage", () => {
  const tree = new DecisionEvolutionTreeV4(dependencies());
  const idea = tree.add(scope, "Idea", "idea"); const lighting = tree.add(scope, "Lighting", "lighting", idea.id);
  const contrast = tree.add(scope, "Contrast", "contrast", lighting.id); const finished = tree.add(scope, "Finished", "finish", contrast.id);
  assert.deepEqual(tree.lineage(finished.id, scope).map(({ operation }) => operation), ["idea", "lighting", "contrast", "finish"]);
  assert.equal(tree.lineage(finished.id, { ...scope, userId: "other" }).length, 0);
});

test("evolution tree rejects cross-scope parents", () => {
  const tree = new DecisionEvolutionTreeV4(dependencies()); const root = tree.add(scope, "Idea", "idea");
  assert.throws(() => tree.add({ ...scope, projectId: "other" }, "Child", "light", root.id));
});

test("meta knowledge forms and updates deterministic rule chains", () => {
  const knowledge = new CreativeMetaKnowledge();
  knowledge.learn({ id: "r1", antecedent: "Luxury", consequent: "warm lighting", confidence: 0.8, evidence: 2 });
  knowledge.learn({ id: "r2", antecedent: "warm lighting", consequent: "high contrast", confidence: 0.9, evidence: 2 });
  knowledge.learn({ id: "update", antecedent: "Luxury", consequent: "warm lighting", confidence: 1, evidence: 2 });
  assert.deepEqual(knowledge.infer("Luxury").map(({ consequent }) => consequent), ["warm lighting", "high contrast"]);
  assert.equal(knowledge.infer("Luxury")[0].confidence, 0.9);
});

test("self reflection identifies weak, cheaper, faster and unexpected aspects", () => {
  const reflection = new DecisionSelfReflection().reflect({ selected: { id: "selected", quality: 0.8, cost: 8, latency: 900 },
    alternatives: [{ id: "local", quality: 0.7, cost: 0, latency: 100 }], predictionError: 0.3, unexpected: ["background already good"] });
  assert.equal(reflection.weakestPoint, "PREDICTION_ACCURACY");
  assert.equal(reflection.cheaperAlternative, "local");
  assert.equal(reflection.fasterAlternative, "local");
});

const makeStateAndGoal = () => {
  const state = new CreativeWorldStateFactory(dependencies()).create(scope, { lighting: observation("flat", 0.8), quality: observation(0.6, 0.9) });
  const goal = new CreativeGoalHierarchy(dependencies()).build([{ goal: "Sell", level: "BUSINESS" }]);
  return { state, goal };
};

test("feature encoder converts world state, goals and context into stable numeric features", () => {
  const { state, goal } = makeStateAndGoal(); const encoder = new HeuristicDecisionFeatureEncoder();
  const first = encoder.encode(state, [goal], { budget: 0.5 }); const second = encoder.encode(state, [goal], { budget: 0.5 });
  assert.deepEqual(first, second);
  assert.equal(first.names.length, first.values.length);
  assert.ok(first.values.every((value) => value >= 0 && value <= 1));
});

test("latent space projects deterministically and measures similarity", () => {
  const { state, goal } = makeStateAndGoal(); const encoded = new HeuristicDecisionFeatureEncoder().encode(state, [goal], {});
  const latent = new DeterministicDecisionLatentSpace(); const vector = latent.project(encoded);
  assert.equal(vector.dimensions.length, 8);
  assert.equal(latent.similarity(vector, vector), 1);
});

test("heuristic inference is compatible with existing DecisionModel", () => {
  const { state, goal } = makeStateAndGoal(); const features = new HeuristicDecisionFeatureEncoder().encode(state, [goal], {});
  const result = new HeuristicDecisionInferenceEngine(new HeuristicDecisionModel()).infer({ scope, features,
    candidates: [{ id: "low", features: { quality: 0.4 } }, { id: "high", features: { quality: 0.9 } }] });
  assert.equal(result.selected.id, "high");
  assert.match(result.explanation[0], /heuristic-1.0/);
});

test("trainer creates injected, compatible and immutable checkpoints", () => {
  const model = new HeuristicDecisionModel();
  const checkpoint = new HeuristicDecisionTrainer({ createId: () => "checkpoint", now: () => 77 }).train(model, []);
  assert.equal(checkpoint.id, "checkpoint");
  assert.equal(checkpoint.createdAt, 77);
  assert.deepEqual(checkpoint.compatibleModelVersions, [model.version()]);
  assert.equal(Object.isFrozen(checkpoint), true);
});

test("benchmark compares models against deterministic expected winners", () => {
  const result = new DecisionEvaluationBenchmark().evaluate(new HeuristicDecisionModel(), [{ id: "quality",
    candidates: [{ id: "low", features: { quality: 0.4 } }, { id: "high", features: { quality: 0.9 } }], expectedWinnerId: "high", minimumScore: 0.8 }]);
  assert.deepEqual({ passed: result.passed, accuracy: result.accuracy }, { passed: 1, accuracy: 1 });
});

test("model registry registers and switches implementations behind one contract", () => {
  const registry = new DecisionModelRegistry(); registry.register("current", new HeuristicDecisionModel("heuristic-current"));
  registry.register("candidate", new HeuristicDecisionModel("heuristic-candidate"));
  assert.equal(registry.active().version(), "heuristic-current");
  assert.equal(registry.activate("candidate").version(), "heuristic-candidate");
  assert.deepEqual(registry.list().map(({ id, active }) => [id, active]), [["candidate", true], ["current", false]]);
  assert.equal(Object.isFrozen(registry.list()), true);
});

test("model registry rejects unknown models and incompatible checkpoints", () => {
  const registry = new DecisionModelRegistry(); registry.register("current", new HeuristicDecisionModel("v1"));
  assert.throws(() => registry.activate("missing"));
  assert.throws(() => registry.activate("current", { id: "c", modelId: "other", version: "c1", featureVersion: "f1", createdAt: 0,
    sampleCount: 0, compatibleModelVersions: ["v2"], metadata: {} }));
});

test("new core modules contain no forbidden imports", () => {
  const directory = `${process.cwd()}/src/platform/creative/decision/intelligence/core/`;
  const forbidden = /from\s+["'][^"']*(workflow|runtime|provider|billing|gateway|memory\/|application|editing|pipeline|experience|organization)/i;
  readdirSync(directory).filter((file) => file.endsWith(".ts")).forEach((file) => assert.doesNotMatch(readFileSync(`${directory}${file}`, "utf8"), forbidden, file));
});

for (let index = 0; index < 20; index += 1) test(`repeatability matrix ${index + 1}`, () => {
  const prompt = index % 2 ? "Luxury Catalog" : "Minimal Instagram Portrait";
  const first = new CreativeIntentSpace().analyze(prompt); const second = new CreativeIntentSpace().analyze(prompt);
  assert.deepEqual(first, second); assert.equal(Object.isFrozen(first), true);
});
