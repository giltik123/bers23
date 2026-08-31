import type { CreativeOperation, CreativeRequest } from '../../../src/platform/creative/canonical/contracts.ts';
import {
  GARMENT_TEXTURE_COMPOSITE_CAPABILITY,
  GARMENT_TEXTURE_COMPOSITE_OPERATION,
  GARMENT_TEXTURE_COMPOSITE_PRODUCTION_ADMISSION,
  GARMENT_TEXTURE_COMPOSITE_STEP_ID,
  GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
} from '../../../src/platform/creative/deterministic/GarmentTextureCompositeIdentity.js';
import type { GarmentTextureCompositeProductionPolicy, GarmentTextureCompositeProductionPolicyInput } from '../localExecution/LocalGarmentTextureCompositeExecutionService.ts';
import { productionExecutionCapabilities } from './productionExecutionCapabilities.ts';
import { productionExecutionRoute } from './productionExecutionRoute.ts';
import { productionTargetSelection } from './productionTargetSelection.ts';

/**
 * Exact production tuple gate for deterministic garment texture composition.
 *
 * The identity marker is an explicit kill-switch: presence of this module or a
 * constructed service cannot admit execution while the marker is NOT_ADMITTED.
 * The normal production route/target/capability authorities must independently
 * agree on ON_DEVICE + LOCAL + the exact v1 capability before a ticket may be
 * requested from Core.
 */
export const productionGarmentTextureCompositePolicy: GarmentTextureCompositeProductionPolicy = Object.freeze({
  authorize(input) {
    assertProductionTextureTuple(input);
  },
});

export function assertProductionTextureTuple(input: GarmentTextureCompositeProductionPolicyInput): void {
  if (GARMENT_TEXTURE_COMPOSITE_PRODUCTION_ADMISSION !== 'ADMITTED') {
    throw policyError('garment_texture_composite_not_admitted', 'Garment texture-composite production admission is closed');
  }
  if (
    input.operation.id !== GARMENT_TEXTURE_COMPOSITE_STEP_ID
    || input.operation.version !== GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION
    || input.operation.type !== GARMENT_TEXTURE_COMPOSITE_OPERATION
    || input.operation.capability !== GARMENT_TEXTURE_COMPOSITE_CAPABILITY
  ) throw policyError('garment_texture_composite_operation_mismatch', 'Garment texture-composite operation identity is invalid');

  const request: CreativeRequest = Object.freeze({
    id: `garment-texture-policy:${input.scope.projectId}`,
    intent: GARMENT_TEXTURE_COMPOSITE_OPERATION,
    scope: input.scope,
    budget: Object.freeze({ credits: 0, aiCalls: 0, retries: 0 }),
    metadata: Object.freeze({
      operationIntent: GARMENT_TEXTURE_COMPOSITE_OPERATION,
      sourceArtifactId: input.sourceArtifactId,
      planningConstraints: Object.freeze({
        executionPolicy: 'LOCAL_ONLY',
        confirmationPolicy: 'BLOCK',
        maxCredits: 0,
        forbiddenTargets: Object.freeze(['CLOUD']),
      }),
    }),
  });
  const operation: CreativeOperation = Object.freeze({
    id: GARMENT_TEXTURE_COMPOSITE_STEP_ID,
    type: GARMENT_TEXTURE_COMPOSITE_OPERATION,
    requiredArtifacts: Object.freeze([input.sourceArtifactId]),
    produces: Object.freeze(['image']),
    input: input.operation.parameters,
    outputArtifacts: Object.freeze(['garment-texture-composite:final']),
    cost: Object.freeze({ credits: 0, aiCalls: 0 }),
  });
  const route = productionExecutionRoute.select(operation);
  const target = productionTargetSelection.select(operation, request);
  if (route !== 'ON_DEVICE' || target !== 'LOCAL') {
    throw policyError('garment_texture_composite_route_denied', 'Garment texture-composite must resolve to ON_DEVICE and LOCAL');
  }
  const bound = Object.freeze({ ...operation, executionRoute: route });
  const decision = productionExecutionCapabilities.admit({ request, operation: bound, route, target });
  if (!decision.allowed || decision.capabilityId !== GARMENT_TEXTURE_COMPOSITE_CAPABILITY) {
    throw policyError('garment_texture_composite_capability_denied', 'Production capability registry rejected garment texture-composite');
  }
}

function policyError(code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status: 422, code });
}
