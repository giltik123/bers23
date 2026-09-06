import type {
  CreativeOperation,
  CreativeRequest,
  ExecutionCapabilityPort,
} from '../../../src/platform/creative/canonical/contracts.ts';
import type {
  LocalExecutionExecutorBinding,
  LocalExecutionModelBinding,
} from '../../../src/platform/creative/canonical/localExecution.ts';
import {
  LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES,
  LOCAL_BACKGROUND_ISOLATION_COMPOSITE_INTENT,
} from '../../../src/platform/creative/canonical/localComposite.ts';
import {
  BACKGROUND_ISOLATION_CAPABILITY,
  BACKGROUND_ISOLATION_TOOL_ID,
  BACKGROUND_ISOLATION_TOOL_VERSION,
} from '../../../src/platform/creative/deterministic/BackgroundIsolation.ts';
import {
  MOBILE_SAM_LOCAL_CAPABILITY,
  mobileSamProductionReleaseState,
} from '../localExecution/productionLocalModelPolicy.ts';

export const PRODUCTION_LOCAL_COMPOSITE_START_ADMISSION_VERSION = '6.41D0' as const;

export const PRODUCTION_LOCAL_COMPOSITE_START_BLOCKERS = Object.freeze([
  'SEGMENT_MODEL_AUTHORITY_UNAVAILABLE',
  'SEGMENT_MODEL_ALIAS_DRIFT',
  'BACKGROUND_ISOLATION_EXECUTOR_AUTHORITY_UNAVAILABLE',
  'BACKGROUND_ISOLATION_EXECUTOR_ALIAS_DRIFT',
  'SEGMENT_CAPABILITY_TUPLE_DRIFT',
  'BACKGROUND_ISOLATION_CAPABILITY_TUPLE_DRIFT',
  'VERIFY_CAPABILITY_TUPLE_DRIFT',
  'BROAD_COMPOSITE_CAPABILITY_LEAK',
] as const);

export type ProductionLocalCompositeStartBlocker = typeof PRODUCTION_LOCAL_COMPOSITE_START_BLOCKERS[number];

export type ProductionLocalCompositeStartReadiness = Readonly<{
  version: typeof PRODUCTION_LOCAL_COMPOSITE_START_ADMISSION_VERSION;
  intent: typeof LOCAL_BACKGROUND_ISOLATION_COMPOSITE_INTENT;
  status: 'ADMITTED' | 'BLOCKED';
  admitted: boolean;
  blockers: readonly ProductionLocalCompositeStartBlocker[];
  model: Readonly<{
    modelId: string;
    version: string;
    releaseStatus: string;
  }>;
}>;

export type ProductionLocalCompositeStartAdmission = Readonly<{
  check(): ProductionLocalCompositeStartReadiness;
  assertStartAllowed(): ProductionLocalCompositeStartReadiness;
}>;

type AdmissionInput = Readonly<{
  modelsByCapability: Readonly<Record<string, readonly LocalExecutionModelBinding[]>>;
  executorsByCapability: Readonly<Record<string, readonly LocalExecutionExecutorBinding[]>>;
  capabilityAdmission: ExecutionCapabilityPort;
}>;

const READINESS_SCOPE = Object.freeze({
  tenantId: 'production-local-composite-readiness',
  userId: 'production-local-composite-readiness',
  projectId: 'production-local-composite-readiness',
});
const EMPTY_MODEL_BINDINGS: readonly LocalExecutionModelBinding[] = Object.freeze([]);
const EMPTY_EXECUTOR_BINDINGS: readonly LocalExecutionExecutorBinding[] = Object.freeze([]);

/**
 * Start-only production admission for the exact accepted C5B composite graph.
 *
 * The selected Core catalogs are the authority. This module does not grant model,
 * executor, scope, persistence, billing, device or release authority on its own.
 */
export function createProductionLocalCompositeStartAdmission(input: AdmissionInput): ProductionLocalCompositeStartAdmission {
  return Object.freeze({
    check: () => evaluateProductionLocalCompositeStartReadiness(input),
    assertStartAllowed: () => {
      const readiness = evaluateProductionLocalCompositeStartReadiness(input);
      if (!readiness.admitted) throw unavailableError(readiness);
      return readiness;
    },
  });
}

