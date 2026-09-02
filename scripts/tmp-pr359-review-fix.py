from pathlib import Path


def replace_one(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one replacement target, found {count}')
    target.write_text(text.replace(old, new, 1))


store = 'server/core/fashion/postgresGarmentRepresentationStore.ts'
authority = 'server/core/localExecution/ManagedGarmentLocalExecutionInputAuthority.ts'
acceptance = 'tests/fashion-manual-parametric-admission-f4b6c1a-postgres.test.ts'

replace_one(
    store,
    """export type ManualParametricGarmentAdmissionResult = Readonly<{
  garmentRevision: number;
  representationTier: 'PARAMETRIC' | 'FULL_3D';
  representation: ManagedGarmentRepresentation;
  replayed: boolean;
}>;

const UUID_PATTERN""",
    """export type ManualParametricGarmentAdmissionResult = Readonly<{
  garmentRevision: number;
  representationTier: 'PARAMETRIC' | 'FULL_3D';
  representation: ManagedGarmentRepresentation;
  replayed: boolean;
}>;

export type ManagedGarmentExecutionRepresentationResolution =
  | Readonly<{ status: 'UNAVAILABLE' }>
  | Readonly<{ status: 'GARMENT_NOT_ACTIVE' }>
  | Readonly<{ status: 'REPRESENTATION_NOT_ADMITTED' }>
  | Readonly<{ status: 'BASIS_NOT_CURRENT' }>
  | Readonly<{
      status: 'READY';
      representation: ManagedGarmentRepresentation;
      payload: Readonly<{
        bytes: Uint8Array;
        contentType: ManagedGarmentRepresentation['contentType'];
        contentSha256: string;
      }>;
    }>;

const UUID_PATTERN""",
)

replace_one(
    store,
    """      if (garment.category === 'other') {
        throw httpError(409, 'garment_representation_category_requires_classification', 'Garment must be classified before an advanced representation can be admitted');
      }

      const sources = await loadSourceViews(client, scope, garmentId, [garment.primaryViewId]);""",
    """      if (garment.category === 'other') {
        throw httpError(409, 'garment_representation_category_requires_classification', 'Garment must be classified before an advanced representation can be admitted');
      }
      if (expectedRevision > garment.revision) throw revisionConflict();

      const sources = await loadSourceViews(client, scope, garmentId, [garment.primaryViewId]);""",
)

replace_one(
    store,
    """  async loadPayload(
    scope: GarmentOwnerScope,""",
    """  async resolveCurrentExecutionRepresentation(
    scope: GarmentOwnerScope,
    garmentIdValue: string,
    representationIdValue: string,
  ): Promise<ManagedGarmentExecutionRepresentationResolution> {
    if (!isUuid(garmentIdValue) || !isUuid(representationIdValue)) {
      return Object.freeze({ status: 'UNAVAILABLE' });
    }
    const garmentId = garmentIdValue.toLowerCase();
    const representationId = representationIdValue.toLowerCase();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const garment = await lockGarment(client, scope, garmentId);
      let resolution: ManagedGarmentExecutionRepresentationResolution = Object.freeze({ status: 'UNAVAILABLE' });
      if (garment) {
        if (garment.status !== 'ACTIVE') {
          resolution = Object.freeze({ status: 'GARMENT_NOT_ACTIVE' });
        } else {
          const row = await loadRepresentationRow(client, scope, garmentId, representationId);
          if (row) {
            const representation = fromRepresentationRow(row);
            if (representation.admissionState !== 'ADMITTED') {
              resolution = Object.freeze({ status: 'REPRESENTATION_NOT_ADMITTED' });
            } else if (representation.basisViewId !== garment.primaryViewId) {
              resolution = Object.freeze({ status: 'BASIS_NOT_CURRENT' });
            } else {
              resolution = Object.freeze({
                status: 'READY',
                representation,
                payload: Object.freeze({
                  bytes: new Uint8Array(row.representation_bytes),
                  contentType: normalizeStoredContentType(row.content_type),
                  contentSha256: String(row.content_sha256),
                }),
              });
            }
          }
        }
      }
      await client.query('COMMIT');
      return resolution;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async loadPayload(
    scope: GarmentOwnerScope,""",
)

replace_one(
    authority,
    "type RepresentationReader = Pick<PostgresGarmentRepresentationStore, 'get' | 'loadPayload'>;",
    "type RepresentationReader = Pick<PostgresGarmentRepresentationStore, 'resolveCurrentExecutionRepresentation'>;",
)

replace_one(
    authority,
    """    const garmentId = normalizeUuid(garmentIdValue);
    const representationId = normalizeUuid(representationIdValue);
    const garment = await this.dependencies.garments.get(scope, garmentId);
    if (!garment) throw unavailable();
    if (garment.status !== 'ACTIVE') throw stateMismatch('Managed Garment is not active');
    const representation = await this.dependencies.representations.get(scope, garmentId, representationId);
    if (!representation) throw unavailable();
    if (representation.admissionState !== 'ADMITTED') throw stateMismatch('Managed Garment representation is not admitted');
    if (representation.basisViewId.toLowerCase() !== garment.primaryViewId.toLowerCase()) {
      throw stateMismatch('Managed Garment representation basis view is no longer current');
    }
    const payload = await this.dependencies.representations.loadPayload(scope, garmentId, representationId);
    if (!payload) throw unavailable();
    const bytes = Uint8Array.from(payload.bytes);""",
    """    const garmentId = normalizeUuid(garmentIdValue);
    const representationId = normalizeUuid(representationIdValue);
    const current = await this.dependencies.representations.resolveCurrentExecutionRepresentation(scope, garmentId, representationId);
    if (current.status === 'UNAVAILABLE') throw unavailable();
    if (current.status === 'GARMENT_NOT_ACTIVE') throw stateMismatch('Managed Garment is not active');
    if (current.status === 'REPRESENTATION_NOT_ADMITTED') throw stateMismatch('Managed Garment representation is not admitted');
    if (current.status === 'BASIS_NOT_CURRENT') throw stateMismatch('Managed Garment representation basis view is no longer current');
    const { representation, payload } = current;
    const bytes = Uint8Array.from(payload.bytes);""",
)

replace_one(
    acceptance,
    """    assert.equal((await garments.get(owner, garment.id))!.revision, admitted.garmentRevision);

    const key = await pool.query""",
    """    assert.equal((await garments.get(owner, garment.id))!.revision, admitted.garmentRevision);

    await expectCode(
      service.admit(owner, { garmentId: garment.id, expectedRevision: admitted.garmentRevision + 1, contour }),
      'garment_revision_conflict',
    );
    assert.equal((await garments.get(owner, garment.id))!.revision, admitted.garmentRevision);

    const key = await pool.query""",
)

race_test = """
test('F4b.6c.1a managed representation resolution serializes with primary mutation before returning bytes', async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let mutation: PoolClient | undefined;
  try {
    await reset(pool);
    const garments = new PostgresGarmentStore(pool);
    const wardrobe = new PostgresGarmentWardrobeStore(pool);
    const representations = new PostgresGarmentRepresentationStore(pool);
    const service = new ManualParametricGarmentAdmissionService(representations);
    let garment = await classifiedGarment(garments, wardrobe, 'execution race');
    garment = await appendView(garments, garment.id, garment.revision, 67);
    const originalPrimary = garment.primaryViewId;
    const nextPrimary = garment.views.find(view => view.id !== originalPrimary)!.id;
    const admitted = await service.admit(owner, { garmentId: garment.id, expectedRevision: garment.revision, contour });
    assert.equal(admitted.representation.basisViewId, originalPrimary);

    mutation = await pool.connect();
    await mutation.query('BEGIN');
    await switchPrimary(mutation, garment.id, nextPrimary);

    const authority = new ManagedGarmentLocalExecutionInputAuthority({ garments, representations });
    let settled = false;
    const resolution = authority.bindParametricRepresentation(owner, garment.id, admitted.representation.id)
      .finally(() => { settled = true; });
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(settled, false, 'managed representation resolution must block behind the canonical Garment row lock');

    await mutation.query('COMMIT');
    mutation.release();
    mutation = undefined;

    await expectCode(resolution, 'managed_garment_input_state_mismatch');
    const current = (await garments.get(owner, garment.id))!;
    assert.equal(current.primaryViewId, nextPrimary);
  } finally {
    mutation?.release();
    await pool.end();
  }
});

"""

replace_one(
    acceptance,
    "test('F4b.6c.1a hash collision and conflicting producer provenance fail closed before replay', async () => {",
    race_test + "test('F4b.6c.1a hash collision and conflicting producer provenance fail closed before replay', async () => {",
)
