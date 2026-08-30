import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { migrateGarmentSchema } from '../server/core/fashion/garmentSchema.ts';
import { PostgresGarmentStore } from '../server/core/fashion/postgresGarmentStore.ts';
import { PostgresGarmentWardrobeStore } from '../server/core/fashion/postgresGarmentWardrobeStore.ts';
import { PostgresGarmentRepresentationStore } from '../server/core/fashion/postgresGarmentRepresentationStore.ts';
import { ManagedGarmentLocalExecutionInputAuthority } from '../server/core/localExecution/ManagedGarmentLocalExecutionInputAuthority.ts';
import { PostgresLocalExecutionLedger } from '../server/core/localExecution/PostgresLocalExecutionLedger.ts';
import { LocalExecutionTicketAuthority } from '../server/core/localExecution/LocalExecutionTicketAuthority.ts';
import type { LocalExecutionManagedGarmentInputBinding, LocalExecutionTicketV2 } from '../src/platform/creative/canonical/localExecution.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for F4b.2 managed Garment local-execution acceptance');

const owner = Object.freeze({ tenantId: 'f4b2-tenant-a', userId: 'f4b2-user-a' });
const foreignOwner = Object.freeze({ tenantId: 'f4b2-tenant-a', userId: 'f4b2-user-b' });
const projectScope = Object.freeze({ ...owner, projectId: 'f4b2-project-a' });
const limits = Object.freeze({ maxUploadBytes: 2 * 1024 * 1024, maxDimension: 600, maxPixels: 400_000 });
const capability = 'local:tool:f4b2-managed-input-contract:v1';

async function image(seed: number): Promise<Uint8Array> {
  return new Uint8Array(await sharp({ create: { width: 96, height: 128, channels: 4, background: { r: 30 + seed, g: 80 + seed, b: 130 + seed, alpha: 1 } } }).png().toBuffer());
}
function parametricPayload(): unknown {
  return Object.freeze({
    schemaVersion: 1,
    coordinateSpace: 'PRIMARY_VIEW_NORMALIZED',
    points: Object.freeze([Object.freeze([0.1, 0.1]), Object.freeze([0.9, 0.1]), Object.freeze([0.9, 0.9]), Object.freeze([0.1, 0.9])]),
    triangles: Object.freeze([Object.freeze([0, 1, 2]), Object.freeze([0, 2, 3])]),
    outline: Object.freeze([0, 1, 2, 3]),
  });
}
function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }

async function resetGarments(pool: Pool): Promise<void> {
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

function expectManagedCode(code: string) {
  return (cause: any): boolean => {
    assert.equal(cause?.code, code);
    assert.equal(cause?.status, 409);
    return true;
  };
}

function issueRequest(idempotencyKey: string, managedInputs?: readonly LocalExecutionManagedGarmentInputBinding[]) {
  return Object.freeze({
    ticketVersion: '2' as const,
    requestId: 'f4b2-request', workflowId: 'f4b2-workflow', stepId: 'f4b2-managed-input-contract',
    operation: Object.freeze({ id: 'f4b2-managed-input-contract', version: '1', type: 'F4B2_MANAGED_INPUT_CONTRACT', capability }),
    scope: projectScope,
    inputs: Object.freeze([Object.freeze({ artifactId: 'f4b2-project-image', kind: 'image', role: 'ORIGINAL' as const, sha256: '7'.repeat(64) })]),
    ...(managedInputs === undefined ? {} : { managedInputs }),
    expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'COMPOSITE' as const, count: 1, mimeTypes: Object.freeze(['image/png']) })]),
    policy: 'LOCAL_ONLY' as const,
    idempotencyKey,
  });
}

