import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { GarmentOwnerScope } from './postgresGarmentStore.ts';

export type ManagedGarmentCollection = Readonly<{
  id: string;
  name: string;
  description: string;
  revision: number;
  garmentIds: readonly string[];
  createdAt: string;
  updatedAt: string;
}>;

export type ManagedGarmentCollectionMove = Readonly<{
  source: ManagedGarmentCollection;
  target: ManagedGarmentCollection;
  targetChanged: boolean;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATCH_KEYS = new Set(['name', 'description']);

export class PostgresGarmentCollectionStore {
  constructor(private readonly pool: Pool, private readonly nextId: () => string = randomUUID) {}

  async create(
    scope: GarmentOwnerScope,
    input: Readonly<{ name: unknown; description?: unknown }>,
  ): Promise<ManagedGarmentCollection> {
    const name = normalizeName(input.name);
    const description = normalizeDescription(input.description ?? '');
    const collectionId = requireCollectionId(this.nextId());
    const result = await this.pool.query(`INSERT INTO canonical_garment_collections
      (collection_id,tenant_id,user_id,name,description,revision)
      VALUES ($1,$2,$3,$4,$5,1)
      RETURNING collection_id`, [collectionId, scope.tenantId, scope.userId, name, description]);
    if (result.rowCount !== 1) throw new Error('Managed Garment Collection creation did not insert one aggregate');
    const created = await this.get(scope, collectionId);
    if (!created) throw new Error('Managed Garment Collection creation committed but could not be reloaded');
    return created;
  }

  async list(scope: GarmentOwnerScope): Promise<readonly ManagedGarmentCollection[]> {
    const result = await this.pool.query(`${COLLECTION_SELECT}
      WHERE c.tenant_id=$1 AND c.user_id=$2 AND c.deleted_at IS NULL
      ORDER BY c.updated_at DESC,c.collection_id`, [scope.tenantId, scope.userId]);
    return Object.freeze(result.rows.map(fromRow));
  }

  async get(scope: GarmentOwnerScope, collectionId: string): Promise<ManagedGarmentCollection | undefined> {
    const canonicalCollectionId = normalizeUuid(collectionId);
    if (!canonicalCollectionId) return undefined;
    const result = await this.pool.query(`${COLLECTION_SELECT}
      WHERE c.collection_id=$1 AND c.tenant_id=$2 AND c.user_id=$3 AND c.deleted_at IS NULL`,
    [canonicalCollectionId, scope.tenantId, scope.userId]);
    return result.rows[0] ? fromRow(result.rows[0]) : undefined;
  }

  async updateMetadata(
    scope: GarmentOwnerScope,
    collectionId: string,
    expectedRevision: number,
    rawPatch: unknown,
  ): Promise<ManagedGarmentCollection> {
    const canonicalCollectionId = requireCollectionMutation(collectionId, expectedRevision);
    const patch = normalizePatch(rawPatch);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await lockedCollection(client, scope, canonicalCollectionId);
      if (!current) throw collectionNotFound();
      if (current.revision !== expectedRevision) throw collectionRevisionConflict();
      const nextName = patch.name ?? current.name;
      const nextDescription = patch.description ?? current.description;
      if (nextName === current.name && nextDescription === current.description) {
        await client.query('COMMIT');
        return current;
      }
      await bumpCollection(client, scope, canonicalCollectionId, expectedRevision, {
        name: nextName,
        description: nextDescription,
      });
      const snapshot = await selectCollection(client, scope, canonicalCollectionId);
      if (!snapshot || snapshot.revision !== expectedRevision + 1) {
        throw new Error('Managed Garment Collection metadata mutation did not produce its expected revision');
      }
      await client.query('COMMIT');
      return snapshot;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async delete(scope: GarmentOwnerScope, collectionId: string, expectedRevision: number): Promise<number> {
    const canonicalCollectionId = requireCollectionMutation(collectionId, expectedRevision);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await lockedCollection(client, scope, canonicalCollectionId);
      if (!current) throw collectionNotFound();
      if (current.revision !== expectedRevision) throw collectionRevisionConflict();
      const updated = await client.query(`UPDATE canonical_garment_collections
        SET revision=revision+1,updated_at=CURRENT_TIMESTAMP,deleted_at=CURRENT_TIMESTAMP
        WHERE collection_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL AND revision=$4
        RETURNING revision`, [canonicalCollectionId, scope.tenantId, scope.userId, expectedRevision]);
      const revision = Number(updated.rows[0]?.revision);
      if (updated.rowCount !== 1 || revision !== expectedRevision + 1) throw collectionRevisionConflict();
      await client.query('COMMIT');
      return revision;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async addGarment(
    scope: GarmentOwnerScope,
    collectionId: string,
    expectedRevision: number,
    garmentId: string,
  ): Promise<ManagedGarmentCollection> {
    const canonicalCollectionId = requireCollectionMutation(collectionId, expectedRevision);
    const canonicalGarmentId = requireGarmentId(garmentId);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await lockedCollection(client, scope, canonicalCollectionId);
      if (!current) throw collectionNotFound();
      if (current.revision !== expectedRevision) throw collectionRevisionConflict();
      await lockAvailableGarment(client, scope, canonicalGarmentId);
      if (await membershipExists(client, scope, canonicalCollectionId, canonicalGarmentId)) {
        await client.query('COMMIT');
        return current;
      }
      await client.query(`INSERT INTO canonical_garment_collection_members
        (collection_id,garment_id,tenant_id,user_id) VALUES ($1,$2,$3,$4)`,
      [canonicalCollectionId, canonicalGarmentId, scope.tenantId, scope.userId]);
      await bumpCollection(client, scope, canonicalCollectionId, expectedRevision);
      const snapshot = await selectCollection(client, scope, canonicalCollectionId);
      if (!snapshot || snapshot.revision !== expectedRevision + 1 || !snapshot.garmentIds.includes(canonicalGarmentId)) {
        throw new Error('Managed Garment Collection add did not produce its expected membership');
      }
      await client.query('COMMIT');
      return snapshot;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async removeGarment(
    scope: GarmentOwnerScope,
    collectionId: string,
    expectedRevision: number,
    garmentId: string,
  ): Promise<ManagedGarmentCollection> {
    const canonicalCollectionId = requireCollectionMutation(collectionId, expectedRevision);
    const canonicalGarmentId = requireGarmentId(garmentId);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await lockedCollection(client, scope, canonicalCollectionId);
      if (!current) throw collectionNotFound();
      if (current.revision !== expectedRevision) throw collectionRevisionConflict();
      const removed = await client.query(`DELETE FROM canonical_garment_collection_members
        WHERE collection_id=$1 AND garment_id=$2 AND tenant_id=$3 AND user_id=$4
        RETURNING garment_id`, [canonicalCollectionId, canonicalGarmentId, scope.tenantId, scope.userId]);
      if (removed.rowCount === 0) {
        await client.query('COMMIT');
        return current;
      }
      await bumpCollection(client, scope, canonicalCollectionId, expectedRevision);
      const snapshot = await selectCollection(client, scope, canonicalCollectionId);
      if (!snapshot || snapshot.revision !== expectedRevision + 1 || snapshot.garmentIds.includes(canonicalGarmentId)) {
        throw new Error('Managed Garment Collection remove did not produce its expected membership');
      }
      await client.query('COMMIT');
      return snapshot;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async moveGarment(
    scope: GarmentOwnerScope,
    input: Readonly<{
      garmentId: string;
      sourceCollectionId: string;
      targetCollectionId: string;
      expectedSourceRevision: number;
      expectedTargetRevision: number;
    }>,
  ): Promise<ManagedGarmentCollectionMove> {
    const sourceCollectionId = requireCollectionMutation(input.sourceCollectionId, input.expectedSourceRevision);
    const targetCollectionId = requireCollectionMutation(input.targetCollectionId, input.expectedTargetRevision);
    const garmentId = requireGarmentId(input.garmentId);
    if (sourceCollectionId === targetCollectionId) {
      throw httpError(400, 'collection_move_same_target', 'Source and target collections must be different');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const locked = await lockCollectionPair(client, scope, sourceCollectionId, targetCollectionId);
      if (locked.size !== 2) throw collectionNotFound();
      const sourceRevision = locked.get(sourceCollectionId);
      const targetRevision = locked.get(targetCollectionId);
      if (sourceRevision !== input.expectedSourceRevision || targetRevision !== input.expectedTargetRevision) {
        throw collectionRevisionConflict();
      }

      await lockAvailableGarment(client, scope, garmentId);
      const inSource = await membershipExists(client, scope, sourceCollectionId, garmentId);
      if (!inSource) throw httpError(409, 'garment_not_in_source_collection', 'Garment is not a member of the source collection');
      const inTarget = await membershipExists(client, scope, targetCollectionId, garmentId);

      const removed = await client.query(`DELETE FROM canonical_garment_collection_members
        WHERE collection_id=$1 AND garment_id=$2 AND tenant_id=$3 AND user_id=$4
        RETURNING garment_id`,
      [sourceCollectionId, garmentId, scope.tenantId, scope.userId]);
      if (removed.rowCount !== 1) throw new Error('Managed Garment Collection move lost its locked source membership');

      if (!inTarget) {
        await client.query(`INSERT INTO canonical_garment_collection_members
          (collection_id,garment_id,tenant_id,user_id) VALUES ($1,$2,$3,$4)`,
        [targetCollectionId, garmentId, scope.tenantId, scope.userId]);
      }

      await bumpCollection(client, scope, sourceCollectionId, input.expectedSourceRevision);
      if (!inTarget) await bumpCollection(client, scope, targetCollectionId, input.expectedTargetRevision);

      const source = await selectCollection(client, scope, sourceCollectionId);
      const target = await selectCollection(client, scope, targetCollectionId);
      if (!source || !target
        || source.revision !== input.expectedSourceRevision + 1
        || source.garmentIds.includes(garmentId)
        || target.revision !== input.expectedTargetRevision + (inTarget ? 0 : 1)
        || !target.garmentIds.includes(garmentId)) {
        throw new Error('Managed Garment Collection move did not produce its expected atomic snapshots');
      }
      await client.query('COMMIT');
      return Object.freeze({ source, target, targetChanged: !inTarget });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

// Membership is durable Collection state. A soft-deleted Garment remains as a
// historical member until the Collection itself removes it, so Collection
// snapshots never change behind the Collection revision contract.
const COLLECTION_SELECT = `SELECT
  c.collection_id,c.name,c.description,c.revision,c.created_at,c.updated_at,
  COALESCE((SELECT jsonb_agg(m.garment_id ORDER BY m.created_at,m.garment_id)
    FROM canonical_garment_collection_members m
    WHERE m.collection_id=c.collection_id AND m.tenant_id=c.tenant_id AND m.user_id=c.user_id), '[]'::jsonb) AS garment_ids
  FROM canonical_garment_collections c`;

async function lockedCollection(
  client: PoolClient,
  scope: GarmentOwnerScope,
  collectionId: string,
): Promise<ManagedGarmentCollection | undefined> {
  const lock = await client.query(`SELECT collection_id FROM canonical_garment_collections
    WHERE collection_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL FOR UPDATE`,
  [collectionId, scope.tenantId, scope.userId]);
  if (!lock.rows[0]) return undefined;
  return selectCollection(client, scope, collectionId);
}

async function lockCollectionPair(
  client: PoolClient,
  scope: GarmentOwnerScope,
  sourceCollectionId: string,
  targetCollectionId: string,
): Promise<ReadonlyMap<string, number>> {
  const result = await client.query(`SELECT collection_id,revision FROM canonical_garment_collections
    WHERE collection_id = ANY($1::uuid[]) AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL
    ORDER BY collection_id FOR UPDATE`,
  [[sourceCollectionId, targetCollectionId], scope.tenantId, scope.userId]);
  return new Map(result.rows.map(row => [String(row.collection_id).toLowerCase(), Number(row.revision)]));
}

async function lockAvailableGarment(client: PoolClient, scope: GarmentOwnerScope, garmentId: string): Promise<void> {
  const result = await client.query(`SELECT garment_id FROM canonical_garments
    WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL FOR SHARE`,
  [garmentId, scope.tenantId, scope.userId]);
  if (!result.rows[0]) throw garmentNotFound();
}

async function membershipExists(
  client: PoolClient,
  scope: GarmentOwnerScope,
  collectionId: string,
  garmentId: string,
): Promise<boolean> {
  const result = await client.query(`SELECT 1 FROM canonical_garment_collection_members
    WHERE collection_id=$1 AND garment_id=$2 AND tenant_id=$3 AND user_id=$4`,
  [collectionId, garmentId, scope.tenantId, scope.userId]);
  return Boolean(result.rows[0]);
}

async function selectCollection(
  client: PoolClient,
  scope: GarmentOwnerScope,
  collectionId: string,
): Promise<ManagedGarmentCollection | undefined> {
  const result = await client.query(`${COLLECTION_SELECT}
    WHERE c.collection_id=$1 AND c.tenant_id=$2 AND c.user_id=$3 AND c.deleted_at IS NULL`,
  [collectionId, scope.tenantId, scope.userId]);
  return result.rows[0] ? fromRow(result.rows[0]) : undefined;
}

async function bumpCollection(
  client: PoolClient,
  scope: GarmentOwnerScope,
  collectionId: string,
  expectedRevision: number,
  metadata?: Readonly<{ name: string; description: string }>,
): Promise<void> {
  const result = metadata
    ? await client.query(`UPDATE canonical_garment_collections
        SET name=$4,description=$5,revision=revision+1,updated_at=CURRENT_TIMESTAMP
        WHERE collection_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL AND revision=$6
        RETURNING revision`,
      [collectionId, scope.tenantId, scope.userId, metadata.name, metadata.description, expectedRevision])
    : await client.query(`UPDATE canonical_garment_collections
        SET revision=revision+1,updated_at=CURRENT_TIMESTAMP
        WHERE collection_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL AND revision=$4
        RETURNING revision`,
      [collectionId, scope.tenantId, scope.userId, expectedRevision]);
  if (result.rowCount !== 1 || Number(result.rows[0]?.revision) !== expectedRevision + 1) throw collectionRevisionConflict();
}

function normalizePatch(value: unknown): Readonly<{ name?: string; description?: string }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw httpError(400, 'invalid_collection_patch', 'Collection patch must be a JSON object');
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0 || keys.some(key => !PATCH_KEYS.has(key))) {
    throw httpError(400, 'invalid_collection_patch', 'Collection patch contains no supported fields or includes unknown fields');
  }
  return Object.freeze({
    ...(Object.hasOwn(record, 'name') ? { name: normalizeName(record.name) } : {}),
    ...(Object.hasOwn(record, 'description') ? { description: normalizeDescription(record.description) } : {}),
  });
}

function normalizeName(value: unknown): string {
  if (typeof value !== 'string') throw httpError(400, 'invalid_collection_name', 'Collection name must be a string');
  const name = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (!name || codePointLength(name) > 100 || /[\u0000-\u001f\u007f]/u.test(name)) {
    throw httpError(400, 'invalid_collection_name', 'Collection name must contain 1 to 100 printable characters');
  }
  return name;
}
function normalizeDescription(value: unknown): string {
  if (typeof value !== 'string') throw httpError(400, 'invalid_collection_description', 'Collection description must be a string');
  const description = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (codePointLength(description) > 500 || /[\u0000-\u001f\u007f]/u.test(description)) {
    throw httpError(400, 'invalid_collection_description', 'Collection description must contain at most 500 printable characters');
  }
  return description;
}

function codePointLength(value: string): number { return Array.from(value).length; }

function fromRow(row: any): ManagedGarmentCollection {
  const revision = Number(row.revision);
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Stored Garment Collection revision is invalid');
  const garmentIds = Array.isArray(row.garment_ids) ? row.garment_ids.map((value: unknown) => String(value).toLowerCase()) : [];
  if (garmentIds.some(id => !isUuid(id))) throw new Error('Stored Garment Collection membership contains an invalid Garment ID');
  const id = normalizeUuid(row.collection_id);
  if (!id) throw new Error('Stored Garment Collection ID is invalid');
  return Object.freeze({
    id,
    name: String(row.name),
    description: String(row.description),
    revision,
    garmentIds: Object.freeze(garmentIds),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  });
}

function requireCollectionMutation(collectionId: string, expectedRevision: number): string {
  const canonicalCollectionId = normalizeUuid(collectionId);
  if (!canonicalCollectionId) throw collectionNotFound();
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    throw httpError(400, 'invalid_collection_revision', 'Expected collection revision is invalid');
  }
  return canonicalCollectionId;
}
function requireCollectionId(collectionId: string): string {
  const canonicalCollectionId = normalizeUuid(collectionId);
  if (!canonicalCollectionId) throw collectionNotFound();
  return canonicalCollectionId;
}
function requireGarmentId(garmentId: string): string {
  const canonicalGarmentId = normalizeUuid(garmentId);
  if (!canonicalGarmentId) throw garmentNotFound();
  return canonicalGarmentId;
}
function normalizeUuid(value: unknown): string | undefined {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value.toLowerCase() : undefined;
}
function isUuid(value: unknown): value is string { return normalizeUuid(value) !== undefined; }
function collectionNotFound(): Error & { status: number; code: string } {
  return httpError(404, 'collection_not_found', 'Collection not found');
}
function garmentNotFound(): Error & { status: number; code: string } {
  return httpError(404, 'garment_not_found', 'Garment not found');
}
function collectionRevisionConflict(): Error & { status: number; code: string } {
  return httpError(412, 'collection_revision_conflict', 'Collection revision changed; reload before changing membership or metadata');
}
function httpError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}
