import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';

export type AuthenticatedPrincipal = AuthenticatedScope & Readonly<{ sessionId?: string; scopes?: readonly string[] }>;

export class HmacJwtVerifier {
  readonly #config: Readonly<{ secret: string; issuer: string; audience: string }>;
  readonly #now: () => number;
  constructor(config: Readonly<{ secret: string; issuer: string; audience: string }>, now = () => Date.now()) { this.#config = config; this.#now = now; }
  verify(authorization: string | undefined): AuthenticatedPrincipal {
    if (!authorization?.startsWith('Bearer ')) throw unauthorized();
    const token = authorization.slice(7); const parts = token.split('.'); if (parts.length !== 3) throw unauthorized();
    try {
      const header = json(parts[0]) as Record<string, unknown>; const claims = json(parts[1]) as Record<string, unknown>;
      if (header.alg !== 'HS256' || header.typ !== 'JWT') throw unauthorized();
      const actual = Buffer.from(parts[2], 'base64url'); const expected = createHmac('sha256', this.#config.secret).update(`${parts[0]}.${parts[1]}`).digest();
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw unauthorized();
      const audience = claims.aud; const validAudience = audience === this.#config.audience || (Array.isArray(audience) && audience.includes(this.#config.audience));
      if (claims.iss !== this.#config.issuer || !validAudience || typeof claims.exp !== 'number' || claims.exp * 1000 <= this.#now()) throw unauthorized();
      if (typeof claims.sub !== 'string' || !claims.sub || typeof claims.tenantId !== 'string' || !claims.tenantId) throw unauthorized();
      return Object.freeze({ userId: claims.sub, tenantId: claims.tenantId, sessionId: typeof claims.sid === 'string' ? claims.sid : undefined, scopes: Array.isArray(claims.scopes) && claims.scopes.every(value => typeof value === 'string') ? Object.freeze(claims.scopes as string[]) : undefined });
    } catch { throw unauthorized(); }
  }
}
function json(value: string): unknown { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); }
function unauthorized() { return Object.assign(new Error('Authentication token is invalid'), { code: 'unauthenticated', status: 401, retryable: false }); }
