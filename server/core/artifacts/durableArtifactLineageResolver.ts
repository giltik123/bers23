import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { Scope } from '../../../src/platform/creative/workflow-engine/types.ts';
import type { SignedArtifactAuthority } from './signedArtifactAuthority.ts';
import type { PostgresImageArtifactStore, StoredImage } from './postgresImageArtifactStore.ts';
import type { PostgresMaskArtifactStore } from './postgresMaskArtifactStore.ts';

export type DurableResolvedArtifact = Readonly<{
  artifactId: string;
  kind: 'image' | 'mask';
  role: 'ORIGINAL' | 'COMPOSITE' | 'MASK';
  sha256: string;
  parentArtifactIds: readonly string[];
  width: number;
  height: number;
}>;

/**
 * Reconstructs canonical integrity + lineage from durable storage authority only.
 * It deliberately rejects external URL artifacts and does not infer missing parentage.
 */
export class DurableArtifactLineageResolver {
  private readonly signed: SignedArtifactAuthority;
  private readonly images: PostgresImageArtifactStore;
  private readonly masks: PostgresMaskArtifactStore;

  constructor(input: Readonly<{ signed: SignedArtifactAuthority; images: PostgresImageArtifactStore; masks: PostgresMaskArtifactStore }>) {
    this.signed = input.signed;
    this.images = input.images;
    this.masks = input.masks;
  }

  async resolve(scope: Scope, artifactId: string): Promise<DurableResolvedArtifact> {
    const normalizedScope = requireScope(scope);
    const id = requireId(artifactId);
    const image = await this.resolveImage(normalizedScope, id);
    if (image) return image;
    const mask = await this.resolveMask(normalizedScope, id);
    if (mask) return mask;
    throw resolverError('durable_artifact_unavailable', 'Artifact is not a scope-bound durable canonical IMAGE or MASK');
  }

  private async resolveImage(scope: Scope, artifactId: string): Promise<DurableResolvedArtifact | undefined> {
    let storageId: string | undefined;
    let expectedRole: 'ORIGINAL' | 'COMPOSITE' | undefined;
    try {
      storageId = this.signed.resolveStoredOriginalId(artifactId, scope).storageId;
      expectedRole = 'ORIGINAL';
    } catch { /* try FINAL below */ }
    if (!storageId) {
      try {
        storageId = this.signed.resolveStoredFinalId(artifactId, scope).storageId;
        expectedRole = 'COMPOSITE';
      } catch { return undefined; }
    }
    const stored = await this.images.loadSource(storageId, scope);
    if (!stored || stored.role !== expectedRole) throw resolverError('durable_artifact_unavailable', 'Signed IMAGE identity has no matching durable canonical row');
    const parents = await this.imageParents(scope, stored);
    return Object.freeze({
      artifactId,
      kind: 'image',
      role: stored.role,
      sha256: sha256(stored.bytes),
      parentArtifactIds: parents,
      width: stored.width,
      height: stored.height,
    });
  }

  private async resolveMask(scope: Scope, artifactId: string): Promise<DurableResolvedArtifact | undefined> {
    let storageId: string;
    try { storageId = this.signed.resolveStoredMask(artifactId, scope).storageId; } catch { return undefined; }
    const stored = await this.masks.load(storageId, scope);
    if (!stored) throw resolverError('durable_artifact_unavailable', 'Signed MASK identity has no matching durable canonical row');
    if (!stored.sourceImageStorageId) throw resolverError('durable_lineage_unavailable', 'Canonical MASK has no durable source IMAGE lineage');
    const source = await this.images.loadSource(stored.sourceImageStorageId, scope);
    if (!source) throw resolverError('durable_lineage_unavailable', 'Canonical MASK source IMAGE is unavailable');
    const sourceArtifactId = issueStoredImageId(this.signed, source, scope);
    const alpha = await decodeMaskAlpha(stored.png, stored.width, stored.height);
    return Object.freeze({
      artifactId,
      kind: 'mask',
      role: 'MASK',
      sha256: sha256(alpha),
      parentArtifactIds: Object.freeze([sourceArtifactId]),
      width: stored.width,
      height: stored.height,
    });
  }

