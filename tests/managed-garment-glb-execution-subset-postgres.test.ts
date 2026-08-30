import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { migrateGarmentSchema } from '../server/core/fashion/garmentSchema.ts';
import { PostgresGarmentStore } from '../server/core/fashion/postgresGarmentStore.ts';
import { PostgresGarmentWardrobeStore } from '../server/core/fashion/postgresGarmentWardrobeStore.ts';
import { PostgresGarmentRepresentationStore } from '../server/core/fashion/postgresGarmentRepresentationStore.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for strict GLB execution-subset acceptance');

const owner = Object.freeze({ tenantId: 'fashion-glb-strict-tenant', userId: 'fashion-glb-strict-user' });
const limits = Object.freeze({ maxUploadBytes: 2 * 1024 * 1024, maxDimension: 600, maxPixels: 400_000 });

type FixtureOptions = Readonly<{
  positionCount?: number;
  indices?: readonly number[];
  indexComponentType?: 5121 | 5123 | 5125 | 5126;
  mutate?: (document: any) => void;
}>;

async function reset(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS
    canonical_garment_representation_sources,
    canonical_garment_representations,
    canonical_outfit_entries,
    canonical_outfits,
    canonical_garment_collection_members,
    canonical_garment_collections,
    canonical_garment_tags,
    canonical_garment_views,
    canonical_garments
    CASCADE`);
  await migrateGarmentSchema(pool);
}

async function image(): Promise<Uint8Array> {
  return new Uint8Array(await sharp({
    create: { width: 384, height: 384, channels: 4, background: { r: 64, g: 96, b: 128, alpha: 1 } },
  }).png().toBuffer());
}

function buildGlb(options: FixtureOptions = {}): Uint8Array {
  const positionCount = options.positionCount ?? 3;
  const positions = Buffer.alloc(positionCount * 12);
  const points = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
  ];
  for (let index = 0; index < positionCount; index += 1) {
    const point = points[index] ?? [index, index % 2, 0];
    positions.writeFloatLE(point[0], index * 12);
    positions.writeFloatLE(point[1], index * 12 + 4);
    positions.writeFloatLE(point[2], index * 12 + 8);
  }

  const indices = options.indices;
  const indexComponentType = options.indexComponentType ?? 5123;
  let indexBytes = Buffer.alloc(0);
  let indexComponentBytes = 0;
  if (indices) {
    indexComponentBytes = indexComponentType === 5121 ? 1 : indexComponentType === 5123 ? 2 : 4;
    indexBytes = Buffer.alloc(indices.length * indexComponentBytes);
    indices.forEach((value, index) => {
      const offset = index * indexComponentBytes;
      if (indexComponentType === 5121) indexBytes.writeUInt8(value, offset);
      else if (indexComponentType === 5123) indexBytes.writeUInt16LE(value, offset);
      else if (indexComponentType === 5125) indexBytes.writeUInt32LE(value, offset);
      else indexBytes.writeFloatLE(value, offset);
    });
  }

  const rawBin = Buffer.concat([positions, indexBytes]);
  const bufferViews: any[] = [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }];
  const accessors: any[] = [{ bufferView: 0, byteOffset: 0, componentType: 5126, count: positionCount, type: 'VEC3' }];
  const primitive: any = { attributes: { POSITION: 0 }, mode: 4 };
  if (indices) {
    bufferViews.push({ buffer: 0, byteOffset: positions.byteLength, byteLength: indexBytes.byteLength });
    accessors.push({ bufferView: 1, byteOffset: 0, componentType: indexComponentType, count: indices.length, type: 'SCALAR' });
    primitive.indices = 1;
  }

  const document: any = {
    asset: { version: '2.0', generator: 'BERS F4a.1 strict GLB fixture' },
    buffers: [{ byteLength: rawBin.byteLength }],
    bufferViews,
    accessors,
    meshes: [{ primitives: [primitive] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  };
  options.mutate?.(document);

  const rawJson = Buffer.from(JSON.stringify(document), 'utf8');
  const jsonPadding = (4 - (rawJson.byteLength % 4)) % 4;
  const json = Buffer.concat([rawJson, Buffer.alloc(jsonPadding, 0x20)]);
  const binPadding = (4 - (rawBin.byteLength % 4)) % 4;
  const bin = Buffer.concat([rawBin, Buffer.alloc(binPadding)]);
  const total = 12 + 8 + json.byteLength + 8 + bin.byteLength;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(json.byteLength, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  json.copy(out, 20);
  const binHeader = 20 + json.byteLength;
  out.writeUInt32LE(bin.byteLength, binHeader);
  out.writeUInt32LE(0x004e4942, binHeader + 4);
  bin.copy(out, binHeader + 8);
  return new Uint8Array(out);
}

async function expectInvalidWithoutDrift(
  garments: PostgresGarmentStore,
  representations: PostgresGarmentRepresentationStore,
  garmentId: string,
  revision: number,
  primaryViewId: string,
  bytes: Uint8Array,
): Promise<void> {
  const before = await garments.get(owner, garmentId);
  assert.ok(before);
  assert.equal(before!.revision, revision);
  await assert.rejects(
    representations.admit(owner, garmentId, revision, {
      tier: 'FULL_3D',
      generatorId: 'local.glb-builder',
      generatorVersion: 'strict-invalid-fixture',
      sourceViewIds: [primaryViewId],
      bytes,
    }),
    (cause: any) => {
      assert.equal(cause?.status, 400);
      assert.equal(cause?.code, 'invalid_garment_glb_representation');
      return true;
    },
  );
  const after = await garments.get(owner, garmentId);
  assert.ok(after);
  assert.equal(after!.revision, revision, 'rejected GLB admission must not advance Garment revision');
  assert.equal(after!.representationTier, before!.representationTier, 'rejected GLB admission must not change representation tier');
}

test('F4a.1 admits only strict default-scene triangle execution GLBs and records validator v2', async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await reset(pool);
    const garments = new PostgresGarmentStore(pool);
    const wardrobe = new PostgresGarmentWardrobeStore(pool);
    const representations = new PostgresGarmentRepresentationStore(pool);

    const created = await garments.createWithInitialView(owner, {
      name: 'Strict GLB garment',
      viewKind: 'FRONT',
      sourceContentType: 'image/png',
      bytes: await image(),
    }, limits);
    const classified = await wardrobe.updateMetadata(owner, created.id, created.revision, { category: 'tshirts' });
    let garment = (await garments.get(owner, created.id))!;
    assert.equal(garment.revision, classified.revision);
    assert.equal(garment.representationTier, 'BASIC');

    const rejectedFixtures = [
      buildGlb({ positionCount: 4 }),
      buildGlb({ indices: [0, 1, 2, 0] }),
      buildGlb({ indices: [0, 1, 2], indexComponentType: 5126 }),
      buildGlb({ indices: [0, 1, 3] }),
      buildGlb({ indices: [0, 1, 2], mutate: document => { document.accessors[1].type = 'VEC2'; } }),
      buildGlb({ indices: [0, 1, 2], mutate: document => { document.bufferViews[1].byteStride = 4; } }),
      buildGlb({ indices: [0, 1, 2], mutate: document => {
        document.buffers[0].byteLength += 1;
        document.bufferViews[1].byteLength += 1;
        document.accessors[1].byteOffset = 1;
      } }),
      buildGlb({ mutate: document => {
        document.nodes = [{ mesh: 0 }, {}];
        document.scenes = [{ nodes: [1] }];
      } }),
      buildGlb({ mutate: document => { document.scenes = [{ nodes: [9] }]; } }),
      buildGlb({ mutate: document => {
        document.nodes = [{ children: [9] }, { mesh: 0 }];
        document.scenes = [{ nodes: [0] }];
      } }),
      buildGlb({ mutate: document => {
        document.nodes = [{ children: [1] }, { children: [0], mesh: 0 }];
        document.scenes = [{ nodes: [0] }];
      } }),
    ];

    for (const fixture of rejectedFixtures) {
      await expectInvalidWithoutDrift(garments, representations, garment.id, garment.revision, garment.primaryViewId, fixture);
    }
    assert.equal((await representations.list(owner, garment.id)).length, 0);

    const nonIndexed = await representations.admit(owner, garment.id, garment.revision, {
      tier: 'FULL_3D',
      generatorId: 'local.glb-builder',
      generatorVersion: 'strict-non-indexed',
      sourceViewIds: [garment.primaryViewId],
      bytes: buildGlb(),
    });
    assert.equal(nonIndexed.representation.validatorId, 'bers.glb-structural-validator');
    assert.equal(nonIndexed.representation.validatorVersion, '2');
    assert.equal(nonIndexed.representationTier, 'FULL_3D');
    garment = (await garments.get(owner, garment.id))!;
    assert.equal(garment.revision, nonIndexed.garmentRevision);
    assert.equal(garment.representationTier, 'FULL_3D');

    const indexed = await representations.admit(owner, garment.id, garment.revision, {
      tier: 'FULL_3D',
      generatorId: 'local.glb-builder',
      generatorVersion: 'strict-indexed-nested-scene',
      sourceViewIds: [garment.primaryViewId],
      bytes: buildGlb({ indices: [0, 1, 2], mutate: document => {
        document.nodes = [{ children: [1] }, { mesh: 0 }];
        document.scenes = [{ nodes: [0] }];
      } }),
    });
    assert.equal(indexed.representation.validatorVersion, '2');
    assert.equal(indexed.garmentRevision, garment.revision + 1);
    garment = (await garments.get(owner, garment.id))!;
    assert.equal(garment.representationTier, 'FULL_3D');
    assert.equal((await representations.list(owner, garment.id)).filter(rep => rep.admissionState === 'ADMITTED' && rep.tier === 'FULL_3D').length, 2);
  } finally {
    await pool.end();
  }
});
