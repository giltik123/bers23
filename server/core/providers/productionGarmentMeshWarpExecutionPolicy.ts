import type {
  ExecutionCapabilityDecision,
  ExecutionCapabilityPort,
  ExecutionRouteSelectorPort,
  TargetSelectorPort,
} from '../../../src/platform/creative/canonical/contracts.ts';
import {
  GARMENT_MESH_WARP_CAPABILITY,
  GARMENT_MESH_WARP_OPERATION,
} from '../../../src/platform/creative/deterministic/GarmentMeshWarpIdentity.js';

/**
 * Exact F4b.4 production execution-policy leaf.
 *
 * This module owns only the reviewed GarmentMeshWarp tuple. Repository-wide
 * route, target and capability registries aggregate this exact rule instead of
 * recreating it alongside unrelated deterministic tools.
 */
export const GARMENT_MESH_WARP_PRODUCTION_EXECUTION_RULE = Object.freeze({
  capabilityId: GARMENT_MESH_WARP_CAPABILITY,
  route: 'ON_DEVICE' as const,
  operationType: GARMENT_MESH_WARP_OPERATION,
  target: 'LOCAL' as const,
  operationIntent: GARMENT_MESH_WARP_OPERATION,
});

export function selectProductionGarmentMeshWarpRoute(
  operation: Parameters<ExecutionRouteSelectorPort['select']>[0],
) {
  if (operation.type !== GARMENT_MESH_WARP_PRODUCTION_EXECUTION_RULE.operationType) {
    throw new Error(`Unsupported GarmentMeshWarp production execution route for ${operation.type}`);
  }
  return GARMENT_MESH_WARP_PRODUCTION_EXECUTION_RULE.route;
}

export function selectProductionGarmentMeshWarpTarget(
  operation: Parameters<TargetSelectorPort['select']>[0],
) {
  return operation.type === GARMENT_MESH_WARP_PRODUCTION_EXECUTION_RULE.operationType
    ? GARMENT_MESH_WARP_PRODUCTION_EXECUTION_RULE.target
    : 'BLOCKED' as const;
}

export function admitProductionGarmentMeshWarpCapability(
  { request, operation, route, target }: Parameters<ExecutionCapabilityPort['admit']>[0],
): ExecutionCapabilityDecision {
  const rule = GARMENT_MESH_WARP_PRODUCTION_EXECUTION_RULE;
  if (operation.type !== rule.operationType) return denied('UNSUPPORTED_OPERATION');
  if (route !== rule.route) return denied('UNSUPPORTED_ROUTE');
  if (target === 'BLOCKED') return denied('TARGET_BLOCKED');
  if (target !== rule.target) return denied('UNSUPPORTED_TARGET');
  if (operation.providerId) return denied('PROVIDER_FORBIDDEN');
  const operationIntent = typeof request.metadata?.operationIntent === 'string'
    ? request.metadata.operationIntent
    : undefined;
  if (operationIntent !== rule.operationIntent) return denied('UNSUPPORTED_OPERATION');
  return Object.freeze({
    allowed: true,
    reasonCode: 'CAPABILITY_SUPPORTED',
    capabilityId: rule.capabilityId,
  });
}

function denied(reasonCode: ExecutionCapabilityDecision['reasonCode']): ExecutionCapabilityDecision {
  return Object.freeze({ allowed: false, reasonCode });
}
