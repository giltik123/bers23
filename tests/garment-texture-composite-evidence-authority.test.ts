import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import sharp from 'sharp';
import { GarmentTextureCompositeEvidenceAuthority } from '../server/core/fashion/GarmentTextureCompositeEvidenceAuthority.ts';
import {
  GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY,
  GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
  GARMENT_TEXTURE_COMPOSITE_FIXED_POINT_ONE,
  GARMENT_TEXTURE_COMPOSITE_SCHEMA,
  GARMENT_TEXTURE_COMPOSITE_WRAP_MODE,
} from '../src/platform/creative/deterministic/GarmentTextureComposite.ts';
import { garmentMeshWarpRgba8 } from '../src/platform/creative/deterministic/GarmentMeshWarp.ts';
import {
  GARMENT_DESTINATION_MESH_COORDINATE_SPACE,
  GARMENT_DESTINATION_MESH_SCHEMA_ID,
  type GarmentDestinationMesh,
} from '../server/core/fashion/bodyAnchorGeometry.ts';
import type { GarmentWarpLayer } from '../server/core/fashion/postgresGarmentWarpLayerStore.ts';

const scope = Object.freeze({ tenantId: 'tenant-a', userId: 'user-a', projectId: '11111111-1111-4111-8111-111111111111' });
const sourceArtifactId = 'signed-project-image';
const storageId = '22222222-2222-4222-8222-222222222222';
const garmentId = '33333333-3333-4333-8333-333333333333';
const viewId = '44444444-4444-4444-8444-444444444444';
const representationId = '55555555-5555-4555-8555-555555555555';
const anchorSetId = '66666666-6666-4666-8666-666666666666';
const layerId = '77777777-7777-4777-8777-777777777777';
const Q = GARMENT_TEXTURE_COMPOSITE_FIXED_POINT_ONE;
const sourcePointsQ16 = Object.freeze([[0, 0], [Q, 0], [Q, Q], [0, Q]] as const);
const destinationPointsQ16 = sourcePointsQ16;
const triangles = Object.freeze([[0, 1, 2], [0, 2, 3]] as const);
const representationSha = '3'.repeat(64);
const anchorSha = '4'.repeat(64);
const meshSha = '5'.repeat(64);

