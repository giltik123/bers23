import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import test from "node:test";
import {
  DecisionAnalytics,
  DecisionCandidateGenerator,
  DecisionCostSimulator,
  DecisionDebugger,
  DecisionExperienceStore,
  DecisionExplanationEngine,
  DecisionLearningSignalCollector,
  DecisionQualityPredictor,
  DecisionRankingEngine,
  DecisionScoreModel,
  type DecisionExperience,
  type DecisionIntelligenceContext,
} from "../src/platform/creative/decision/intelligence/index";

let sequence = 0;
const ids = { createId: () => `id-${++sequence}` };
const dependencies = { ...ids, now: () => 1_700_000_000_000 };
const context: DecisionIntelligenceContext = Object.freeze({
  userId: "user-a", tenantId: "tenant-a", projectId: "project-a",
  prompt: "Сделай фото одежды для каталога", intent: "catalog_photo",
  availableOperations: Object.freeze(["brightness", "color_correction", "ai:virtual_try_on", "ai:background_generation"]),
  preferredOperations: Object.freeze(["color_correction"]), availableCredits: 20,
  currentQuality: 0.5, minimumQuality: 0.75,
});

test("генерирует immutable LOCAL, HYBRID и AI кандидатов", () => {
  const candidates = new DecisionCandidateGenerator(ids).generate(context);
  assert.deepEqual(candidates.map(({ mode }) => mode), ["LOCAL", "HYBRID", "AI"]);
  assert.equal(candidates[0].estimatedCredits, 0);
  assert.equal(Object.isFrozen(candidates), true);
  assert.equal(Object.isFrozen(candidates[1].operations), true);
  assert.throws(() => (candidates as unknown[]).push({}));
});

test("score model нормализует все оценки в диапазон 0..1", () => {
  const candidate = new DecisionCandidateGenerator(ids).generate(context)[0];
  const score = new DecisionScoreModel().score(candidate, context);
  for (const value of Object.values(score)) assert.ok(value >= 0 && value <= 1);
  assert.equal(Object.isFrozen(score), true);
});

test("ranking выбирает лучший кандидат и объясняет выбор", () => {
  const candidates = new DecisionCandidateGenerator(ids).generate(context);
  const ranking = new DecisionRankingEngine(new DecisionScoreModel()).rank(candidates, context);
  assert.ok(ranking.score >= 0 && ranking.score <= 1);
  assert.ok(ranking.confidence >= 0.6);
  assert.match(ranking.explanation, /баланс качества, стоимости/);
  assert.equal(ranking.candidates.length, 3);
});

test("quality predictor предлагает escalation при недостаточном local результате", () => {
  const local = new DecisionCandidateGenerator(ids).generate(context)[0];
  const prediction = new DecisionQualityPredictor().predict(local, { ...context, currentQuality: 0.4, minimumQuality: 0.8 });
  assert.equal(prediction.shouldEscalate, true);
  assert.match(prediction.reason, /недостаточно/);
});

test("cost simulator показывает исходную, оптимизированную стоимость и экономию", () => {
  const hybrid = new DecisionCandidateGenerator(ids).generate(context)[1];
  const cost = new DecisionCostSimulator().simulate(hybrid, 40);
  assert.deepEqual({ original: cost.originalCost, optimized: cost.optimizedCost, saved: cost.savedCredits },
    { original: 40, optimized: 5, saved: 35 });
  assert.deepEqual(cost.requiredAI, ["ai:virtual_try_on"]);
});

test("explanation сообщает причину AI, качество и экономию", () => {
  const hybrid = new DecisionCandidateGenerator(ids).generate(context)[1];
  const quality = new DecisionQualityPredictor().predict(hybrid, context);
  const cost = new DecisionCostSimulator().simulate(hybrid);
  const explanation = new DecisionExplanationEngine().explain(hybrid, quality, cost);
  assert.match(explanation.summary, /HYBRID/);
  assert.match(explanation.summary, /Экономия/);
  assert.match(explanation.reasons.join(" "), /Локальные инструменты/);
});

test("experience store возвращает immutable записи", () => {
  const store = new DecisionExperienceStore();
  const chosenCandidate = new DecisionCandidateGenerator(ids).generate(context)[0];
  store.add({ id: "experience-1", decisionId: "decision-1", context, chosenCandidate,
    result: "success", accepted: true, rejected: false, savedCredits: 20, executionTimeMs: 25, createdAt: dependencies.now() });
  const records = store.list(context);
  assert.equal(records.length, 1);
  assert.equal(Object.isFrozen(records), true);
  assert.equal(Object.isFrozen(records[0].context), true);
  assert.throws(() => (records as unknown[]).push({}));
});

