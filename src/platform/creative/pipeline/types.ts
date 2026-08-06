export type PipelineSource = 'LOCAL' | 'AI' | 'QUALITY_GATE';
export type PipelineOperation = 'segmentation' | 'color_correction' | 'lighting_adjustment' | 'background_replacement' | 'background_check' | 'virtual_try_on' | 'style_generation' | 'final_enhancement' | 'quality_check' | 'object_removal' | 'repair_area';
export type PipelineQualityDecision = 'CONTINUE' | 'SKIP_AI' | 'ESCALATE_AI';
export type PipelineDecisionKind = 'SELECT_LOCAL' | 'SELECT_AI' | 'SKIP_AI' | 'OPTIMIZE_COST' | 'ORDER_DEPENDENCY';

export interface CreativePipelineStep { operation: PipelineOperation; source: PipelineSource; reason: string; estimatedCost: number; dependsOn?: PipelineOperation[] }
export interface CreativePipeline { pipelineId: string; intent: string; steps: CreativePipelineStep[]; totalCost: number; confidence: number }
export interface PipelineOptimizationResult { originalCost: number; optimizedCost: number; savedCredits: number; changes: string[]; pipeline: CreativePipeline }
export interface OperationDependencyRule { operation: PipelineOperation; requires: PipelineOperation[] }
export interface PipelineQualityGateResult { stage: string; qualityScore: number; threshold: number; decision: PipelineQualityDecision }
export interface AIEscalationResult { selectedStage: string; selectedOperation?: PipelineOperation; reason: string; estimatedCost: number }
export interface PipelineVariantOption { name: string; source: PipelineSource; operations: PipelineOperation[]; cost: number; recommended: boolean }
export interface PipelineCostSimulation { options: PipelineVariantOption[]; recommended: string[]; totalCost: number }
export interface PipelineExplanation { userMessage: string; requiresConfirmation: boolean; aiCost: number; reasons: string[] }
export interface CreativePipelineTemplate { name: string; operations: PipelineOperation[] }
export interface PipelineDecisionLogEntry { decision: PipelineDecisionKind; reason: string; savedCredits: number; createdAt: number }
export interface PipelineExperimentPlan { variants: PipelineVariantOption[]; totalCost: number; reason: string }
export interface IntentConfidenceDecision { confidence: number; action: 'EXECUTE' | 'ASK_CLARIFICATION'; recommendedPipeline?: CreativePipeline; clarificationOptions: string[]; message: string }
export interface SandboxVersion { name: string; mode: 'LOCAL_ONLY' | 'LOCAL_PLUS_CHEAP_AI' | 'FULL_AI'; previewOnly: boolean; operations: PipelineOperation[]; estimatedFinalCost: number }
export interface CreativeSandboxPlan { originalImage: string; versions: SandboxVersion[]; finalGenerationRequiresConfirmation: boolean }
export interface CompressedPreviewOption { id: string; source: 'LOCAL_PREVIEW' | 'AI_FINAL'; operations: PipelineOperation[]; cost: number; selectedForFinalGeneration: boolean }
export interface AIPreviewCompressionPlan { localPreviewCount: number; aiCallsAvoided: number; finalAICalls: number; options: CompressedPreviewOption[]; savedCredits: number }
export interface CreativeDecisionMemorySignal { decision: string; value: string; confidence: number }
export interface CreativeDecisionMemorySuggestion { message: string; autoApply: boolean; confidence: number; signals: CreativeDecisionMemorySignal[] }
export interface CostIntelligenceRecommendation { option: string; quality: string; credits: number; saveCredits: number; recommended: boolean }
export interface CostIntelligenceReport { localOperations: string[]; aiOperations: { operation: string; credits: number }[]; recommendations: CostIntelligenceRecommendation[] }
export interface QualityPredictionInput { imageQuality: number; faceVisibility: number; maskComplexity: number; transformationComplexity: number }
export interface QualityPrediction { aiSuccessProbability: number; expectedQuality: 'Low' | 'Medium' | 'High'; recommendation: string }
export interface ComposedWorkflowStep { name: string; source: PipelineSource; operation: PipelineOperation; cost: number }
export interface CreativeWorkflowComposition { mode: 'AUTO' | 'PRO'; workflowName: string; steps: ComposedWorkflowStep[]; totalCost: number }
