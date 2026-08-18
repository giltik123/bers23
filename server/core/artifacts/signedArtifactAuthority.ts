import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';

type ArtifactClaim = Readonly<{ id: string; url: string; tenantId: string; userId: string; projectId: string; exp: number }>;

/** Verifies opaque, server-signed artifact references before exposing a storage URL to a provider. */
export class SignedArtifactAuthority {
  readonly #secret: string; readonly #trustedHosts: readonly string[]; readonly #now: () => number;
  constructor(secret: string, trustedHosts: readonly string[], now = () => Date.now()) { this.#secret = secret; this.#trustedHosts = trustedHosts; this.#now = now; }
  resolve(artifactId: string, scope: AuthenticatedScope & { projectId: string }): ArtifactClaim {
    const [payload, signature, extra] = artifactId.split('.'); if (!payload || !signature || extra) throw denied();
    try {
      const actual = Buffer.from(signature, 'base64url'); const expected = createHmac('sha256', this.#secret).update(payload).digest();
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw denied();
      const claim = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ArtifactClaim;
      if (!claim.id || claim.tenantId !== scope.tenantId || claim.userId !== scope.userId || claim.projectId !== scope.projectId || claim.exp <= this.#now()) throw denied();
      const url = new URL(claim.url); if (url.protocol !== 'https:' || !this.#trustedHosts.includes(url.hostname)) throw denied();
      return Object.freeze(claim);
    } catch { throw denied(); }
  }
  owns(scope: AuthenticatedScope & { projectId: string }, ids: readonly string[]): Promise<boolean> { try { ids.forEach(id => this.resolve(id, scope)); return Promise.resolve(true); } catch { return Promise.resolve(false); } }
}
function denied() { return new Error('Artifact reference is not trusted for this scope'); }
