import assert from 'node:assert/strict';
import test from 'node:test';
import { GarmentMeshWarpManagedInputAuthority } from '../server/core/localExecution/GarmentMeshWarpManagedInputAuthority.ts';

const owner = Object.freeze({ tenantId: 'tenant', userId: 'user' });
const view = (width: number, height: number) => Object.freeze({
  authority: 'MANAGED_GARMENT' as const,
  kind: 'GARMENT_VIEW' as const,
  garmentId: '11111111-1111-4111-8111-111111111111',
  viewId: '22222222-2222-4222-8222-222222222222',
  contentSha256: 'a'.repeat(64),
  contentType: 'image/png' as const,
  encoding: 'PNG_RGBA8_LOSSLESS' as const,
  width,
  height,
});
const representation = Object.freeze({
  authority: 'MANAGED_GARMENT' as const,
  kind: 'GARMENT_REPRESENTATION' as const,
  garmentId: '11111111-1111-4111-8111-111111111111',
  representationId: '33333333-3333-4333-8333-333333333333',
  tier: 'PARAMETRIC' as const,
  format: 'BERS_PARAMETRIC_V1' as const,
  contentType: 'application/vnd.bers.garment-parametric+json' as const,
  contentSha256: 'b'.repeat(64),
  basisViewId: '22222222-2222-4222-8222-222222222222',
  generatorId: 'test',
  generatorVersion: '1',
  validatorId: 'test',
  validatorVersion: '1',
});

function authority(width: number, height: number) {
  const basis = view(width, height);
  const inner = Object.freeze({
    bindView: async () => basis,
    bindParametricRepresentation: async () => representation,
    revalidateTicket: async () => Object.freeze([
      Object.freeze({ binding: basis, bytes: new Uint8Array(4) }),
      Object.freeze({ binding: representation, bytes: new Uint8Array([1]) }),
    ]),
  });
  return new GarmentMeshWarpManagedInputAuthority(inner as any, { maxDimension: 4096, maxPixels: 8_388_608 });
}

test('F4b.4 managed-input authority rejects an oversized basis view before ticket preparation can publish it', async () => {
  const bounded = authority(4097, 1);
  await assert.rejects(
    () => bounded.bindView(owner, '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'),
    (error: any) => error?.code === 'garment_mesh_warp_source_limit_exceeded' && error?.status === 422,
  );
});

test('F4b.4 delivery revalidation applies the same basis-view limit and valid canonical views pass unchanged', async () => {
  const valid = authority(4096, 2048);
  const bound = await valid.bindView(owner, '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');
  assert.equal(bound.width, 4096);
  assert.equal(bound.height, 2048);

  const oversized = authority(4096, 2049);
  await assert.rejects(
    () => oversized.revalidateTicket({} as any),
    (error: any) => error?.code === 'garment_mesh_warp_source_limit_exceeded',
  );
});