test("learning signals накапливаются без запуска обучения", () => {
  const collector = new DecisionLearningSignalCollector(dependencies);
  collector.record({ decisionId: "decision-1", userId: context.userId, tenantId: context.tenantId,
    projectId: context.projectId, type: "ACCEPTED" });
  collector.record({ decisionId: "decision-1", userId: context.userId, tenantId: context.tenantId,
    projectId: context.projectId, type: "UNDO" });
  assert.deepEqual(collector.list("decision-1", context.userId, context.tenantId, context.projectId).map(({ type }) => type), ["ACCEPTED", "UNDO"]);
});

test("analytics агрегирует режимы, score, экономию, acceptance и undo", () => {
  const candidates = new DecisionCandidateGenerator(ids).generate(context);
  const experience = (candidateIndex: number, accepted: boolean): DecisionExperience => ({
    id: `experience-${candidateIndex}`, decisionId: `decision-${candidateIndex}`, context,
    chosenCandidate: candidates[candidateIndex], accepted, rejected: !accepted,
    savedCredits: candidateIndex === 0 ? 20 : 15, executionTimeMs: 10, createdAt: dependencies.now(),
  });
  const signal = { id: "signal-1", decisionId: "decision-1", userId: context.userId,
    tenantId: context.tenantId, projectId: context.projectId, type: "UNDO" as const, createdAt: dependencies.now() };
  const result = new DecisionAnalytics().calculate([experience(0, true), experience(1, false)], [signal], [0.8, 0.6]);
  assert.deepEqual({ local: result.localUsage, hybrid: result.hybridUsage, ai: result.aiUsage }, { local: 1, hybrid: 1, ai: 0 });
  assert.equal(result.averageScore, 0.7);
  assert.equal(result.averageSavedCredits, 17.5);
  assert.equal(result.acceptanceRate, 0.5);
  assert.equal(result.undoRate, 0.5);
});

test("debugger формирует полную immutable цепочку решения", () => {
  const candidates = new DecisionCandidateGenerator(ids).generate(context);
  const ranking = new DecisionRankingEngine(new DecisionScoreModel()).rank(candidates, context);
  const quality = new DecisionQualityPredictor().predict(ranking.bestCandidate, context);
  const cost = new DecisionCostSimulator().simulate(ranking.bestCandidate);
  const explanation = new DecisionExplanationEngine().explain(ranking.bestCandidate, quality, cost);
  const snapshot = new DecisionDebugger().snapshot({ prompt: context.prompt, intent: context.intent, candidates,
    ranking, selectedDecision: ranking.bestCandidate, expectedQuality: quality, expectedCost: cost,
    explanation, learningSignals: [] });
  assert.equal(snapshot.prompt, context.prompt);
  assert.equal(snapshot.selectedDecision.id, ranking.bestCandidate.id);
  assert.equal(Object.isFrozen(snapshot.ranking.candidates), true);
});

test("store обеспечивает tenant и project isolation", () => {
  const store = new DecisionExperienceStore();
  const candidate = new DecisionCandidateGenerator(ids).generate(context)[0];
  store.add({ id: "private", decisionId: "decision-private", context, chosenCandidate: candidate,
    accepted: true, rejected: false, savedCredits: 20, executionTimeMs: 1, createdAt: dependencies.now() });
  assert.equal(store.list({ userId: "user-a", tenantId: "tenant-b", projectId: "project-a" }).length, 0);
  assert.equal(store.list({ userId: "user-a", tenantId: "tenant-a", projectId: "project-b" }).length, 0);
  assert.equal(store.list({ userId: "user-b", tenantId: "tenant-a", projectId: "project-a" }).length, 0);
});

test("intelligence layer не содержит запрещённых импортов", async () => {
  const directory = `${process.cwd()}/src/platform/creative/decision/intelligence/`;
  const files = (await readdir(directory)).filter((file) => file.endsWith(".ts"));
  const forbidden = /(?:src\/application|platform\/(?:workflow|runtime|providers|creative\/(?:editing|pipeline))|src\/lib|react|billing|memory|gateway)/i;
  for (const file of files) {
    const dependenciesOnly = readFileSync(`${directory}${file}`, "utf8").split("\n")
      .filter((line) => /^\s*(?:import|export)\b/.test(line)).join("\n");
    assert.doesNotMatch(dependenciesOnly, forbidden, file);
  }
});
