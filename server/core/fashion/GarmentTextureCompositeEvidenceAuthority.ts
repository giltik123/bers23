import sharp from 'sharp';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import type { ArtifactAuthority, ResolvedStoredProjectImage } from '../artifacts/artifactAuthority.ts';
import type { GarmentDestinationMesh } from './bodyAnchorGeometry.ts';
import type { PostgresGarmentWarpLayerStore, GarmentWarpLayer } from './postgresGarmentWarpLayerStore.ts';
import type { PostgresProjectBodyAnchorStore } from './postgresProjectBodyAnchorStore.ts';
import type {
  ManagedGarmentLocalExecutionInputAuthority,
  ResolvedManagedGarmentParametricRepresentationInput,
  ResolvedManagedGarmentViewInput,
} from '../localExecution/ManagedGarmentLocalExecutionInputAuthority.ts';
import { garmentMeshWarpRgba8 } from '../../../src/platform/creative/deterministic/GarmentMeshWarp.ts';
import { garmentTextureCompositeRgba8 } from '../../../src/platform/creative/deterministic/GarmentTextureComposite.ts';
import {
  normalizeGarmentTextureFinalLineageParameters,
  type GarmentTextureCompositeProducerParametersV1,
} from './garmentTextureFinalLineage.ts';

const SHA256 = /^[0-9a-f]{64}$/;

type ProjectAuthority = Pick<ArtifactAuthority, 'resolveStoredImage'>;
type ManagedAuthority = Pick<ManagedGarmentLocalExecutionInputAuthority, 'resolveView' | 'resolveParametricRepresentation'>;
type AnchorAuthority = Pick<PostgresProjectBodyAnchorStore, 'deriveDestinationMesh'>;
type LayerAuthority = Pick<PostgresGarmentWarpLayerStore, 'load'>;

export type GarmentTextureCompositeEvidenceAuthorityDependencies = Readonly<{
  artifacts: ProjectAuthority;
  managedInputs: ManagedAuthority;
  bodyAnchors: AnchorAuthority;
  layers: LayerAuthority;
}>;

export type ResolveGarmentTextureCompositeEvidenceInput = Readonly<{
  sourceArtifactId: string;
  layerId: string;
  layerSha256: string;
}>;

export type ResolvedGarmentTextureCompositeEvidence = Readonly<{
  project: ResolvedStoredProjectImage;
  layer: GarmentWarpLayer;
  view: ResolvedManagedGarmentViewInput;
  representation: ResolvedManagedGarmentParametricRepresentationInput;
  mesh: GarmentDestinationMesh;
  projectRgba: Uint8Array;
  garmentSourceRgba: Uint8Array;
}>;

/**
 * Core-only transitive evidence authority for F4b.5b.
 *
 * An immutable F4b.4 layer is evidence, not trust by itself. Every resolve:
 * - re-authorizes the signed canonical Project source and exact stored bytes;
 * - reloads the active Managed Garment basis view and admitted PARAMETRIC bytes;
 * - re-derives destination geometry from current body-anchor authority;
 * - re-runs the accepted F4b.4 mesh warp from managed source pixels; and
 * - requires byte equality with the immutable stored layer.
 *
 * This class grants no ticket, FINAL persistence, provider, Billing or Try-On
 * authority. It is deliberately reusable at both prepare and submit boundaries.
 */
export class GarmentTextureCompositeEvidenceAuthority {
  constructor(private readonly dependencies: GarmentTextureCompositeEvidenceAuthorityDependencies) {}

  async resolve(
    scope: AuthenticatedScope & { projectId: string },
    input: ResolveGarmentTextureCompositeEvidenceInput,
  ): Promise<ResolvedGarmentTextureCompositeEvidence> {
    const layerSha256 = normalizeSha(input.layerSha256, 'layerSha256');
    const owner = Object.freeze({ tenantId: scope.tenantId, userId: scope.userId });
    const layer = await this.dependencies.layers.load(owner, scope.projectId, input.layerId);
    if (!layer) throw evidenceError(404, 'garment_texture_layer_not_found', 'Fashion garment warp layer is unavailable in the authenticated Project scope');
    if (layer.contentSha256 !== layerSha256) {
      throw evidenceError(409, 'garment_texture_layer_identity_mismatch', 'Fashion garment warp layer SHA-256 does not match the requested immutable identity');
    }

    const [project, view, representation] = await Promise.all([
      this.dependencies.artifacts.resolveStoredImage(scope, input.sourceArtifactId),
      this.dependencies.managedInputs.resolveView(owner, layer.garmentId, layer.viewId),
      this.dependencies.managedInputs.resolveParametricRepresentation(owner, layer.garmentId, layer.representationId),
    ]);
    assertProjectMatchesLayer(project, layer);
    assertManagedEvidenceMatchesLayer(view, representation, layer);

    const mesh = await this.dependencies.bodyAnchors.deriveDestinationMesh(
      owner,
      scope.projectId,
      layer.anchorSetId,
      layer.garmentId,
      layer.representationId,
    );
    assertMeshMatchesLayer(mesh, layer, project);

    const [projectDecoded, viewDecoded] = await Promise.all([
      decodeCanonicalPng(project.bytes, project.width, project.height, 'Project source'),
      decodeCanonicalPng(view.bytes, view.binding.width, view.binding.height, 'Managed Garment basis view'),
    ]);
    const recomputedLayer = garmentMeshWarpRgba8(
      viewDecoded,
      view.binding.width,
      view.binding.height,
      {
        sourcePointsQ16: mesh.sourcePointsQ16,
        destinationPointsQ16: mesh.destinationPointsQ16,
        triangles: mesh.triangles,
        outputWidth: project.width,
        outputHeight: project.height,
      },
    );
    assertExactBytes(recomputedLayer, layer.rgba, 'Immutable F4b.4 layer no longer matches Core recomputation');

    return Object.freeze({
      project,
      layer,
      view,
      representation,
      mesh,
      projectRgba: Uint8Array.from(projectDecoded),
      garmentSourceRgba: Uint8Array.from(viewDecoded),
    });
  }

