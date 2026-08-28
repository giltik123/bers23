import type { ExecutionRouteSelectorPort } from '../../../src/platform/creative/canonical/contracts.ts';

export const PRODUCTION_EXECUTION_ROUTE_VERSION = '6.42C3.2';

/** Pure execution policy: no scope, persistence, billing, auth, or provider-call authority. */
export class ProductionExecutionRouteSelector implements ExecutionRouteSelectorPort {
  select(operation: Parameters<ExecutionRouteSelectorPort['select']>[0]) {
    if (operation.type === 'image-edit' || operation.type === 'CONTROLLED_LOCAL_EDIT') return 'PROVIDER' as const;
    if (operation.type === 'verify') return 'INTERNAL' as const;
    if (operation.type === 'segment' || operation.type === 'BACKGROUND_ISOLATION' || operation.type === 'CROP' || operation.type === 'RESIZE' || operation.type === 'ORTHOGONAL_TRANSFORM' || operation.type === 'SUPER_RESOLUTION') return 'ON_DEVICE' as const;
    throw new Error(`Unsupported production execution route for ${operation.type}`);
  }
}
export const productionExecutionRoute = Object.freeze(new ProductionExecutionRouteSelector());
