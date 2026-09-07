import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import type { AuthenticatedPrincipal } from '../auth/hmacJwtVerifier.ts';

/**
 * Anti-corruption projection from transport/session authentication into the
 * canonical owner identity accepted by execution and persistence services.
 * Session handles and authorization scopes are transport metadata and must not
 * become part of durable operation/ticket/artifact identity.
 */
export function authenticatedOwnerScope(principal: AuthenticatedPrincipal): AuthenticatedScope {
  return Object.freeze({ tenantId: principal.tenantId, userId: principal.userId });
}

/** Exact canonical Project scope derived from a verified transport principal. */
export function authenticatedProjectScope(
  principal: AuthenticatedPrincipal,
  projectId: string,
): AuthenticatedScope & Readonly<{ projectId: string }> {
  return Object.freeze({ tenantId: principal.tenantId, userId: principal.userId, projectId });
}
