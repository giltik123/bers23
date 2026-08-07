import type { CreativeKnowledgeSystem } from '../CreativeKnowledgeSystem';
import { clamp, deepFreeze, normalize } from '../immutable';
import type { KnowledgeDependencies, KnowledgeEdge, RuleActivation, SearchResult } from '../types';
import { EvidenceAccumulator } from './EvidenceAccumulator';
import { KnowledgeConfidence } from './KnowledgeConfidence';
import type {
  BackwardInference,
  EvidenceItem,
  KnowledgeInference,
  ReasoningFact,
  ReasoningRequest,
} from './types';

const fact = (value: string | ReasoningFact): ReasoningFact => typeof value === 'string'
  ? deepFreeze({ concept: value, confidence: 1, source: 'input' as const, evidenceIds: [] })
  : deepFreeze({ ...value, evidenceIds: [...value.evidenceIds] }) as ReasoningFact;

export class KnowledgeInferenceEngine {
  private readonly accumulator = new EvidenceAccumulator();
  private readonly confidenceModel = new KnowledgeConfidence();

  constructor(
    private readonly knowledge: CreativeKnowledgeSystem,
    private readonly dependencies: KnowledgeDependencies,
  ) {}

  forward(request: ReasoningRequest): KnowledgeInference {
    const maxDepth = Math.max(1, Math.floor(request.maxDepth ?? 5));
    const known = new Map(request.facts.map((value) => {
      const item = fact(value);
      return [normalize(item.concept), item];
    }));
    const conclusions: ReasoningFact[] = [];
    const activatedRules: RuleActivation[] = [];
    const inferenceTree: KnowledgeInference['inferenceTree'][number][] = [];
    const path: string[] = [...known.values()].map((item) => item.concept);
    const evidence: EvidenceItem[] = [...known.values()].map((item, index) => ({
      id: `fact:${index}:${normalize(item.concept)}`,
      kind: 'fact',
      description: item.concept,
      confidence: item.confidence,
      support: 1,
    }));
    let frontier = [...known.values()].map((item) => item.concept);

    for (let depth = 0; depth < maxDepth && frontier.length > 0; depth += 1) {
      const next: string[] = [];
      const context = {
        ...(request.context ?? {}),
        goal: request.goal,
        facts: [...known.values()].map((item) => item.concept),
      };
      for (const activation of this.knowledge.rules().activate(context)) {
        if (!activatedRules.some((item) => item.ruleId === activation.ruleId)) activatedRules.push(activation);
        for (const recommendation of activation.recommendations) {
          if (known.has(normalize(recommendation))) continue;
          const derived = deepFreeze({
            concept: recommendation,
            confidence: activation.confidence,
            source: 'rule' as const,
            evidenceIds: [`rule:${activation.ruleId}`],
          });
          known.set(normalize(recommendation), derived);
          conclusions.push(derived);
          next.push(recommendation);
          path.push(recommendation);
          evidence.push({ id: `rule:${activation.ruleId}`, kind: 'rule', description: activation.because, confidence: activation.confidence, support: 1, sourceId: activation.ruleId });
        }
      }

      for (const concept of frontier.slice().sort()) {
        const source = this.knowledge.graph().findConcept(concept, request.scope);
        if (!source) continue;
        const outgoing = this.knowledge.graph().edges(request.scope)
          .filter((edge) => edge.source === source.id && edge.relation !== 'contradicts')
          .sort((a, b) => b.weight * b.confidence - a.weight * a.confidence || a.target.localeCompare(b.target));
        for (const edge of outgoing) {
          const target = this.knowledge.graph().nodes(request.scope).find((node) => node.id === edge.target);
          if (!target || known.has(normalize(target.concept))) continue;
          const sourceConfidence = known.get(normalize(concept))?.confidence ?? source.confidence;
          const derived = deepFreeze({
            concept: target.concept,
            confidence: clamp(sourceConfidence * edge.confidence),
            source: 'graph' as const,
            evidenceIds: [`edge:${edge.source}:${edge.target}:${edge.relation}`],
          });
          known.set(normalize(target.concept), derived);
          conclusions.push(derived);
          next.push(target.concept);
          path.push(target.concept);
          inferenceTree.push({
            from: concept,
            to: target.concept,
            relation: edge.relation,
            because: `${concept} ${edge.relation} ${target.concept}`,
            therefore: `infer ${target.concept}`,
            recommended: edge.relation === 'recommends' || edge.relation === 'leads-to',
            confidence: edge.confidence,
          });
          evidence.push(this.edgeEvidence(edge));
        }
      }
      frontier = [...new Set(next)].sort();
    }

    const evidenceSet = this.accumulator.accumulate([evidence]);
    const graphConfidence = inferenceTree.length === 0
      ? 0
      : inferenceTree.reduce((sum, step) => sum + step.confidence, 0) / inferenceTree.length;
    const ruleConfidence = activatedRules.length === 0
      ? 0
      : activatedRules.reduce((sum, rule) => sum + rule.confidence, 0) / activatedRules.length;
    const goalKnown = known.has(normalize(request.goal));
    const confidence = this.confidenceModel.calculate({
      ruleConfidence,
      graphConfidence,
      ontologyConfidence: this.knowledge.ontology().concepts().length > 0 ? 0.8 : 0,
      evidenceConfidence: evidenceSet.confidence,
      support: clamp(evidenceSet.support / 10),
      conflicts: evidenceSet.conflicts.length,
      coverage: goalKnown ? 1 : clamp(conclusions.length / Math.max(1, maxDepth)),
    });
    const alternatives = this.alternatives(request, path);
    return deepFreeze({
      id: this.dependencies.id(),
      scope: { ...request.scope },
      goal: request.goal,
      facts: [...known.values()].filter((item) => item.source === 'input'),
      conclusions,
      confidence,
      evidence: evidenceSet,
      activatedRules,
      knowledgePath: [...new Set(path)],
      inferenceTree,
      alternatives,
      createdAt: this.dependencies.now(),
    });
  }