export function evaluateProductionLocalCompositeStartReadiness(input: AdmissionInput): ProductionLocalCompositeStartReadiness {
  const blockers: ProductionLocalCompositeStartBlocker[] = [];

  const standaloneSegmentModels = input.modelsByCapability[MOBILE_SAM_LOCAL_CAPABILITY] ?? EMPTY_MODEL_BINDINGS;
  const compositeSegmentModels = input.modelsByCapability[LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment] ?? EMPTY_MODEL_BINDINGS;
  const expectedModel = Object.freeze({
    modelId: mobileSamProductionReleaseState.modelId,
    version: mobileSamProductionReleaseState.version,
  });

  if (!isExactSingleModelBinding(standaloneSegmentModels, expectedModel)
      || !isExactSingleModelBinding(compositeSegmentModels, expectedModel)) {
    blockers.push('SEGMENT_MODEL_AUTHORITY_UNAVAILABLE');
  }
  if (standaloneSegmentModels !== compositeSegmentModels) {
    blockers.push('SEGMENT_MODEL_ALIAS_DRIFT');
  }

  const standaloneIsolationExecutors = input.executorsByCapability[BACKGROUND_ISOLATION_CAPABILITY] ?? EMPTY_EXECUTOR_BINDINGS;
  const compositeIsolationExecutors = input.executorsByCapability[LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation] ?? EMPTY_EXECUTOR_BINDINGS;
  if (!isExactBackgroundIsolationExecutor(standaloneIsolationExecutors)
      || !isExactBackgroundIsolationExecutor(compositeIsolationExecutors)) {
    blockers.push('BACKGROUND_ISOLATION_EXECUTOR_AUTHORITY_UNAVAILABLE');
  }
  if (standaloneIsolationExecutors !== compositeIsolationExecutors) {
    blockers.push('BACKGROUND_ISOLATION_EXECUTOR_ALIAS_DRIFT');
  }

  const request = readinessRequest(LOCAL_BACKGROUND_ISOLATION_COMPOSITE_INTENT);
  if (!exactCapability(input.capabilityAdmission, request, operation('segment'), 'ON_DEVICE', LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment)) {
    blockers.push('SEGMENT_CAPABILITY_TUPLE_DRIFT');
  }
  if (!exactCapability(input.capabilityAdmission, request, operation('BACKGROUND_ISOLATION'), 'ON_DEVICE', LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation)) {
    blockers.push('BACKGROUND_ISOLATION_CAPABILITY_TUPLE_DRIFT');
  }
  if (!exactCapability(input.capabilityAdmission, request, operation('verify'), 'INTERNAL', LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.verify)) {
    blockers.push('VERIFY_CAPABILITY_TUPLE_DRIFT');
  }

  const broadRequest = readinessRequest('COMPOSITE_REPLACE_RELIGHT');
  const broadSegment = input.capabilityAdmission.admit({
    request: broadRequest,
    operation: operation('segment'),
    route: 'ON_DEVICE',
    target: 'LOCAL',
  });
  const broadIsolation = input.capabilityAdmission.admit({
    request: broadRequest,
    operation: operation('BACKGROUND_ISOLATION'),
    route: 'ON_DEVICE',
    target: 'LOCAL',
  });
  if (broadSegment.allowed || broadIsolation.allowed) blockers.push('BROAD_COMPOSITE_CAPABILITY_LEAK');

  const uniqueBlockers = Object.freeze(PRODUCTION_LOCAL_COMPOSITE_START_BLOCKERS.filter(blocker => blockers.includes(blocker)));
  const admitted = uniqueBlockers.length === 0;
  return Object.freeze({
    version: PRODUCTION_LOCAL_COMPOSITE_START_ADMISSION_VERSION,
    intent: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_INTENT,
    status: admitted ? 'ADMITTED' : 'BLOCKED',
    admitted,
    blockers: uniqueBlockers,
    model: Object.freeze({
      modelId: expectedModel.modelId,
      version: expectedModel.version,
      releaseStatus: mobileSamProductionReleaseState.releaseStatus,
    }),
  });
}

function readinessRequest(operationIntent: string): CreativeRequest {
  return Object.freeze({
    id: 'production-local-composite-readiness',
    intent: 'production local composite readiness',
    scope: READINESS_SCOPE,
    metadata: Object.freeze({ operationIntent }),
  });
}

function operation(type: string): CreativeOperation {
  return Object.freeze({ id: `readiness-${type}`, type });
}

function exactCapability(
  admission: ExecutionCapabilityPort,
  request: CreativeRequest,
  candidate: CreativeOperation,
  route: 'ON_DEVICE' | 'INTERNAL',
  capabilityId: string,
): boolean {
  const decision = admission.admit({ request, operation: candidate, route, target: 'LOCAL' });
  return decision.allowed === true
    && decision.reasonCode === 'CAPABILITY_SUPPORTED'
    && decision.capabilityId === capabilityId;
}

function isExactSingleModelBinding(
  bindings: readonly LocalExecutionModelBinding[],
  expected: LocalExecutionModelBinding,
): boolean {
  return bindings.length === 1
    && bindings[0]?.modelId === expected.modelId
    && bindings[0]?.version === expected.version;
}

function isExactBackgroundIsolationExecutor(bindings: readonly LocalExecutionExecutorBinding[]): boolean {
  const binding = bindings[0];
  return bindings.length === 1
    && binding?.kind === 'DETERMINISTIC_TOOL'
    && binding.toolId === BACKGROUND_ISOLATION_TOOL_ID
    && binding.version === BACKGROUND_ISOLATION_TOOL_VERSION;
}

function unavailableError(readiness: ProductionLocalCompositeStartReadiness): Error & {
  status: 503;
  code: 'local_composite_production_unavailable';
  readiness: ProductionLocalCompositeStartReadiness;
} {
  return Object.assign(new Error('Local composite production start is not admitted'), {
    status: 503 as const,
    code: 'local_composite_production_unavailable' as const,
    readiness,
  });
}
