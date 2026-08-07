export interface KnowledgeScope { tenantId: string; projectId: string; userId: string }
export interface KnowledgeNode {
  id: string; scope: KnowledgeScope; concept: string; category: string; tags: readonly string[];
  confidence: number; importance: number; support: number; evidenceCount: number; createdAt: number; updatedAt: number;
  generation?: number; parent?: string; children?: readonly string[]; history?: readonly KnowledgeVersion[];
  mergedFrom?: readonly string[]; deprecated?: boolean; active?: boolean;
}
export interface KnowledgeEdge { source: string; target: string; relation: string; weight: number; confidence: number; support: number }
export interface KnowledgeVersion { generation: number; concept: string; timestamp: number; parent?: string }
export interface CompositionRule { id: string; name: string; importance: number; confidence: number; recommendedGoals: readonly string[]; conflictingGoals: readonly string[]; relatedOperations: readonly string[] }
export interface LightingEntry { id: string; name: string; visualEffects: readonly string[]; emotionalEffects: readonly string[]; recommendedDomains: readonly string[]; cost: number; aiNecessary: boolean }
export interface ColorEntry { id: string; name: string; kind: 'harmony' | 'psychology'; effects: readonly string[]; related: readonly string[] }
export interface MaterialEntry { id: string; name: string; lightingPreferences: readonly string[]; editingSensitivity: number; reflectionBehavior: string; texturePreservation: number }
export interface RuleCondition { field: string; operator?: 'equals' | 'includes' | 'exists'; value: unknown }
export interface CreativeRule { id: string; scope?: KnowledgeScope; conditions: readonly RuleCondition[]; recommendations: readonly string[]; priority: number; confidence: number; support: number; active: boolean; conflicts: readonly string[] }
export interface RuleActivation { ruleId: string; recommendations: readonly string[]; priority: number; confidence: number; because: string }
export interface ReasoningStep { from: string; to: string; relation: string; because: string; therefore: string; recommended: boolean; confidence: number }
export interface ReasoningResult { start: string; chain: readonly ReasoningStep[]; recommended: readonly string[]; confidence: number }
export interface ValidationIssue { type: 'duplicate-concept' | 'cycle' | 'invalid-ontology' | 'conflicting-rule' | 'broken-reference' | 'unreachable-node'; message: string; ids: readonly string[] }
export interface ImportanceSignals { support: number; usage: number; novelty: number; frequency: number; impact: number; confidence: number }
export interface ImportanceScore extends ImportanceSignals { importance: number }
export interface KnowledgeDependencies { id: () => string; now: () => number; random?: () => number }
export interface SearchResult { node: KnowledgeNode; score: number; path: readonly string[] }
export interface KnowledgeDebugSnapshot { prompt: string; intent: string; knowledgeSearch: string; retrievedConcepts: readonly string[]; appliedRules: readonly string[]; reasoningChain: readonly ReasoningStep[]; recommendedConcepts: readonly string[]; knowledgeConfidence: number; knowledgeCoverage: number; finalKnowledgeGraph: { nodes: readonly KnowledgeNode[]; edges: readonly KnowledgeEdge[] } }