async function png(width: number, height: number, rgba: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer());
}
function sha(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
function bytes(seed: number): Uint8Array {
  return Uint8Array.from([
    20 + seed, 30, 40, 255, 50 + seed, 60, 70, 255,
    80 + seed, 90, 100, 255, 110 + seed, 120, 130, 255,
  ]);
}
function producerParameters() {
  return Object.freeze({
    schema: GARMENT_TEXTURE_COMPOSITE_SCHEMA,
    textureTransform: Object.freeze({
      scaleXQ16: Q,
      scaleYQ16: Q,
      offsetXQ16: 0,
      offsetYQ16: 0,
      wrapMode: GARMENT_TEXTURE_COMPOSITE_WRAP_MODE,
      alphaPolicy: GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY,
    }),
    featherRadius: 0,
    colorSpacePolicy: GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
  });
}

test('F4b.5b evidence authority revalidates the full immutable layer chain before FINAL recompute', async () => {
  const projectRgba = bytes(1);
  const viewRgba = bytes(2);
  const projectPng = await png(2, 2, projectRgba);
  const viewPng = await png(2, 2, viewRgba);
  const projectSha = sha(projectPng);
  const viewSha = sha(viewPng);
  const layerRgba = garmentMeshWarpRgba8(viewRgba, 2, 2, { sourcePointsQ16, destinationPointsQ16, triangles, outputWidth: 2, outputHeight: 2 });
  const layerSha = sha(layerRgba);
  const mesh: GarmentDestinationMesh = Object.freeze({
    schemaId: GARMENT_DESTINATION_MESH_SCHEMA_ID,
    coordinateSpace: GARMENT_DESTINATION_MESH_COORDINATE_SPACE,
    sourcePointsQ16,
    destinationPointsQ16,
    triangles,
    frameAnchors: Object.freeze(['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip'] as const),
    provenance: Object.freeze({
      anchorSetId,
      projectId: scope.projectId,
      projectImageStorageId: storageId,
      projectImageSha256: projectSha,
      projectImageWidth: 2,
      projectImageHeight: 2,
      anchorPayloadSha256: anchorSha,
      garmentId,
      representationId,
      representationContentSha256: representationSha,
      garmentCategory: 'tshirts',
    }),
    meshSha256: meshSha,
  });
  const layer: GarmentWarpLayer = Object.freeze({
    id: layerId,
    projectId: scope.projectId,
    executionId: 'warp-execution',
    ticketId: 'warp-ticket',
    projectImageStorageId: storageId,
    projectImageSha256: projectSha,
    garmentId,
    viewId,
    viewContentSha256: viewSha,
    representationId,
    representationContentSha256: representationSha,
    anchorSetId,
    anchorPayloadSha256: anchorSha,
    destinationMeshSha256: meshSha,
    width: 2,
    height: 2,
    contentSha256: layerSha,
    rgba: Uint8Array.from(layerRgba),
    createdAt: new Date(0).toISOString(),
  });

  let currentLayer: GarmentWarpLayer = layer;
  let currentMesh: GarmentDestinationMesh = mesh;
  let currentViewSha = viewSha;
  const authority = new GarmentTextureCompositeEvidenceAuthority({
    artifacts: {
      resolveStoredImage: async () => Object.freeze({
        artifactId: sourceArtifactId,
        projectId: scope.projectId,
        storageId,
        role: 'ORIGINAL' as const,
        lifecycle: 'IMMUTABLE' as const,
        width: 2,
        height: 2,
        sha256: projectSha,
        bytes: Uint8Array.from(projectPng),
      }),
    },
    managedInputs: {
      resolveView: async () => Object.freeze({
        binding: Object.freeze({ authority: 'MANAGED_GARMENT' as const, kind: 'GARMENT_VIEW' as const, garmentId, viewId, contentSha256: currentViewSha, contentType: 'image/png' as const, encoding: 'PNG_RGBA8_LOSSLESS' as const, width: 2, height: 2 }),
        bytes: Uint8Array.from(viewPng),
      }),
      resolveParametricRepresentation: async () => Object.freeze({
        binding: Object.freeze({
          authority: 'MANAGED_GARMENT' as const,
          kind: 'GARMENT_REPRESENTATION' as const,
          garmentId,
          representationId,
          contentSha256: representationSha,
          basisViewId: viewId,
          generatorId: 'test-generator',
          generatorVersion: '1',
          validatorId: 'test-validator',
          validatorVersion: '1',
          tier: 'PARAMETRIC' as const,
          format: 'BERS_PARAMETRIC_V1' as const,
          contentType: 'application/vnd.bers.garment-parametric+json' as const,
        }),
        bytes: new TextEncoder().encode('{}'),
      }),
    },
    bodyAnchors: { deriveDestinationMesh: async () => currentMesh },
    layers: { load: async () => currentLayer },
  });

  const evidence = await authority.resolve(scope, { sourceArtifactId, layerId, layerSha256: layerSha });
  assert.equal(evidence.layer.id, layerId);
  assert.deepEqual(evidence.projectRgba, projectRgba);
  assert.deepEqual(evidence.garmentSourceRgba, viewRgba);
  const final = authority.recomputeFinal(evidence, producerParameters());
  assert.equal(final.rgba.byteLength, 16);
  assert.equal(final.parameters.document.schema, GARMENT_TEXTURE_COMPOSITE_SCHEMA);

  await assert.rejects(
    authority.resolve(scope, { sourceArtifactId, layerId, layerSha256: '0'.repeat(64) }),
    /layer SHA-256 does not match/i,
  );

  currentViewSha = '8'.repeat(64);
  await assert.rejects(
    authority.resolve(scope, { sourceArtifactId, layerId, layerSha256: layerSha }),
    /Managed Garment evidence no longer matches/i,
  );
  currentViewSha = viewSha;

  currentMesh = Object.freeze({ ...mesh, meshSha256: '9'.repeat(64) });
  await assert.rejects(
    authority.resolve(scope, { sourceArtifactId, layerId, layerSha256: layerSha }),
    /destination mesh no longer matches/i,
  );
  currentMesh = mesh;

  const corrupted = Uint8Array.from(layer.rgba);
  corrupted[0] ^= 1;
  currentLayer = Object.freeze({ ...layer, rgba: corrupted, contentSha256: sha(corrupted) });
  await assert.rejects(
    authority.resolve(scope, { sourceArtifactId, layerId, layerSha256: currentLayer.contentSha256 }),
    /layer no longer matches Core recomputation/i,
  );
});