  backward(request: ReasoningRequest): BackwardInference {
    const supplied = new Set(request.facts.map((item) => normalize(fact(item).concept)));
    if (supplied.has(normalize(request.goal))) {
      const item: EvidenceItem = { id: `fact:${normalize(request.goal)}`, kind: 'fact', description: request.goal, confidence: 1, support: 1 };
      return deepFreeze({ goal: request.goal, satisfied: true, neededFacts: [], evidence: this.accumulator.accumulate([[item]]), path: [request.goal], confidence: 1 });
    }
    const goalNode = this.knowledge.graph().findConcept(request.goal, request.scope);
    const queue: Array<[string, string[]]> = goalNode ? [[goalNode.id, [goalNode.id]]] : [];
    const visited = new Set<string>();
    let resolvedPath: string[] = [];
    while (queue.length > 0) {
      const [current, currentPath] = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      const node = this.knowledge.graph().nodes(request.scope).find((candidate) => candidate.id === current);
      if (node && supplied.has(normalize(node.concept))) {
        resolvedPath = [...currentPath].reverse();
        break;
      }
      for (const edge of this.knowledge.graph().edges(request.scope).filter((item) => item.target === current)) {
        queue.push([edge.source, [...currentPath, edge.source]]);
      }
    }
    const concepts = resolvedPath.map((id) => this.knowledge.graph().nodes(request.scope).find((node) => node.id === id)!.concept);
    const neededFacts = concepts.length > 0 ? [] : this.requiredRuleFacts(request.goal, supplied);
    const evidence = concepts.map((concept, index): EvidenceItem => ({ id: `backward:${index}:${normalize(concept)}`, kind: 'graph', description: concept, confidence: 0.9, support: 1 }));
    return deepFreeze({
      goal: request.goal,
      satisfied: concepts.length > 0,
      neededFacts,
      evidence: this.accumulator.accumulate([evidence]),
      path: concepts,
      confidence: concepts.length > 0 ? clamp(1 - (concepts.length - 1) * 0.08) : 0,
    });
  }

  infer(request: ReasoningRequest): KnowledgeInference {
    return this.forward(request);
  }

  private requiredRuleFacts(goal: string, supplied: ReadonlySet<string>): string[] {
    const result = new Set<string>();
    for (const rule of this.knowledge.rules().rules()) {
      if (!rule.recommendations.some((item) => normalize(item) === normalize(goal))) continue;
      for (const condition of rule.conditions) {
        const value = String(condition.value);
        if (!supplied.has(normalize(value))) result.add(value);
      }
    }
    return [...result].sort();
  }

  private edgeEvidence(edge: KnowledgeEdge): EvidenceItem {
    return {
      id: `edge:${edge.source}:${edge.target}:${edge.relation}`,
      kind: 'graph',
      description: edge.relation,
      confidence: edge.confidence,
      support: edge.support,
      sourceId: edge.source,
    };
  }

  private alternatives(request: ReasoningRequest, selectedPath: readonly string[]) {
    const start = request.facts.length > 0 ? fact(request.facts[0]).concept : request.goal;
    return (this.knowledge.search({ concept: start, scope: request.scope, limit: 5 }) as readonly SearchResult[])
      .filter((result) => !selectedPath.includes(result.node.concept))
      .map((result) => ({ concept: result.node.concept, confidence: clamp(result.score * result.node.confidence), path: result.path }));
  }
}
