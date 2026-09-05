import type { ExecutionCapabilityDecision, ExecutionCapabilityPort, ExecutionRoute, ExecutionTarget } from '../../../src/platform/creative/canonical/contracts.ts';
import { LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES, LOCAL_BACKGROUND_ISOLATION_COMPOSITE_INTENT } from '../../../src/platform/creative/canonical/localComposite.ts';
import { CROP_CAPABILITY } from '../../../src/platform/creative/deterministic/Crop.ts';
import { RESIZE_CAPABILITY } from '../../../src/platform/creative/deterministic/Resize.ts';
import { ORTHOGONAL_TRANSFORM_CAPABILITY, ORTHOGONAL_TRANSFORM_OPERATION } from '../../../src/platform/creative/deterministic/OrthogonalTransform.ts';
import { GARMENT_TEXTURE_COMPOSITE_CAPABILITY, GARMENT_TEXTURE_COMPOSITE_OPERATION } from '../../../src/platform/creative/deterministic/GarmentTextureCompositeIdentity.js';
import { GARMENT_MESH_WARP_PRODUCTION_EXECUTION_RULE } from './productionGarmentMeshWarpExecutionPolicy.ts';

export const PRODUCTION_EXECUTION_CAPABILITY_VERSION = '6.42F4B5B';
type CapabilityRule = Readonly<{ capabilityId: string; route: ExecutionRoute; operationType: string; target: Exclude<ExecutionTarget, 'BLOCKED'>; providerId?: string; operationIntent?: string }>;
const RULES: readonly CapabilityRule[] = Object.freeze([
  Object.freeze({ capabilityId: 'fal:image-edit:v1', route: 'PROVIDER', operationType: 'image-edit', target: 'CLOUD', providerId: 'fal' }),
  Object.freeze({ capabilityId: 'fal:controlled-local-edit:v1', route: 'PROVIDER', operationType: 'CONTROLLED_LOCAL_EDIT', target: 'CLOUD', providerId: 'fal' }),
  Object.freeze({ capabilityId: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.verify, route: 'INTERNAL', operationType: 'verify', target: 'LOCAL', operationIntent: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_INTENT }),
  Object.freeze({ capabilityId: 'internal:verify:image:v1', route: 'INTERNAL', operationType: 'verify', target: 'LOCAL' }),
  Object.freeze({ capabilityId: 'local:mobilesam:segment:v1', route: 'ON_DEVICE', operationType: 'segment', target: 'LOCAL', operationIntent: 'INTERACTIVE_SEGMENTATION' }),
  Object.freeze({ capabilityId: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment, route: 'ON_DEVICE', operationType: 'segment', target: 'LOCAL', operationIntent: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_INTENT }),
  Object.freeze({ capabilityId: 'local:tool:background-isolation:v1', route: 'ON_DEVICE', operationType: 'BACKGROUND_ISOLATION', target: 'LOCAL', operationIntent: 'BACKGROUND_ISOLATION' }),
  Object.freeze({ capabilityId: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation, route: 'ON_DEVICE', operationType: 'BACKGROUND_ISOLATION', target: 'LOCAL', operationIntent: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_INTENT }),
  Object.freeze({ capabilityId: CROP_CAPABILITY, route: 'ON_DEVICE', operationType: 'CROP', target: 'LOCAL', operationIntent: 'CROP' }),
  Object.freeze({ capabilityId: RESIZE_CAPABILITY, route: 'ON_DEVICE', operationType: 'RESIZE', target: 'LOCAL', operationIntent: 'RESIZE' }),
  Object.freeze({ capabilityId: ORTHOGONAL_TRANSFORM_CAPABILITY, route: 'ON_DEVICE', operationType: ORTHOGONAL_TRANSFORM_OPERATION, target: 'LOCAL', operationIntent: ORTHOGONAL_TRANSFORM_OPERATION }),
  GARMENT_MESH_WARP_PRODUCTION_EXECUTION_RULE,
  Object.freeze({ capabilityId: GARMENT_TEXTURE_COMPOSITE_CAPABILITY, route: 'ON_DEVICE', operationType: GARMENT_TEXTURE_COMPOSITE_OPERATION, target: 'LOCAL', operationIntent: GARMENT_TEXTURE_COMPOSITE_OPERATION }),
  Object.freeze({ capabilityId: 'local:realesrgan:upscale:v1', route: 'ON_DEVICE', operationType: 'SUPER_RESOLUTION', target: 'LOCAL', operationIntent: 'SUPER_RESOLUTION' }),
]);
/** Pure tuple admission; grants no scope, budget, persistence, authentication, runtime, or model trust authority. */
export class ProductionExecutionCapabilityRegistry implements ExecutionCapabilityPort {
  admit({ request, operation, route, target }: Parameters<ExecutionCapabilityPort['admit']>[0]): ExecutionCapabilityDecision {
    if (target === 'BLOCKED') return denied('TARGET_BLOCKED');
    if (route !== 'PROVIDER' && route !== 'INTERNAL' && route !== 'ON_DEVICE') return denied('UNSUPPORTED_ROUTE');
    if (route !== 'PROVIDER' && operation.providerId) return denied('PROVIDER_FORBIDDEN');
    if (route === 'PROVIDER' && !operation.providerId) return denied('PROVIDER_REQUIRED');
    const operationRules = RULES.filter(rule => rule.operationType === operation.type);
    if (!operationRules.length) return denied('UNSUPPORTED_OPERATION');
    const routeRules = operationRules.filter(rule => rule.route === route);
    if (!routeRules.length) return denied('UNSUPPORTED_ROUTE');
    const targetRules = routeRules.filter(rule => rule.target === target);
    if (!targetRules.length) return denied('UNSUPPORTED_TARGET');
    const operationIntent = typeof request.metadata?.operationIntent === 'string' ? request.metadata.operationIntent : undefined;
    const intentRules = targetRules.filter(rule => rule.operationIntent === undefined || rule.operationIntent === operationIntent);
    if (!intentRules.length) return denied('UNSUPPORTED_OPERATION');
    const exactIntentRules = intentRules.filter(rule => rule.operationIntent === operationIntent);
    const candidates = exactIntentRules.length ? exactIntentRules : intentRules.filter(rule => rule.operationIntent === undefined);
    const matched = candidates.find(rule => rule.providerId === operation.providerId);
    if (!matched) return denied('UNSUPPORTED_PROVIDER');
    return Object.freeze({ allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: matched.capabilityId });
  }
}
export const productionExecutionCapabilities: ExecutionCapabilityPort = Object.freeze(new ProductionExecutionCapabilityRegistry());
function denied(reasonCode: ExecutionCapabilityDecision['reasonCode']): ExecutionCapabilityDecision { return Object.freeze({ allowed: false, reasonCode }); }