test('F4b.2 PostgreSQL binds, persists and revalidates managed Garment evidence without widening Project inputs', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4, application_name: 'bers-f4b2-managed-inputs' });
  try {
    await resetGarments(pool);
    await pool.query(`DELETE FROM local_execution_tickets WHERE tenant_id=$1 AND user_id IN ($2,$3)`, [owner.tenantId, owner.userId, foreignOwner.userId]);

    const garments = new PostgresGarmentStore(pool);
    const wardrobe = new PostgresGarmentWardrobeStore(pool);
    const representations = new PostgresGarmentRepresentationStore(pool);

    let garment = await garments.createWithInitialView(owner, {
      name: 'F4b.2 managed shirt', viewKind: 'FRONT', sourceContentType: 'image/png', bytes: await image(1),
    }, limits);
    const metadata = await wardrobe.updateMetadata(owner, garment.id, garment.revision, { category: 'tshirts' });
    garment = (await garments.get(owner, garment.id))!;
    assert.equal(garment.revision, metadata.revision);

    const admitted = await representations.admit(owner, garment.id, garment.revision, {
      tier: 'PARAMETRIC', generatorId: 'local.mesh-fit', generatorVersion: '1.0.0', sourceViewIds: [garment.primaryViewId], payload: parametricPayload(),
    });
    garment = (await garments.get(owner, garment.id))!;
    assert.equal(garment.revision, admitted.garmentRevision);

    const managedAuthority = new ManagedGarmentLocalExecutionInputAuthority({ garments, representations });
    const viewBinding = await managedAuthority.bindView(owner, garment.id, garment.primaryViewId);
    const representationBinding = await managedAuthority.bindParametricRepresentation(owner, garment.id, admitted.representation.id);
    assert.equal(viewBinding.contentSha256, (await garments.loadView(owner, garment.id, garment.primaryViewId))?.contentSha256);
    assert.equal(representationBinding.contentSha256, admitted.representation.contentSha256);

    const ledger = new PostgresLocalExecutionLedger(pool);
    const ticketAuthority = new LocalExecutionTicketAuthority(ledger, {
      now: () => 10_000,
      id: randomUUID,
      nonce: randomUUID,
      ttlMs: 60_000,
      modelsByCapability: {},
      executorsByCapability: Object.freeze({ [capability]: Object.freeze([Object.freeze({ kind: 'DETERMINISTIC_TOOL', toolId: 'f4b2-contract', version: '1' })]) }),
    });

    const legacy = await ticketAuthority.issue(issueRequest('f4b2-legacy-no-managed-inputs'));
    assert.equal(Object.hasOwn(legacy, 'managedInputs'), false);
    const legacyJson = await pool.query(`SELECT ticket_json ? 'managedInputs' AS has_managed FROM local_execution_tickets WHERE ticket_id=$1`, [legacy.ticketId]);
    assert.equal(legacyJson.rows[0]?.has_managed, false, 'old v2 durable JSON must not synthesize managedInputs');

    const issued = await ticketAuthority.issue(issueRequest('f4b2-managed-inputs', Object.freeze([viewBinding, representationBinding])));
    assert.equal(issued.managedInputs?.length, 2);
    const durableJson = await pool.query(`SELECT ticket_json ? 'managedInputs' AS has_managed FROM local_execution_tickets WHERE ticket_id=$1`, [issued.ticketId]);
    assert.equal(durableJson.rows[0]?.has_managed, true);

    const restartedLedger = new PostgresLocalExecutionLedger(pool);
    const restartedTicket = await restartedLedger.getV2(issued.ticketId);
    assert.deepEqual(restartedTicket, issued, 'managedInputs must survive Core ledger restart exactly');
    const restartedAuthority = new ManagedGarmentLocalExecutionInputAuthority({
      garments: new PostgresGarmentStore(pool),
      representations: new PostgresGarmentRepresentationStore(pool),
    });
    const revalidated = await restartedAuthority.revalidateTicket(restartedTicket!);
    assert.equal(revalidated.length, 2);
    assert.equal(sha256(revalidated[0].bytes), viewBinding.contentSha256);
    assert.equal(sha256(revalidated[1].bytes), representationBinding.contentSha256);

    const changedView = Object.freeze({ ...viewBinding, contentSha256: '8'.repeat(64) }) satisfies LocalExecutionManagedGarmentInputBinding;
    await assert.rejects(
      ticketAuthority.issue(issueRequest('f4b2-managed-inputs', Object.freeze([changedView, representationBinding]))),
      /idempotency key already bound to another execution/i,
      'durable idempotency must bind managedInputs',
    );

    const wrongScope = Object.freeze({ ...issued, scope: Object.freeze({ tenantId: owner.tenantId, userId: foreignOwner.userId, projectId: issued.scope.projectId }) }) as LocalExecutionTicketV2;
    await assert.rejects(restartedAuthority.revalidateTicket(wrongScope), expectManagedCode('managed_garment_input_unavailable'));

    const wrongGarment = Object.freeze({ ...issued, managedInputs: Object.freeze([
      Object.freeze({ ...viewBinding, garmentId: randomUUID().toLowerCase() }), representationBinding,
    ]) }) as LocalExecutionTicketV2;
    await assert.rejects(restartedAuthority.revalidateTicket(wrongGarment), expectManagedCode('managed_garment_input_unavailable'));

    const wrongHash = Object.freeze({ ...issued, managedInputs: Object.freeze([
      Object.freeze({ ...viewBinding, contentSha256: '9'.repeat(64) }), representationBinding,
    ]) }) as LocalExecutionTicketV2;
    await assert.rejects(restartedAuthority.revalidateTicket(wrongHash), expectManagedCode('managed_garment_input_authority_mismatch'));

    const wrongProvenance = Object.freeze({ ...issued, managedInputs: Object.freeze([
      viewBinding, Object.freeze({ ...representationBinding, generatorVersion: 'tampered-generator' }),
    ]) }) as LocalExecutionTicketV2;
    await assert.rejects(restartedAuthority.revalidateTicket(wrongProvenance), expectManagedCode('managed_garment_input_authority_mismatch'));

    const wrongFormat = Object.freeze({ ...issued, managedInputs: Object.freeze([
      viewBinding,
      Object.freeze({
        ...representationBinding,
        tier: 'FULL_3D',
        format: 'GLB_2_0',
        contentType: 'model/gltf-binary',
      } as const),
    ]) }) as LocalExecutionTicketV2;
    await assert.rejects(restartedAuthority.revalidateTicket(wrongFormat), expectManagedCode('managed_garment_input_authority_mismatch'));

    const revoked = await representations.revoke(owner, garment.id, admitted.representation.id, garment.revision);
    garment = (await garments.get(owner, garment.id))!;
    assert.equal(garment.revision, revoked.garmentRevision);
    await assert.rejects(restartedAuthority.revalidateTicket(issued), expectManagedCode('managed_garment_input_state_mismatch'));

    const deletedRevision = await wardrobe.delete(owner, garment.id, garment.revision);
    assert.equal(deletedRevision, garment.revision + 1);
    await assert.rejects(restartedAuthority.revalidateTicket(issued), expectManagedCode('managed_garment_input_unavailable'));
  } finally {
    await pool.query(`DELETE FROM local_execution_tickets WHERE tenant_id=$1 AND user_id IN ($2,$3)`, [owner.tenantId, owner.userId, foreignOwner.userId]).catch(() => undefined);
    await pool.end();
  }
});
