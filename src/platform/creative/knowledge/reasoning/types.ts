import type {
  CreativeRule,
  KnowledgeEdge,
  KnowledgeNode,
  KnowledgeScope,
  ReasoningStep,
  RuleActivation,
} from '../types';

export interface ReasoningFact {
  readonly concept: string;
  readonly confidence: number;
  readonly source: 'input' | 'rule' | 'graph' | 'ontology' | 'history';
  readonly evidenceIds: readonly string[];
}

export interface ReasoningRequest {
  readonly scope: KnowledgeScope;
  readonly goal: string;
  readonly facts: readonly (string | ReasoningFact)[];
  readonly maxDepth?: number;
  readonly context?: Readonly<Record<string, unknown>>;
}

export interface EvidenceItem {
  readonly id: string;
  readonly kind: 'rule' | 'ontology' | 'graph' | 'fact' | 'history';
  readonly description: string;
  readonly confidence: number;
  readonly support: number;
  readonly sourceId?: string;
}

export interface EvidenceSet {
  readonly items: readonly EvidenceItem[];
  readonly confidence: number;
  readonly support: number;
  readonly conflicts: readonly (readonly [string, string])[];
}

export interface KnowledgeConfidenceInput {
  readonly ruleConfidence: number;
  readonly graphConfidence: number;
  readonly ontologyConfidence: number;
  readonly evidenceConfidence: number;
  readonly support: number;
  readonly conflicts: number;
  readonly coverage: number;
}

export interface KnowledgeConfidenceScore extends KnowledgeConfidenceInput {
  readonly value: number;
}

export interface InferenceAlternative {
  readonly concept: string;
  readonly confidence: number;
  readonly path: readonly string[];
}

export interface KnowledgeInference {
  readonly id: string;
  readonly scope: KnowledgeScope;
  readonly goal: string;
  readonly facts: readonly ReasoningFact[];
  readonly conclusions: readonly ReasoningFact[];
  readonly confidence: KnowledgeConfidenceScore;
  readonly evidence: EvidenceSet;
  readonly activatedRules: readonly RuleActivation[];
  readonly knowledgePath: readonly string[];
  readonly inferenceTree: readonly ReasoningStep[];
  readonly alternatives: readonly InferenceAlternative[];
  readonly createdAt: number;
}

export interface BackwardInference {
  readonly goal: string;
  readonly satisfied: boolean;
  readonly neededFacts: readonly string[];
  readonly evidence: EvidenceSet;
  readonly path: readonly string[];
  readonly confidence: number;
}

export interface ReasoningPlan {
  readonly id: string;
  readonly scope: KnowledgeScope;
  readonly goal: string;
  readonly neededKnowledge: readonly string[];
  readonly activatedRules: readonly string[];
  readonly inference: readonly string[];
  readonly recommendations: readonly string[];
  readonly steps: readonly { order: number; type: string; value: string }[];
  readonly createdAt: number;
}

export interface ContradictionCandidate {
  readonly id: string;
  readonly value: string;
  readonly confidence: number;
  readonly support: number;
  readonly priority: number;
}

export interface ContradictionResolution {
  readonly winner?: ContradictionCandidate;
  readonly losers: readonly ContradictionCandidate[];
  readonly reason: string;
  readonly confidence: number;
}

export interface CoverageResult {
  readonly known: readonly string[];
  readonly unknown: readonly string[];
  readonly missing: readonly string[];
  readonly conflicting: readonly string[];
  readonly weak: readonly string[];
  readonly value: number;
}

export interface KnowledgeGapPlan {
  readonly gaps: readonly { concept: string; need: string; priority: number }[];
  readonly complete: boolean;
}

export interface RankedKnowledge {
  readonly node: KnowledgeNode;
  readonly score: number;
  readonly signals: Readonly<{
    importance: number;
    confidence: number;
    support: number;
    specificity: number;
    novelty: number;
    utility: number;
  }>;
}

export interface KnowledgeSimulationResult {
  readonly expectedQuality: number;
  readonly expectedCost: number;
  readonly expectedRisk: number;
  readonly expectedCreativity: number;
  readonly confidence: number;
}

export interface KnowledgeExplanation {
  readonly goal: string;
  readonly knowledge: readonly string[];
  readonly rules: readonly string[];
  readonly evidence: readonly string[];
  readonly inference: readonly string[];
  readonly recommendations: readonly string[];
  readonly narrative: string;
}

export interface KnowledgeReasoningSnapshot {
  readonly id: string;
  readonly scope: KnowledgeScope;
  readonly facts: readonly ReasoningFact[];
  readonly rules: readonly CreativeRule[];
  readonly activatedRules: readonly RuleActivation[];
  readonly inferenceTree: readonly ReasoningStep[];
  readonly recommendations: readonly string[];
  readonly confidence: KnowledgeConfidenceScore;
  readonly coverage: CoverageResult;
  readonly contradictions: readonly ContradictionResolution[];
  readonly gaps: KnowledgeGapPlan;
  readonly createdAt: number;
}

export interface SemanticBridge {
  readonly from: string;
  readonly via: string;
  readonly to: string;
  readonly confidence: number;
}

export interface KnowledgeQueryResult {
  readonly nodes: readonly KnowledgeNode[];
  readonly edges: readonly KnowledgeEdge[];
  readonly rules: readonly CreativeRule[];
  readonly evidence: readonly EvidenceItem[];
  readonly reasoning: readonly ReasoningStep[];
  readonly recommendations: readonly string[];
}
