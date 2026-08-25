import type { ExecutionCapabilityDecision, ExecutionCapabilityPort, ExecutionRoute, ExecutionTarget } from '../../../src/platform/creative/canonical/contracts.ts';

export const PRODUCTION_EXECUTION_CAPABILITY_VERSION = '6.42C3.1';
type CapabilityRule = Readonly<{ capabilityId: string; route: ExecutionRoute; operationType: string; target: Exclude<ExecutionTarget, 'BLOCKED'>; providerId?: string }>;
const RULES: readonly CapabilityRule[] = Object.freeze([
  Object.freeze({ capabilityId: 'fal:image-edit:v1', route: 'PROVIDER', operationType: 'image-edit', target: 'CLOUD', providerId: 'fal' }),
  Object.freeze({ capabilityId: 'fal:controlled-local-edit:v1', route: 'PROVIDER', operationType: 'CONTROLLED_LOCAL_EDIT', target: 'CLOUD', providerId: 'fal' }),
  Object.freeze({ capabilityId: 'internal:verify:image:v1', route: 'INTERNAL', operationType: 'verify', target: 'LOCAL' }),
  Object.freeze({ capabilityId: 'local:mobilesam:segment:v1', route: 'ON_DEVICE', operationType: 'segment', target: 'LOCAL' }),
  Object.freeze({ capabilityId: 'local:tool:background-isolation:v1', route: 'ON_DEVICE', operationType: 'BACKGROUND_ISOLATION', target: 'LOCAL' }),
  Object.freeze({ capabilityId: 'local:realesrgan:upscale:v1', route: 'ON_DEVICE', operationType: 'SUPER_RESOLUTION', target: 'LOCAL' }),
]);
/** Pure tuple admission; grants no scope, budget, persistence, authentication, runtime, or model trust authority. */
export class ProductionExecutionCapabilityRegistry implements ExecutionCapabilityPort {
  admit({ request, operation, route, target }: Parameters<ExecutionCapabilityPort['admit']>[0]): ExecutionCapabilityDecision {
    if (target === 'BLOCKED') return denied('TARGET_BLOCKED');
    if (route !== 'PROVIDER' && route !== 'INTERNAL' && route !== 'ON_DEVICE') return denied('UNSUPPORTED_ROUTE');
    if (route !== 'PROVIDER' && operation.providerId) return denied('PROVIDER_FORBIDDEN');
    if (route === 'PROVIDER' && !operation.providerId) return denied('PROVIDER_REQUIRED');
    if (operation.type === 'segment' && request.metadata?.operationIntent !== 'INTERACTIVE_SEGMENTATION') return denied('UNSUPPORTED_OPERATION');
    if (operation.type === 'BACKGROUND_ISOLATION' && request.metadata?.operationIntent !== 'BACKGROUND_ISOLATION') return denied('UNSUPPORTED_OPERATION');
    if (operation.type === 'SUPER_RESOLUTION' && request.metadata?.operationIntent !== 'SUPER_RESOLUTION') return denied('UNSUPPORTED_OPERATION');
    const operationRules = RULES.filter(rule => rule.operationType === operation.type);
    if (!operationRules.length) return denied('UNSUPPORTED_OPERATION');
    const routeRules = operationRules.filter(rule => rule.route === route);
    if (!routeRules.length) return denied('UNSUPPORTED_ROUTE');
    const targetRules = routeRules.filter(rule => rule.target === target);
    if (!targetRules.length) return denied('UNSUPPORTED_TARGET');
    const matched = targetRules.find(rule => rule.providerId === operation.providerId);
    if (!matched) return denied('UNSUPPORTED_PROVIDER');
    return Object.freeze({ allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: matched.capabilityId });
  }
}
export const productionExecutionCapabilities: ExecutionCapabilityPort = Object.freeze(new ProductionExecutionCapabilityRegistry());
function denied(reasonCode: ExecutionCapabilityDecision['reasonCode']): ExecutionCapabilityDecision { return Object.freeze({ allowed: false, reasonCode }); }
