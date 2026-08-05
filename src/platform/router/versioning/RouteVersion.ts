/** Stable versions stamped onto every routing decision for later reproduction. */
export const ROUTE_VERSION = '2.4';
export const ROUTING_POLICY_VERSION = '1';

/** Reproducibility metadata attached to a route. */
export interface RouteVersion {
  readonly routeId: string;
  readonly version: string;
  readonly policyVersion: string;
}

/** Creates a deterministic route ID without relying on environment-specific APIs. */
export function createRouteVersion(request: string, capabilities: readonly string[], providers: readonly string[]): RouteVersion {
  const source = JSON.stringify([request.trim().toLowerCase(), capabilities, providers, ROUTE_VERSION, ROUTING_POLICY_VERSION]);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Object.freeze({ routeId: `route-${(hash >>> 0).toString(16).padStart(8, '0')}`, version: ROUTE_VERSION, policyVersion: ROUTING_POLICY_VERSION });
}
