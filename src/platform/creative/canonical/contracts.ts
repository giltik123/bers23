import type { CompiledWorkflow, ResourceBudget, Scope, WorkflowEngineDependencies, WorkflowOperation, WorkflowSnapshot } from '../workflow-engine';
import type { BillingTransactionAuthority } from '../authority';
import type { ProductionOperationAuthority } from '../authority';

/** The one public operation state model. Other status values are adapter concerns. */
export const CREATIVE_OPERATION_STATES = ['WAITING', 'READY', 'RUNNING', 'VERIFYING', 'SUCCESS', 'FAILED', 'RECOVERING', 'SKIPPED', 'UNKNOWN'] as const;
export type CreativeOperationState = typeof CREATIVE_OPERATION_STATES[number];
export const ARTIFACT_LIFECYCLE = ['CREATED', 'VALIDATED', 'AVAILABLE', 'CONSUMED', 'SUPERSEDED', 'FINAL', 'FAILED', 'QUARANTINED'] as const;
export type CreativeArtifactState = typeof ARTIFACT_LIFECYCLE[number];
export const CREATIVE_ARTIFACT_ROLES = ['ORIGINAL', 'WORKING', 'MASK', 'ROI_INPUT', 'PATCH', 'VERIFIED_PATCH', 'COMPOSITE', 'PREVIEW'] as const;
export type CreativeArtifactRole = typeof CREATIVE_ARTIFACT_ROLES[number];
export interface CanonicalImageMetadata { readonly width: number; readonly height: number; readonly format: string; readonly orientation: 1 | 3 | 6 | 8; readonly colorSpace?: string; readonly alpha?: boolean }
export type ExecutionTarget = 'LOCAL' | 'CLOUD' | 'HYBRID' | 'BLOCKED';
export type CreativePlanStatus = 'READY' | 'NEEDS_CONFIRMATION' | 'BLOCKED';
export type PlanningExecutionPolicy = 'LOCAL_ONLY' | 'CLOUD_ALLOWED' | 'CLOUD_PREFERRED' | 'AUTO';
export type PlanningTargetPreference = 'LOCAL' | 'CLOUD' | 'HYBRID';
export type PlanningConfirmationPolicy = 'AUTO' | 'REQUIRE_ON_UNCERTAINTY' | 'ALWAYS';

