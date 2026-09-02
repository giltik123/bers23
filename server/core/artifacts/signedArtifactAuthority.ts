import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';

type ArtifactClaim = Readonly<{ id: string; url: string; tenantId: string; userId: string; projectId: string; exp: number; location?: 'EXTERNAL' }>;
export type StoredMaskClaim = Readonly<{ v: 1; location: 'STORED_MASK'; storageId: string; tenantId: string; userId: string; projectId: string; role: 'MASK' }>;
export type StoredFinalIdClaim = Readonly<{ v: 1; location: 'STORED_FINAL_ID'; storageId: string; tenantId: string; userId: string; projectId: string; role: 'COMPOSITE'; lifecycle: 'FINAL' }>;
export type StoredFinalDeliveryClaim = Readonly<{ v: 1; location: 'STORED_FINAL_DELIVERY'; storageId: string; tenantId: string; userId: string; projectId: string; role: 'COMPOSITE'; lifecycle: 'FINAL'; exp: number }>;
export type StoredOriginalIdClaim = Readonly<{ v: 1; location: 'STORED_ORIGINAL_ID'; storageId: string; tenantId: string; userId: string; projectId: string; role: 'ORIGINAL'; lifecycle: 'IMMUTABLE' }>;
export type StoredOriginalDeliveryClaim = Readonly<{ v: 1; location: 'STORED_ORIGINAL_DELIVERY'; storageId: string; tenantId: string; userId: string; projectId: string; role: 'ORIGINAL'; lifecycle: 'IMMUTABLE'; exp: number }>;

/** Expected fail-closed denial for a malformed, stale, expired, or wrong-scope signed Artifact reference. */
export class ArtifactReferenceDeniedError extends Error {
  readonly code = 'ARTIFACT_REFERENCE_DENIED';
  constructor() {
    super('Artifact reference is not trusted for this scope');
    this.name = 'ArtifactReferenceDeniedError';
  }
}

/** Verifies opaque, server-signed artifact references before exposing a storage URL to a provider. */
export class SignedArtifactAuthority {
  readonly #secret: string; readonly #trustedHosts: readonly string[]; readonly #now: () => number;
  constructor(secret: string, trustedHosts: readonly string[], now = () => Date.now()) { this.#secret = secret; this.#trustedHosts = trustedHosts; this.#now = now; }
  issueStoredMask(storageId: string, scope: AuthenticatedScope & { projectId: string }): string { return this.sign({ v: 1, location: 'STORED_MASK', storageId, ...durableScope(scope), role: 'MASK' }); }
  issueStoredFinal(storageId: string, scope: AuthenticatedScope & { projectId: string }): string { return this.sign({ v: 1, location: 'STORED_FINAL_ID', storageId, ...durableScope(scope), role: 'COMPOSITE', lifecycle: 'FINAL' }); }
  issueStoredFinalDelivery(storageId: string, scope: AuthenticatedScope & { projectId: string }, expiresAt: number): string { if (!Number.isFinite(expiresAt) || expiresAt <= this.#now()) throw denied(); return this.sign({ v: 1, location: 'STORED_FINAL_DELIVERY', storageId, ...durableScope(scope), role: 'COMPOSITE', lifecycle: 'FINAL', exp: expiresAt }); }
  issueStoredOriginal(storageId: string, scope: AuthenticatedScope & { projectId: string }): string { return this.sign({ v: 1, location: 'STORED_ORIGINAL_ID', storageId, ...durableScope(scope), role: 'ORIGINAL', lifecycle: 'IMMUTABLE' }); }
  issueStoredOriginalDelivery(storageId: string, scope: AuthenticatedScope & { projectId: string }, expiresAt: number): string { if (!Number.isFinite(expiresAt) || expiresAt <= this.#now()) throw denied(); return this.sign({ v: 1, location: 'STORED_ORIGINAL_DELIVERY', storageId, ...durableScope(scope), role: 'ORIGINAL', lifecycle: 'IMMUTABLE', exp: expiresAt }); }
  resolveStoredOriginalId(reference: string, scope: AuthenticatedScope & { projectId: string }): StoredOriginalIdClaim { const claim=this.verifiedPayload(reference) as StoredOriginalIdClaim; if(claim.v!==1||claim.location!=='STORED_ORIGINAL_ID'||claim.role!=='ORIGINAL'||claim.lifecycle!=='IMMUTABLE'||!claim.storageId||claim.tenantId!==scope.tenantId||claim.userId!==scope.userId||claim.projectId!==scope.projectId) throw denied(); return Object.freeze(claim); }
  resolveStoredOriginalDelivery(reference: string): StoredOriginalDeliveryClaim { const claim=this.verifiedPayload(reference) as StoredOriginalDeliveryClaim; if(claim.v!==1||claim.location!=='STORED_ORIGINAL_DELIVERY'||claim.role!=='ORIGINAL'||claim.lifecycle!=='IMMUTABLE'||!claim.storageId||!Number.isFinite(claim.exp)||claim.exp<=this.#now()) throw denied(); return Object.freeze(claim); }
  resolveStoredFinalId(reference: string, scope: AuthenticatedScope & { projectId: string }): StoredFinalIdClaim { const claim = this.verifiedPayload(reference) as StoredFinalIdClaim; if (claim.v !== 1 || claim.location !== 'STORED_FINAL_ID' || claim.role !== 'COMPOSITE' || claim.lifecycle !== 'FINAL' || !claim.storageId || claim.tenantId !== scope.tenantId || claim.userId !== scope.userId || claim.projectId !== scope.projectId) throw denied(); return Object.freeze(claim); }
  resolveStoredFinalDelivery(reference: string): StoredFinalDeliveryClaim { const claim = this.verifiedPayload(reference) as StoredFinalDeliveryClaim; if (claim.v !== 1 || claim.location !== 'STORED_FINAL_DELIVERY' || claim.role !== 'COMPOSITE' || claim.lifecycle !== 'FINAL' || !claim.storageId || !Number.isFinite(claim.exp) || claim.exp <= this.#now()) throw denied(); return Object.freeze(claim); }
  resolveStoredMask(artifactId: string, scope: AuthenticatedScope & { projectId: string }): StoredMaskClaim {
    const claim = this.verifiedPayload(artifactId) as StoredMaskClaim;
    if (claim.v !== 1 || claim.location !== 'STORED_MASK' || claim.role !== 'MASK' || !claim.storageId || claim.tenantId !== scope.tenantId || claim.userId !==scope.userId || claim.projectId !== scope.projectId) throw denied();
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
  private verifiedPayload(artifactId: string): unknown {
    const [payload, signature, extra] = artifactId.split('.');
    if (!payload || !signature || extra) throw denied();
    let actual: Buffer;
    try { actual = Buffer.from(signature, 'base64url'); } catch { throw denied(); }
    if (actual.toString('base64url') !== signature) throw denied();
    const expected = createHmac('sha256', this.#secret).update(payload).digest();
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw denied();
    try { return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { throw denied(); }
  }
  private sign(claim: object): string { const payload = Buffer.from(JSON.stringify(claim)).toString('base64url'); return `${payload}.${createHmac('sha256', this.#secret).update(payload).digest('base64url')}`; }
}

function durableScope(scope: AuthenticatedScope & { projectId: string }) {
  return { tenantId: scope.tenantId, userId: scope.userId, projectId: scope.projectId };
}
function denied() { return new ArtifactReferenceDeniedError(); }