  recomputeFinal(
    evidence: ResolvedGarmentTextureCompositeEvidence,
    producerParameters: GarmentTextureCompositeProducerParametersV1,
  ): Readonly<{ rgba: Uint8ClampedArray; parameters: ReturnType<typeof normalizeGarmentTextureFinalLineageParameters> }> {
    const parameters = normalizeGarmentTextureFinalLineageParameters(producerParameters);
    const rgba = garmentTextureCompositeRgba8(
      evidence.projectRgba,
      evidence.project.width,
      evidence.project.height,
      evidence.garmentSourceRgba,
      evidence.view.binding.width,
      evidence.view.binding.height,
      {
        sourcePointsQ16: evidence.mesh.sourcePointsQ16,
        destinationPointsQ16: evidence.mesh.destinationPointsQ16,
        triangles: evidence.mesh.triangles,
        outputWidth: evidence.project.width,
        outputHeight: evidence.project.height,
      },
      {
        textureTransform: parameters.document.textureTransform,
        featherRadius: parameters.document.featherRadius,
        colorSpacePolicy: parameters.document.colorSpacePolicy,
      },
    );
    return Object.freeze({ rgba, parameters });
  }
}

function assertProjectMatchesLayer(project: ResolvedStoredProjectImage, layer: GarmentWarpLayer): void {
  if (
    project.projectId !== layer.projectId
    || project.storageId !== layer.projectImageStorageId
    || project.sha256 !== layer.projectImageSha256
    || project.width !== layer.width
    || project.height !== layer.height
  ) throw evidenceError(409, 'garment_texture_project_evidence_mismatch', 'Canonical Project source no longer matches the immutable Fashion layer');
}

function assertManagedEvidenceMatchesLayer(
  view: ResolvedManagedGarmentViewInput,
  representation: ResolvedManagedGarmentParametricRepresentationInput,
  layer: GarmentWarpLayer,
): void {
  if (
    view.binding.garmentId !== layer.garmentId
    || view.binding.viewId !== layer.viewId
    || view.binding.contentSha256 !== layer.viewContentSha256
    || representation.binding.garmentId !== layer.garmentId
    || representation.binding.representationId !== layer.representationId
    || representation.binding.contentSha256 !== layer.representationContentSha256
    || representation.binding.basisViewId !== layer.viewId
  ) throw evidenceError(409, 'garment_texture_managed_evidence_mismatch', 'Managed Garment evidence no longer matches the immutable Fashion layer');
}

function assertMeshMatchesLayer(mesh: GarmentDestinationMesh, layer: GarmentWarpLayer, project: ResolvedStoredProjectImage): void {
  const p = mesh.provenance;
  if (
    mesh.meshSha256 !== layer.destinationMeshSha256
    || p.anchorSetId !== layer.anchorSetId
    || p.anchorPayloadSha256 !== layer.anchorPayloadSha256
    || p.projectId !== layer.projectId
    || p.projectImageStorageId !== layer.projectImageStorageId
    || p.projectImageSha256 !== layer.projectImageSha256
    || p.projectImageWidth !== project.width
    || p.projectImageHeight !== project.height
    || p.garmentId !== layer.garmentId
    || p.representationId !== layer.representationId
    || p.representationContentSha256 !== layer.representationContentSha256
  ) throw evidenceError(409, 'garment_texture_geometry_evidence_mismatch', 'Server-derived destination mesh no longer matches the immutable Fashion layer');
}

async function decodeCanonicalPng(bytes: Uint8Array, width: number, height: number, label: string): Promise<Uint8Array> {
  try {
    const decoded = await sharp(bytes).ensureAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    if (decoded.info.width !== width || decoded.info.height !== height || decoded.info.channels !== 4 || decoded.data.byteLength !== width * height * 4) {
      throw new Error(`${label} decoded outside canonical RGBA geometry`);
    }
    return new Uint8Array(decoded.data);
  } catch (error) {
    throw evidenceError(409, 'garment_texture_pixel_evidence_invalid', error instanceof Error ? error.message : `${label} cannot be decoded`);
  }
}

function assertExactBytes(left: Uint8Array | Uint8ClampedArray, right: Uint8Array | Uint8ClampedArray, message: string): void {
  if (left.byteLength !== right.byteLength) throw evidenceError(409, 'garment_texture_layer_recompute_mismatch', message);
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) throw evidenceError(409, 'garment_texture_layer_recompute_mismatch', message);
  }
}

function normalizeSha(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) throw evidenceError(400, 'invalid_garment_texture_evidence', `${label} must be canonical lowercase SHA-256`);
  return value;
}

function evidenceError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}
