import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { createProductionCore } from '../server/core/composition/createProductionCore.ts';
import { migrateImageArtifactSchema } from '../server/core/artifacts/imageArtifactSchema.ts';
import { migrateMaskArtifactSchema } from '../server/core/artifacts/maskArtifactSchema.ts';
import type { CoreServerConfig } from '../server/core/config.ts';
import { BODY_ANCHOR_COORDINATE_SPACE } from '../server/core/fashion/bodyAnchorGeometry.ts';
import { PostgresGarmentRepresentationStore } from '../server/core/fashion/postgresGarmentRepresentationStore.ts';
import { PostgresGarmentStore } from '../server/core/fashion/postgresGarmentStore.ts';
import { PostgresGarmentWardrobeStore } from '../server/core/fashion/postgresGarmentWardrobeStore.ts';
import { PostgresProjectBodyAnchorStore } from '../server/core/fashion/postgresProjectBodyAnchorStore.ts';
import { migrateProjectSchema } from '../server/core/projects/projectSchema.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for F4b.4 closed production composition proof');

const config: CoreServerConfig = Object.freeze({
  nodeEnv: 'test', port: 8080, databaseUrl, provider: 'FAL', falKey: 'must-not-be-called',
  falBaseUrl: 'https://provider.f4b4-closed.invalid', jwtSecret: 'f4b4-closed-jwt-secret', jwtIssuer: 'f4b4-closed-test', jwtAudience: 'f4b4-closed-core',
  authChallengeSecret: '', authDefaultTenantId: '', authPublicOrigin: '', authSessionAbsoluteTtlMs: 8 * 60 * 60 * 1000, authSessionIdleTtlMs: 30 * 60 * 1000,
  resendApiKey: '', authEmailFrom: '', googleOauthClientId: '', googleOauthClientSecret: '',
  artifactSigningSecret: 'f4b4-closed-artifact-secret', trustedAssetHosts: Object.freeze([]), allowLegacyAssetUrls: false,
  allowedWebOrigins: Object.freeze([]), hardBudgetCredits: 1, creditsPerEdit: 1,
  bodyLimitBytes: 128_000, maskUploadLimitBytes: 128_000, maskMaxDimension: 256,
  imageUploadLimitBytes: 2_000_000, imageMaxDimension: 512, imageMaxPixels: 300_000,
  requestTimeoutMs: 5_000, providerTimeoutMs: 2_000, shutdownTimeoutMs: 2_000,
});
const owner = Object.freeze({ tenantId: 'f4b4-closed-tenant', userId: 'f4b4-closed-user' });
const projectLimits = Object.freeze({ maxDimension: 512, maxPixels: 300_000 });
const garmentLimits = Object.freeze({ maxUploadBytes: 2_000_000, maxDimension: 512, maxPixels: 300_000 });

async function image(width: number, height: number, seed: number): Promise<Uint8Array> {
  return new Uint8Array(await sharp({ create: { width, height, channels: 4, background: { r: 30 + seed, g: 60 + seed, b: 90 + seed, alpha: 1 } } }).png().toBuffer());
}
function parametric() {
  return Object.freeze({
    schemaVersion: 1, coordinateSpace: 'PRIMARY_VIEW_NORMALIZED',
    points: Object.freeze([[0,0],[1,0],[1,1],[0,1]].map(point => Object.freeze(point))),
    triangles: Object.freeze([Object.freeze([0,1,2]), Object.freeze([0,2,3])]), outline: Object.freeze([0,1,2,3]),
  });
}
function anchors() {
  return Object.freeze({
    schemaVersion: 1, coordinateSpace: BODY_ANCHOR_COORDINATE_SPACE,
    anchors: Object.freeze({ leftShoulder:[0.2,0.12], rightShoulder:[0.8,0.12], leftHip:[0.27,0.76], rightHip:[0.73,0.76] }),
  });
}

