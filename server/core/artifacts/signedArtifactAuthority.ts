import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';

type ArtifactClaim = Readonly<{ id: string; url: string; tenantId: string; userId: string; projectId: string; exp: number; location?: 'EXTERNAL' }>;
export type StoredMaskClaim = Readonly<{ v: 1; location: 'STORED_MASK'; storageId: string; tenantId: string; userId: string; projectId: string; role: 'MASK' }>;
export type StoredFinalClaim = Readonly<{ v: 1; location: 'STORED_FINAL'; storageId: string; tenantId: string; userId: string; projectId: string; role: 'COMPOSITE'; lifecycle: 'FINAL'; exp?: number }>;

/** Verifies opaque, server-signed artifact references before exposing a storage URL to a provider. */
export class SignedArtifactAuthority {
  readonly #secret: string; readonly #trustedHosts: readonly string[]; readonly #now: () => number;
  constructor(secret: string, trustedHosts: readonly string[], now = () => Date.now()) { this.#secret = secret; this.#trustedHosts = trustedHosts; this.#now = now; }
  issueStoredMask(storageId: string, scope: AuthenticatedScope & { projectId: string }): string { const payload = Buffer.from(JSON.stringify({ v: 1, location: 'STORED_MASK', storageId, ...scope, role: 'MASK' })).toString('base64url'); return `${payload}.${createHmac('sha256', this.#secret).update(payload).digest('base64url')}`; }
  issueStoredFinal(storageId: string, scope: AuthenticatedScope & { projectId: string }, expiresAt?: number): string { const payload = Buffer.from(JSON.stringify({ v: 1, location: 'STORED_FINAL', storageId, ...scope, role: 'COMPOSITE', lifecycle: 'FINAL', ...(expiresAt ? { exp: expiresAt } : {}) })).toString('base64url'); return `${payload}.${createHmac('sha256', this.#secret).update(payload).digest('base64url')}`; }
  resolveStoredFinal(reference: string, scope?: AuthenticatedScope & { projectId: string }): StoredFinalClaim { const claim = this.verifiedPayload(reference) as StoredFinalClaim; if (claim.v !== 1 || claim.location !== 'STORED_FINAL' || claim.role !== 'COMPOSITE' || claim.lifecycle !== 'FINAL' || !claim.storageId || (claim.exp !== undefined && claim.exp <= this.#now()) || (scope && (claim.tenantId !== scope.tenantId || claim.userId !== scope.userId || claim.projectId !== scope.projectId))) throw denied(); return Object.freeze(claim); }
  resolveStoredMask(artifactId: string, scope: AuthenticatedScope & { projectId: string }): StoredMaskClaim {
    const claim = this.verifiedPayload(artifactId) as StoredMaskClaim;
    if (claim.v !== 1 || claim.location !== 'STORED_MASK' || claim.role !== 'MASK' || !claim.storageId || claim.tenantId !== scope.tenantId || claim.userId !== scope.userId || claim.projectId !== scope.projectId) throw denied();
    return Object.freeze(claim);
  }
  resolve(artifactId: string, scope: AuthenticatedScope & { projectId: string }): ArtifactClaim {
    try {
      const claim = this.verifiedPayload(artifactId) as ArtifactClaim;
      if ((claim as unknown as StoredMaskClaim).location === 'STORED_MASK') throw denied();
      if (!claim.id || claim.tenantId !== scope.tenantId || claim.userId !== scope.userId || claim.projectId !== scope.projectId || claim.exp <= this.#now()) throw denied();
      const url = new URL(claim.url); if (url.protocol !== 'https:' || !this.#trustedHosts.includes(url.hostname)) throw denied();
      return Object.freeze(claim);
    } catch { throw denied(); }
  }
  owns(scope: AuthenticatedScope & { projectId: string }, ids: readonly string[]): Promise<boolean> { try { ids.forEach(id => this.resolve(id, scope)); return Promise.resolve(true); } catch { return Promise.resolve(false); } }
  private verifiedPayload(artifactId: string): unknown { const [payload, signature, extra] = artifactId.split('.'); if (!payload || !signature || extra) throw denied(); const actual = Buffer.from(signature, 'base64url'); const expected = createHmac('sha256', this.#secret).update(payload).digest(); if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw denied(); try { return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { throw denied(); } }
}
function denied() { return new Error('Artifact reference is not trusted for this scope'); }
