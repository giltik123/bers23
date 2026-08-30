import { createHash } from 'node:crypto';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import { PostgresMaskArtifactStore } from './postgresMaskArtifactStore.ts';
import { PostgresImageArtifactStore } from './postgresImageArtifactStore.ts';
import { SignedArtifactAuthority } from './signedArtifactAuthority.ts';

export type StoredProjectImageEvidence = Readonly<{
  artifactId: string;
  projectId: string;
  storageId: string;
  role: 'ORIGINAL' | 'COMPOSITE';
  lifecycle: 'IMMUTABLE' | 'FINAL';
  width: number;
  height: number;
  sha256: string;
}>;

/** One authorization boundary for signed external originals and durable stored masks. */
export class ArtifactAuthority {
  readonly external: SignedArtifactAuthority; readonly masks: PostgresMaskArtifactStore; readonly images: PostgresImageArtifactStore;
  constructor(external: SignedArtifactAuthority, masks: PostgresMaskArtifactStore, images: PostgresImageArtifactStore) { this.external = external; this.masks = masks; this.images = images; }
  async owns(scope: AuthenticatedScope & { projectId: string }, ids: readonly string[]): Promise<boolean> {
    try {
      for (const id of ids) {
        try { const claim = this.external.resolveStoredOriginalId(id, scope); if (!await this.images.loadSource(claim.storageId, scope)) return false; continue; } catch { /* other reference types below */ }
        try { const claim = this.external.resolveStoredFinalId(id, scope); if (!await this.images.loadSource(claim.storageId, scope)) return false; continue; } catch { /* other reference types below */ }
        try { this.external.resolve(id, scope); continue; } catch { /* stored-mask references are checked below */ }
        const claim = this.external.resolveStoredMask(id, scope);
        if (!await this.masks.load(claim.storageId, scope)) return false;
      }
      return true;
    } catch { return false; }
  }

  /**
   * Resolve one durable Project IMAGE identity from its opaque signed ID.
   * External URL references are deliberately rejected: F4b body-anchor and warp
   * lineage must be bound to canonical stored ORIGINAL/FINAL bytes, not a remote
   * object whose durable storage identity Core cannot prove.
   */
  async resolveStoredImageEvidence(
    scope: AuthenticatedScope & { projectId: string },
    artifactId: string,
  ): Promise<StoredProjectImageEvidence> {
    let storageId: string;
    let expectedRole: StoredProjectImageEvidence['role'];
    let expectedLifecycle: StoredProjectImageEvidence['lifecycle'];
    try {
      const claim = this.external.resolveStoredOriginalId(artifactId, scope);
      storageId = claim.storageId;
      expectedRole = 'ORIGINAL';
      expectedLifecycle = 'IMMUTABLE';
    } catch {
      const claim = this.external.resolveStoredFinalId(artifactId, scope);
      storageId = claim.storageId;
      expectedRole = 'COMPOSITE';
      expectedLifecycle = 'FINAL';
    }
    const stored = await this.images.loadSource(storageId, scope);
    if (!stored) throw new Error('Canonical stored Project IMAGE is unavailable');
    if (
      stored.storageId !== storageId
      || stored.projectId !== scope.projectId
      || stored.role !== expectedRole
      || stored.lifecycle !== expectedLifecycle
      || stored.encoding !== 'PNG_RGBA8_LOSSLESS'
      || stored.contentType !== 'image/png'
      || !Number.isSafeInteger(stored.width)
      || stored.width < 1
      || !Number.isSafeInteger(stored.height)
      || stored.height < 1
      || stored.bytes.byteLength < 1
    ) throw new Error('Canonical stored Project IMAGE evidence is outside the admitted contract');
    return Object.freeze({
      artifactId,
      projectId: scope.projectId,
      storageId,
      role: expectedRole,
      lifecycle: expectedLifecycle,
      width: stored.width,
      height: stored.height,
      sha256: createHash('sha256').update(stored.bytes).digest('hex'),
    });
  }
}