test('production Core composes F4b.4 stores/services but closed policy publishes no ticket, layer, cloud call or Billing side effect', async t => {
  const pool = new Pool({ connectionString: databaseUrl, max: 8, application_name: 'bers-f4b4-production-closed' });
  // The workflow applies/checks the transaction migration from its canonical source
  // before this esbuild-bundled test. Re-running that file-backed migrator from the
  // bundle would incorrectly resolve migrations relative to .test-cache.
  await migrateMaskArtifactSchema(pool);
  await migrateImageArtifactSchema(pool);
  await migrateProjectSchema(pool);
  await pool.query('TRUNCATE canonical_projects,canonical_project_history,canonical_project_versions,canonical_image_artifacts,canonical_mask_artifacts,transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE');
  t.after(async () => {
    await pool.query('TRUNCATE canonical_fashion_garment_warp_layers,canonical_project_body_anchor_sets,canonical_garment_representations,canonical_garment_views,canonical_garments,local_execution_uploads,local_execution_tickets,canonical_projects,canonical_project_history,canonical_project_versions,canonical_image_artifacts,canonical_mask_artifacts,transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE').catch(() => undefined);
    await pool.end();
  });

  let providerCalls = 0;
  const forbiddenFetcher: typeof fetch = async () => { providerCalls += 1; throw new Error('closed F4b.4 composition must never call an external provider'); };
  const production = await createProductionCore(config, { fetcher: forbiddenFetcher, now: () => 50_000 });
  t.after(async () => { await production.close().catch(() => undefined); });
  assert.ok(production.localExecution.garmentMeshWarp, 'production Core must compose the F4b.4 execution service');
  assert.ok(production.localExecution.garmentMeshWarpInputDelivery, 'production Core must compose purpose-bound input delivery');

  const project = await production.projects.create(owner, 'F4b.4 closed person', await image(96, 128, 1), projectLimits);
  const projectId = String(project.project_id).toLowerCase();
  const scope = Object.freeze({ ...owner, projectId });
  const sourceStorageId = String(project.current_image_storage_id).toLowerCase();
  const sourceArtifactId = production.artifacts.external.issueStoredOriginal(sourceStorageId, scope);

  const garments = new PostgresGarmentStore(pool);
  const wardrobe = new PostgresGarmentWardrobeStore(pool);
  const representations = new PostgresGarmentRepresentationStore(pool);
  let garment = await garments.createWithInitialView(owner, { name: 'F4b.4 closed shirt', viewKind: 'FRONT', sourceContentType: 'image/png', bytes: await image(64, 80, 2) }, garmentLimits);
  await wardrobe.updateMetadata(owner, garment.id, garment.revision, { category: 'tshirts' });
  garment = (await garments.get(owner, garment.id))!;
  const admitted = await representations.admit(owner, garment.id, garment.revision, {
    tier: 'PARAMETRIC', generatorId: 'local.mesh-fit', generatorVersion: '1.0.0', sourceViewIds: [garment.primaryViewId], payload: parametric(),
  });
  const anchorsStore = new PostgresProjectBodyAnchorStore(pool);
  const anchor = await anchorsStore.create(owner, projectId, { payload: anchors(), producerId: 'local.pose-anchor', producerVersion: '1.0.0' });

  assert.equal(Number((await pool.query('SELECT count(*)::int AS count FROM local_execution_tickets')).rows[0].count), 0);
  assert.equal(Number((await pool.query('SELECT count(*)::int AS count FROM canonical_fashion_garment_warp_layers')).rows[0].count), 0);
  await assert.rejects(
    () => production.localExecution.garmentMeshWarp.prepare({
      projectId, sourceArtifactId, garmentId: garment.id, representationId: admitted.representation.id, anchorSetId: anchor.id, clientRequestId: 'f4b4-production-still-closed',
    }, owner),
    (error: any) => error?.code === 'garment_mesh_warp_plan_blocked' || /Unsupported production execution route|BLOCKED|garment mesh-warp plan/i.test(String(error?.message)),
    'production composition must remain fail-closed until route/target/capability/executor admission lands',
  );
  assert.equal(Number((await pool.query('SELECT count(*)::int AS count FROM local_execution_tickets')).rows[0].count), 0, 'closed production policy must not mint a durable ticket');
  assert.equal(Number((await pool.query('SELECT count(*)::int AS count FROM canonical_fashion_garment_warp_layers')).rows[0].count), 0, 'closed production policy must not persist a Fashion layer');
  assert.equal(Number((await pool.query('SELECT count(*)::int AS count FROM local_execution_uploads')).rows[0].count), 0, 'closed production policy must not accept candidate bytes');
  assert.equal(providerCalls, 0);
  assert.equal(Number((await pool.query('SELECT count(*)::int AS count FROM credit_reservations')).rows[0].count), 0);
});