export interface CreativeRequest { readonly id: string; readonly intent: string; readonly scope: Scope; readonly inputArtifacts?: readonly CreativeArtifact[]; readonly budget?: Partial<ResourceBudget>; readonly metadata?: Readonly<Record<string, unknown>> }
export interface CreativeDecision { readonly requestId: string; readonly goal: string; readonly constraints: readonly string[] }
export interface CreativePlanArtifactSnapshot { readonly id: string; readonly kind: string; readonly role?: CreativeArtifactRole }
export interface CreativePlanningConstraints {
  readonly executionPolicy: PlanningExecutionPolicy;
  readonly preserveMode?: string;
  readonly mustPreserve: readonly string[];
  readonly mustChange: readonly string[];
  readonly forbiddenTargets: readonly PlanningTargetPreference[];
  readonly forbiddenRegions: readonly string[];
  readonly maxCredits?: number;
  readonly maxLatencyMs?: number;
  readonly minimumQuality?: number;
  readonly confirmationPolicy: PlanningConfirmationPolicy;
}
export interface CreativeCandidateScore {
  readonly quality: number;
  readonly costEfficiency: number;
  readonly latency: number;
  readonly reliability: number;
  readonly confidence: number;
  readonly total: number;
}
export interface CreativePlanCandidate {
  readonly id: string;
  readonly operations: readonly CreativeOperation[];
  readonly targetPreference: PlanningTargetPreference;
  readonly estimatedCredits: number;
  readonly estimatedLatencyMs: number;
  readonly expectedQuality: number;
  readonly score: CreativeCandidateScore;
  readonly reasons: readonly string[];
  readonly rejected: boolean;
  readonly rejectionReasons: readonly string[];
}
export interface CreativePlanUncertainty {
  readonly intent: number;
  readonly targetResolution: number;
  readonly feasibility: number;
  readonly preservationRisk: number;
  readonly aggregateConfidence: number;
}
export interface CreativeRejectedCandidateProvenance { readonly candidateId: string; readonly reasons: readonly string[] }
export interface CreativePlanProvenance {
  readonly plannerVersion: string;
  readonly decisionGoal: string;
  readonly inputArtifacts: readonly CreativePlanArtifactSnapshot[];
  readonly reasons: readonly string[];
  readonly selectedCandidateId?: string;
  readonly rejectedCandidates?: readonly CreativeRejectedCandidateProvenance[];
}
export interface CreativePlan {
  readonly requestId: string;
  readonly operations: readonly CreativeOperation[];
  readonly proposalId?: string;
  readonly plannerVersion?: string;
  readonly goal?: string;
  readonly assumptions?: readonly string[];
  readonly constraints?: readonly string[];
  readonly provenance?: CreativePlanProvenance;
  readonly status?: CreativePlanStatus;
  readonly planningConstraints?: CreativePlanningConstraints;
  readonly candidates?: readonly CreativePlanCandidate[];
  readonly selectedCandidateId?: string;
  readonly uncertainty?: CreativePlanUncertainty;
  readonly confirmationReasons?: readonly string[];
}
export interface CreativeExecutionPlan { readonly requestId: string; readonly operations: readonly CreativeOperation[]; readonly targets: Readonly<Record<string, ExecutionTarget>> }
export type CreativeOperation = WorkflowOperation;
export type CreativeWorkflow = CompiledWorkflow;
export interface CreativePipeline { readonly operationIds: readonly string[] }
export interface CreativeArtifact { readonly id: string; readonly kind: string; readonly value: unknown; readonly producerOperationId: string; readonly scope: Scope; readonly state: CreativeArtifactState; readonly role?: CreativeArtifactRole; readonly image?: CanonicalImageMetadata; readonly metadata?: Readonly<Record<string, unknown>> }
export interface VerificationResult { readonly valid: boolean; readonly checks: readonly string[]; readonly errors: readonly string[] }
export type RecoveryDecision = 'RETRY' | 'FALLBACK' | 'PARTIAL_REPLAN' | 'RESUME' | 'ABORT' | 'MARK_UNKNOWN';
export interface ProductionOutcome { readonly executionId: string; readonly status: 'SUCCESS' | 'FAILED' | 'UNKNOWN'; readonly workflow?: WorkflowSnapshot; readonly verification: VerificationResult; readonly artifacts: readonly CreativeArtifact[] }

export const CREATIVE_AUTHORITY = Object.freeze({
  facade: 'CANONICAL', workflowEngine: 'CANONICAL', productionRuntime: 'CANONICAL',
  aiExecutionManager: 'DEPRECATED', hybridExecutionEngine: 'DEPRECATED',
  genericWorkflow: 'ADAPTER', genericExecution: 'ADAPTER', verticalSlice: 'DELETE_AFTER_MIGRATION',
} as const);

export interface CanonicalDecisionPort { decide(request: CreativeRequest): Promise<CreativeDecision> }
export interface CanonicalPlanningPort { plan(request: CreativeRequest, decision: CreativeDecision): Promise<CreativePlan> }
export interface TargetSelectorPort { select(operation: CreativeOperation, request: CreativeRequest): ExecutionTarget }
export interface SecurityGatePort { authorize(request: CreativeRequest, operation: CreativeOperation, target: ExecutionTarget): boolean }
export interface ProductionRecoveryPort { decide(failure: Readonly<{ executionId: string; error: string }>): RecoveryDecision }
export interface TelemetryBillingBridgePort { record(outcome: ProductionOutcome): void | Promise<void> }
export interface CreativeExecutionPlatformDependencies extends WorkflowEngineDependencies { readonly decision: CanonicalDecisionPort; readonly planning: CanonicalPlanningPort; readonly targetSelector: TargetSelectorPort; readonly securityGate: SecurityGatePort; readonly recovery: ProductionRecoveryPort; readonly authority?: ProductionOperationAuthority; readonly billing?: BillingTransactionAuthority; readonly telemetry?: TelemetryBillingBridgePort; readonly now?: () => number; readonly id?: () => string }