  private async imageParents(scope: Scope, stored: StoredImage): Promise<readonly string[]> {
    if (stored.role === 'ORIGINAL') {
      if (
        stored.sourceImageStorageId || stored.maskStorageId || stored.producerOperation
        || stored.garmentWarpLayerId || stored.garmentWarpLayerSha256 || stored.producerParameters || stored.producerParametersSha256
        || stored.refinementParentStorageId || stored.refinementParentSha256 || stored.refinementProfile || stored.refinementSupportSha256
      ) throw resolverError('durable_lineage_invalid', 'Immutable ORIGINAL cannot carry derived-image lineage');
      return Object.freeze([]);
    }
    if (
      !stored.sourceImageStorageId && !stored.maskStorageId && !stored.producerOperation
      && !stored.garmentWarpLayerId && !stored.garmentWarpLayerSha256 && !stored.producerParameters && !stored.producerParametersSha256
      && !stored.refinementParentStorageId && !stored.refinementParentSha256 && !stored.refinementProfile && !stored.refinementSupportSha256
    ) return Object.freeze([]);

    if (stored.producerOperation === 'GARMENT_APPEARANCE_REFINEMENT') {
      if (
        stored.sourceImageStorageId || stored.maskStorageId || stored.garmentWarpLayerId || stored.garmentWarpLayerSha256
        || stored.producerParameters || stored.producerParametersSha256
        || !stored.refinementParentStorageId || !stored.refinementParentSha256 || !stored.refinementProfile || !stored.refinementSupportSha256
      ) throw resolverError('durable_lineage_invalid', 'Fashion refinement FINAL lineage is incomplete or mixed with F4 lineage');
      const parent = await this.images.loadSource(stored.refinementParentStorageId, scope);
      if (
        !parent
        || parent.role !== 'COMPOSITE'
        || parent.lifecycle !== 'FINAL'
        || parent.producerOperation !== 'GARMENT_TEXTURE_COMPOSITE'
      ) throw resolverError('durable_lineage_unavailable', 'Fashion refinement deterministic F4 parent FINAL is unavailable or invalid');
      if (parent.width !== stored.width || parent.height !== stored.height) {
        throw resolverError('durable_lineage_invalid', 'Fashion refinement parent geometry differs from the child FINAL');
      }
      if (sha256(parent.bytes) !== stored.refinementParentSha256) {
        throw resolverError('durable_lineage_invalid', 'Fashion refinement parent SHA-256 does not match durable lineage');
      }
      // F5 is a refinement of the already-authoritative deterministic F4 FINAL.
      // Keep that FINAL as the only direct Artifact parent; Project source and
      // immutable warp evidence remain transitive lineage of the F4 parent.
      return Object.freeze([issueStoredImageId(this.signed, parent, scope)]);
    }

    if (stored.producerOperation === 'GARMENT_TEXTURE_COMPOSITE') {
      if (
        !stored.sourceImageStorageId || stored.maskStorageId || !stored.garmentWarpLayerId
        || !stored.garmentWarpLayerSha256 || !stored.producerParameters || !stored.producerParametersSha256
        || stored.refinementParentStorageId || stored.refinementParentSha256 || stored.refinementProfile || stored.refinementSupportSha256
      ) throw resolverError('durable_lineage_invalid', 'Fashion texture FINAL lineage is incomplete');
      const source = await this.images.loadSource(stored.sourceImageStorageId, scope);
      if (!source) throw resolverError('durable_lineage_unavailable', 'Fashion texture FINAL Project source IMAGE is unavailable');
      // The immutable Fashion warp layer is execution evidence, not a Project Artifact.
      // Expose only the canonical Project source through Artifact parentage.
      return Object.freeze([issueStoredImageId(this.signed, source, scope)]);
    }

    if (
      stored.refinementParentStorageId || stored.refinementParentSha256 || stored.refinementProfile || stored.refinementSupportSha256
      || stored.producerOperation !== 'BACKGROUND_ISOLATION' || !stored.sourceImageStorageId || !stored.maskStorageId
    ) {
      throw resolverError('durable_lineage_invalid', 'Derived FINAL lineage is incomplete or unsupported');
    }
    const source = await this.images.loadSource(stored.sourceImageStorageId, scope);
    const mask = await this.masks.load(stored.maskStorageId, scope);
    if (!source || !mask) throw resolverError('durable_lineage_unavailable', 'Derived FINAL parent row is unavailable');
    if (mask.sourceImageStorageId !== source.storageId) throw resolverError('durable_lineage_invalid', 'Derived FINAL MASK is not lineaged to its source IMAGE');
    return Object.freeze([
      issueStoredImageId(this.signed, source, scope),
      this.signed.issueStoredMask(mask.storageId, scope),
    ]);
  }
}

function issueStoredImageId(authority: SignedArtifactAuthority, stored: StoredImage, scope: Scope): string {
  if (stored.role === 'ORIGINAL' && stored.lifecycle === 'IMMUTABLE') return authority.issueStoredOriginal(stored.storageId, scope);
  if (stored.role === 'COMPOSITE' && stored.lifecycle === 'FINAL') return authority.issueStoredFinal(stored.storageId, scope);
  throw resolverError('durable_lineage_invalid', 'Canonical parent IMAGE role/lifecycle is invalid');
}

async function decodeMaskAlpha(png: Uint8Array, width: number, height: number): Promise<Uint8Array> {
  try {
    const decoded = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
    if (decoded.info.width !== width || decoded.info.height !== height || decoded.info.channels !== 1 || decoded.data.byteLength !== width * height) throw new Error('geometry mismatch');
    return new Uint8Array(decoded.data);
  } catch {
    throw resolverError('durable_artifact_corrupt', 'Canonical MASK bytes cannot be decoded to the stored geometry');
  }
}

function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
function requireId(value: string): string { const id = value?.trim(); if (!id) throw resolverError('invalid_artifact_id', 'Artifact identity is required'); return id; }
function requireScope(value: Scope): Scope {
  const tenantId = value?.tenantId?.trim();
  const userId = value?.userId?.trim();
  const projectId = value?.projectId?.trim();
  if (!tenantId || !userId || !projectId) throw resolverError('invalid_artifact_scope', 'tenantId, userId and projectId are required');
  return Object.freeze({ tenantId, userId, projectId });
}
function resolverError(code: string, message: string): Error & { code: string } { return Object.assign(new Error(message), { code }); }
