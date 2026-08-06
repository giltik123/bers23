export type EditMode = 'LOCAL' | 'AI';
export type EditOperationType =
  | 'brightness'
  | 'contrast'
  | 'color'
  | 'lighting'
  | 'sharpness'
  | 'background_improvement'
  | 'background_replacement'
  | 'object_removal'
  | 'portrait_retouch'
  | 'scene_generation'
  | 'style_transformation'
  | 'virtual_try_on';
export type EditDecision = 'preferred_free_editing' | 'declined_ai' | 'confirmed_ai' | 'needs_clarification';
export type EditStrategyId = 'LOCAL_ENHANCEMENT' | 'STUDIO_AI' | 'FULL_CREATIVE';
export type CreativeDecisionKind = 'LOCAL_SELECTED' | 'AI_REQUIRED' | 'AI_ESCALATED' | 'AI_SKIPPED';

export interface CreativeIntelligenceConfig {
  qualityThreshold: number;
  aiEscalationConfidence: number;
  maxOptionalCost: number;
}

export interface CreativeEditIntent {
  intent: string;
  goals: string[];
  requiresAI: boolean;
  reason: string;
  confidence: number;
}

export interface EditOperation {
  type: EditOperationType;
  mode: EditMode;
  label: string;
  credits: number;
  workflow?: string;
  reason: string;
}

export interface EditStrategy {
  id: EditStrategyId;
  name: string;
  mode: EditMode | 'MIXED';
  operations: EditOperation[];
  cost: number;
  confidence: number;
  reason: string;
}

export interface EditStrategyPlan {
  recommended: EditStrategyId;
  recommendedStrategy: EditStrategy;
  alternatives: EditStrategy[];
  confidence: number;
  reason: string;
}

export interface LocalCapabilityDecision {
  mode: EditMode;
  cost: number;
  credits: number;
  workflow?: string;
  estimatedCredits: number;
  reason: string;
}

export interface QualityEstimate {
  beforeQuality: number;
  afterQuality: number;
  confidence: number;
  recommendation: 'SKIP_AI' | 'ESCALATE_TO_AI';
}

export interface AIEscalationDecision {
  tryLocal: boolean;
  qualityThreshold: number;
  allowAI: boolean;
  escalateToAI: boolean;
  reason: string;
}

export interface AIExplainabilityContract {
  operation: string;
  whyAI: string;
  whyNotLocal: string;
  estimatedCost: number;
  expectedBenefit: string;
}

export interface PreviewOperation {
  name: string;
  source: EditMode;
  cost: number;
  explainability?: AIExplainabilityContract;
}

export interface PreviewDecision {
  operations: PreviewOperation[];
  freeOperations: string[];
  aiOperations: string[];
  totalCost: number;
  estimatedCredits: number;
  requiresConfirmation: boolean;
  beforeExecution: true;
}

export interface EditExplanation {
  reason: string;
  operations: string[];
  costExplanation: string;
  userMessage: string;
  aiExplainability: AIExplainabilityContract[];
}

export interface CreativeDecisionLogEntry {
  operation: string;
  decision: CreativeDecisionKind;
  reason: string;
  estimatedCost: number;
  confidence: number;
  createdAt: number;
}

export interface CreativeOperationGroup {
  name: string;
  operations: EditOperation[];
  undoLabel: string;
  credits: number;
}

export interface SmartCostSimulation {
  localOperations: number;
  aiOperations: number;
  estimatedCost: number;
  savedCredits: number;
  currentCost: number;
  potentialAICost: number;
}

export interface CreativeEditStack {
  baseAsset: string;
  operations: EditOperation[];
  currentVersion: string;
}

export interface CreativePreferenceSignal {
  signal: string;
  confidence: number;
  reason: string;
}

export interface CreativePreset {
  name: string;
  operations: EditOperation[];
  costEstimate: number;
}

export interface EditDecisionSignal {
  decision: EditDecision;
  confidenceDelta: number;
  reason: string;
}
