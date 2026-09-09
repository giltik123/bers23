import type { Pool, PoolClient } from 'pg';
import {
  CONTEXT_GRAPH_V1_SCHEMA,
  contextGraphV1Envelope,
  normalizeContextGraphEphemeralV1,
  type ContextGraphEphemeralReferenceV1,
  type ContextGraphV1,
  type ContextGraphV1Envelope,
} from './ContextGraphV1.ts';

export type ContextGraphOwnerScope = Readonly<{ tenantId: string; userId: string }>;

export class ContextGraphReadError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ContextGraphReadError';
    this.status = status;
    this.code = code;
  }
}

export class PostgresContextGraphV1Reader {
  private readonly pool: Pool;
  constructor(pool: Pool) { this.pool = pool; }

  async read(
    scopeValue: ContextGraphOwnerScope,
    projectIdValue: string,
    ephemeralValue: unknown = [],
  ): Promise<ContextGraphV1Envelope> {
    const scope = normalizeScope(scopeValue);
    const projectId = identifier(projectIdValue, 'projectId');
    const ephemeral = normalizeContextGraphEphemeralV1(ephemeralValue);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const graph = await this.readSnapshot(client, scope, projectId, ephemeral);
      await client.query('COMMIT');
      return contextGraphV1Envelope(graph);
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* preserve original failure */ }
      throw error;
    } finally {
      client.release();
    }
  }

  private async readSnapshot(
    client: PoolClient,
    scope: ContextGraphOwnerScope,
    projectId: string,
    ephemeral: readonly ContextGraphEphemeralReferenceV1[],
  ): Promise<ContextGraphV1> {
    const projectResult = await client.query(
      `SELECT
         p.project_id,p.original_image_storage_id,p.current_image_storage_id,p.width,p.height,p.history_cursor_id,
         h.ordinal AS cursor_ordinal,h.image_storage_id AS cursor_image_storage_id,
         a.storage_id,a.role,a.lifecycle,a.width AS source_width,a.height AS source_height,
         a.execution_id,a.operation_id,a.source_image_storage_id,a.producer_operation
       FROM canonical_projects p
       JOIN canonical_project_history h
         ON h.history_id=p.history_cursor_id AND h.project_id=p.project_id
        AND h.tenant_id=p.tenant_id AND h.user_id=p.user_id AND h.retired_at IS NULL
       JOIN canonical_image_artifacts a
         ON a.storage_id=p.current_image_storage_id
        AND a.tenant_id=p.tenant_id AND a.user_id=p.user_id AND a.project_id=p.project_id::text
        AND a.revoked_at IS NULL AND a.deleted_at IS NULL
       WHERE p.project_id=$1 AND p.tenant_id=$2 AND p.user_id=$3 AND p.deleted_at IS NULL`,
      [projectId, scope.tenantId, scope.userId],
    );
    if (projectResult.rowCount !== 1) throw new ContextGraphReadError(404, 'context_graph_project_not_found', 'Project/current source context is unavailable');
    const project = projectResult.rows[0] as Record<string, unknown>;
    if (String(project.cursor_image_storage_id) !== String(project.current_image_storage_id)) {
      throw new ContextGraphReadError(409, 'context_graph_cursor_source_conflict', 'Project cursor and current source differ');
    }

    const historyResult = await client.query(
      `SELECT history_id,ordinal,image_storage_id,source_image_storage_id,kind
       FROM canonical_project_history
       WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND retired_at IS NULL
       ORDER BY ordinal DESC,history_id DESC
       LIMIT 64`,
      [projectId, scope.tenantId, scope.userId],
    );
    if (!historyResult.rows.some(row => String(row.history_id) === String(project.history_cursor_id))) {
      throw new ContextGraphReadError(409, 'context_graph_cursor_outside_window', 'Current Project cursor is outside the bounded active history window');
    }

    const candidatesResult = await client.query(
      `SELECT storage_id,width,height,execution_id,operation_id,source_image_storage_id,producer_operation,
              (storage_id=$4::uuid) AS is_current
       FROM canonical_image_artifacts
       WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3
         AND role='COMPOSITE' AND lifecycle='FINAL' AND revoked_at IS NULL AND deleted_at IS NULL
       ORDER BY created_at DESC,storage_id DESC
       LIMIT 32`,
      [projectId, scope.tenantId, scope.userId, String(project.current_image_storage_id)],
    );

    // Outfit references are read before Garments so the bounded Garment window can
    // prioritize canonical Garments required by the selected bounded Outfits.
    // ARCHIVED is a lifecycle state, not deletion; canonical Fashion list/get keeps
    // archived aggregates addressable, so AE-1.5 preserves them as context too.
    const outfitsResult = await client.query(
      `SELECT outfit_id,revision,status
       FROM canonical_outfits
       WHERE tenant_id=$1 AND user_id=$2 AND deleted_at IS NULL
       ORDER BY outfit_id
       LIMIT 64`,
      [scope.tenantId, scope.userId],
    );
    const outfitIds = outfitsResult.rows.map(row => String(row.outfit_id));
    const entriesResult = outfitIds.length === 0
      ? { rows: [] as Record<string, unknown>[] }
      : await client.query(
          `SELECT entry_id,outfit_id,garment_id,position,layer_role
           FROM canonical_outfit_entries
           WHERE tenant_id=$1 AND user_id=$2 AND outfit_id=ANY($3::uuid[])
           ORDER BY outfit_id,position,entry_id`,
          [scope.tenantId, scope.userId, outfitIds],
        );
    const referencedGarmentIds = [...new Set(entriesResult.rows.map(row => String(row.garment_id)))].sort();

    // Distinguish canonical unavailability from a healthy reference that merely falls
    // outside the 64-node Garment projection. The probe is owner-scoped and remains
    // inside the same REPEATABLE READ READ ONLY snapshot.
    const referencedGroundingResult = referencedGarmentIds.length === 0
      ? { rows: [] as Record<string, unknown>[] }
      : await client.query(
          `SELECT g.garment_id
           FROM canonical_garments g
           JOIN canonical_garment_views v
             ON v.view_id=g.primary_view_id AND v.garment_id=g.garment_id
            AND v.tenant_id=g.tenant_id AND v.user_id=g.user_id
            AND v.revoked_at IS NULL AND v.deleted_at IS NULL
           WHERE g.tenant_id=$1 AND g.user_id=$2 AND g.deleted_at IS NULL
             AND g.garment_id=ANY($3::uuid[])
           ORDER BY g.garment_id`,
          [scope.tenantId, scope.userId, referencedGarmentIds],
        );
    const groundableReferencedGarmentIds = new Set(referencedGroundingResult.rows.map(row => String(row.garment_id)));

    const garmentsResult = await client.query(
      `SELECT g.garment_id,g.revision,g.status,g.representation_tier,g.primary_view_id,v.content_sha256
       FROM canonical_garments g
       JOIN canonical_garment_views v
         ON v.view_id=g.primary_view_id AND v.garment_id=g.garment_id
        AND v.tenant_id=g.tenant_id AND v.user_id=g.user_id
        AND v.revoked_at IS NULL AND v.deleted_at IS NULL
       WHERE g.tenant_id=$1 AND g.user_id=$2 AND g.deleted_at IS NULL
       ORDER BY CASE WHEN g.garment_id=ANY($3::uuid[]) THEN 0 ELSE 1 END,g.garment_id
       LIMIT 64`,
      [scope.tenantId, scope.userId, referencedGarmentIds],
    );
    const selectedGarmentIds = new Set(garmentsResult.rows.map(row => String(row.garment_id)));

    for (const reference of ephemeral) {
      if (reference.projectId !== projectId) throw new ContextGraphReadError(409, 'context_graph_ephemeral_cross_project', 'Ephemeral reference points to another Project');
      if (reference.sourceStorageId !== String(project.current_image_storage_id)) {
        throw new ContextGraphReadError(409, 'context_graph_ephemeral_stale_source', 'Ephemeral reference is stale for current Project source');
      }
    }

    const currentSource: ContextGraphV1['currentSource'] = Object.freeze({
      storageId: String(project.storage_id),
      role: dbEnum<ContextGraphV1['currentSource']['role']>(project.role),
      lifecycle: dbEnum<ContextGraphV1['currentSource']['lifecycle']>(project.lifecycle),
      width: numberValue(project.source_width, 'source.width'),
      height: numberValue(project.source_height, 'source.height'),
      ...optionalString('executionId', project.execution_id),
      ...optionalString('operationId', project.operation_id),
      ...optionalString('sourceStorageId', project.source_image_storage_id),
      ...optionalString('producerOperation', project.producer_operation),
    });

    const history: ContextGraphV1['history'] = historyResult.rows.map((row): ContextGraphV1['history'][number] => Object.freeze({
      historyId: String(row.history_id),
      ordinal: numberValue(row.ordinal, 'history.ordinal'),
      imageStorageId: String(row.image_storage_id),
      sourceStorageId: String(row.source_image_storage_id),
      kind: dbEnum<ContextGraphV1['history'][number]['kind']>(row.kind),
    }));

    const candidates: ContextGraphV1['candidates'] = candidatesResult.rows.map((row): ContextGraphV1['candidates'][number] => Object.freeze({
      storageId: String(row.storage_id),
      width: numberValue(row.width, 'candidate.width'),
      height: numberValue(row.height, 'candidate.height'),
      isCurrent: Boolean(row.is_current),
      ...optionalString('executionId', row.execution_id),
      ...optionalString('operationId', row.operation_id),
      ...optionalString('sourceStorageId', row.source_image_storage_id),
      ...optionalString('producerOperation', row.producer_operation),
    }));

    const garments: ContextGraphV1['garments'] = garmentsResult.rows.map((row): ContextGraphV1['garments'][number] => Object.freeze({
      garmentId: String(row.garment_id),
      revision: numberValue(row.revision, 'garment.revision'),
      status: dbEnum<ContextGraphV1['garments'][number]['status']>(row.status),
      representationTier: dbEnum<ContextGraphV1['garments'][number]['representationTier']>(row.representation_tier),
      primaryViewId: String(row.primary_view_id),
      primaryViewSha256: String(row.content_sha256).trim(),
    }));

    const outfits: ContextGraphV1['outfits'] = outfitsResult.rows.map((row): ContextGraphV1['outfits'][number] => Object.freeze({
      outfitId: String(row.outfit_id),
      revision: numberValue(row.revision, 'outfit.revision'),
      status: dbEnum<ContextGraphV1['outfits'][number]['status']>(row.status),
      entries: Object.freeze(entriesResult.rows
        .filter(entry => String(entry.outfit_id) === String(row.outfit_id))
        .map((entry): ContextGraphV1['outfits'][number]['entries'][number] => {
          const garmentId = String(entry.garment_id);
          const garmentReferenceState: ContextGraphV1['outfits'][number]['entries'][number]['garmentReferenceState'] = selectedGarmentIds.has(garmentId)
            ? 'GROUNDED'
            : groundableReferencedGarmentIds.has(garmentId)
              ? 'OUTSIDE_BOUNDED_WINDOW'
              : 'UNAVAILABLE';
          return Object.freeze({
            entryId: String(entry.entry_id),
            garmentId,
            garmentReferenceState,
            position: numberValue(entry.position, 'outfit.position'),
            layerRole: String(entry.layer_role),
          });
        })),
    }));

    return {
      schemaVersion: CONTEXT_GRAPH_V1_SCHEMA,
      project: {
        projectId,
        historyCursorId: String(project.history_cursor_id),
        cursorOrdinal: numberValue(project.cursor_ordinal, 'cursor_ordinal'),
        originalSourceStorageId: String(project.original_image_storage_id),
        currentSourceStorageId: String(project.current_image_storage_id),
        width: numberValue(project.width, 'project.width'),
        height: numberValue(project.height, 'project.height'),
      },
      currentSource,
      history,
      candidates,
      garments,
      outfits,
      ephemeral,
    };
  }
}

function normalizeScope(raw: ContextGraphOwnerScope): ContextGraphOwnerScope {
  return Object.freeze({ tenantId: identifier(raw?.tenantId, 'tenantId'), userId: identifier(raw?.userId, 'userId') });
}

function identifier(raw: unknown, path: string): string {
  if (typeof raw !== 'string') throw new ContextGraphReadError(400, 'context_graph_scope_invalid', `${path} must be a string identifier`);
  const value = raw.trim();
  if (!value || value.length > 200 || /[\u0000-\u001f\u007f]/u.test(value)) throw new ContextGraphReadError(400, 'context_graph_scope_invalid', `${path} is invalid`);
  return value;
}

function numberValue(raw: unknown, path: string): number {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) throw new ContextGraphReadError(500, 'context_graph_canonical_number_invalid', `${path} is invalid in canonical storage`);
  return value;
}

function optionalString<Key extends 'executionId' | 'operationId' | 'sourceStorageId' | 'producerOperation'>(
  key: Key,
  raw: unknown,
): Partial<Record<Key, string>> {
  return raw === null || raw === undefined ? {} : { [key]: String(raw) } as Partial<Record<Key, string>>;
}

function dbEnum<Value extends string>(raw: unknown): Value { return String(raw) as Value; }
