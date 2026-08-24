import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Pool } from 'pg';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';

export const MASK_ROLE = 'MASK' as const;
export const MASK_ENCODING = 'ALPHA_8_LOSSLESS' as const;
export const MASK_COORDINATE_SPACE = 'ORIGINAL' as const;
export type MaskProducerOperation = 'MANUAL_SELECTION' | 'MASK_REFINEMENT';
export type MaskLineage = Readonly<{ sourceImageStorageId: string; parentMaskStorageId?: string; producerOperation: MaskProducerOperation }>;

export type StoredMask = Readonly<{
  storageId: string;
  tenantId: string;
  userId: string;
  projectId: string;
  width: number;
  height: number;
  png: Uint8Array;
  sourceImageStorageId?: string;
  parentMaskStorageId?: string;
  producerOperation?: MaskProducerOperation;
}>;

/** PostgreSQL is the durable, server-owned blob authority for canonical masks. */
export class PostgresMaskArtifactStore {
  private readonly pool: Pool; private readonly nextId: () => string;
  constructor(pool: Pool, nextId: () => string = randomUUID) { this.pool = pool; this.nextId = nextId; }

  /**
   * Compatibility persistence remains fail-closed and derives its source image from canonical Project
   * state. Production browser refinement uses persistManual() with explicitly resolved lineage.
   */
  async persist(scope: AuthenticatedScope & { projectId: string }, width: number, height: number, alpha: Uint8Array): Promise<StoredMask> {
    const result = await this.pool.query(`SELECT i.storage_id, i.width, i.height
      FROM canonical_projects p
      JOIN canonical_image_artifacts i ON i.storage_id=p.current_image_storage_id
        AND i.tenant_id=p.tenant_id AND i.user_id=p.user_id AND i.project_id=p.project_id::text
        AND i.revoked_at IS NULL AND i.deleted_at IS NULL
      WHERE p.tenant_id=$1 AND p.user_id=$2 AND p.project_id::text=$3 AND p.deleted_at IS NULL`,
    [scope.tenantId, scope.userId, scope.projectId]);
    const source = result.rows[0];
    if (!source) throw new Error('Canonical Project source image is unavailable for MASK persistence');
    if (Number(source.width) !== width || Number(source.height) !== height) throw new Error('MASK geometry does not match canonical Project source image');
    return this.persistManual(scope, width, height, alpha, { sourceImageStorageId: source.storage_id, producerOperation: 'MANUAL_SELECTION' });
  }

  /** Browser/manual MASK persistence requires lineage that has already been resolved and checked by Core. */
  async persistManual(
    scope: AuthenticatedScope & { projectId: string },
    width: number,
    height: number,
    alpha: Uint8Array,
    lineage: MaskLineage,
  ): Promise<StoredMask> {
    if (!lineage.sourceImageStorageId) throw new Error('Canonical source image lineage is required');
    if (lineage.producerOperation === 'MANUAL_SELECTION' && lineage.parentMaskStorageId) throw new Error('MANUAL_SELECTION cannot claim a parent MASK');
    if (lineage.producerOperation === 'MASK_REFINEMENT' && !lineage.parentMaskStorageId) throw new Error('MASK_REFINEMENT requires a parent MASK');
    const png = await encodeMask(width, height, alpha);
    const storageId = this.nextId();
    await this.pool.query(`INSERT INTO canonical_mask_artifacts
      (storage_id, tenant_id, user_id, project_id, role, encoding, coordinate_space, width, height, png_bytes, source_image_storage_id, parent_mask_storage_id, producer_operation)
      VALUES ($1,$2,$3,$4,'MASK','ALPHA_8_LOSSLESS','ORIGINAL',$5,$6,$7,$8,$9,$10)`,
    [storageId, scope.tenantId, scope.userId, scope.projectId, width, height, png, lineage.sourceImageStorageId, lineage.parentMaskStorageId ?? null, lineage.producerOperation]);
    return freezeStoredMask({ storageId, ...scope, width, height, png: new Uint8Array(png), ...lineage });
  }

  /** One local execution ticket may mint at most one immutable canonical MASK row. */
  async persistLocalExecution(ticketId: string, scope: AuthenticatedScope & { projectId: string }, width: number, height: number, alpha: Uint8Array): Promise<StoredMask> {
    if (!ticketId) throw new Error('Local execution ticket identity is required for MASK persistence');
    const png = await encodeMask(width, height, alpha);
    const storageId = this.nextId();
    const result = await this.pool.query(`INSERT INTO canonical_mask_artifacts
      (storage_id, tenant_id, user_id, project_id, role, encoding, coordinate_space, width, height, png_bytes, local_execution_ticket_id)
      VALUES ($1,$2,$3,$4,'MASK','ALPHA_8_LOSSLESS','ORIGINAL',$5,$6,$7,$8)
      ON CONFLICT (local_execution_ticket_id) WHERE local_execution_ticket_id IS NOT NULL
      DO UPDATE SET local_execution_ticket_id=EXCLUDED.local_execution_ticket_id
      RETURNING storage_id, tenant_id, user_id, project_id, width, height, png_bytes, source_image_storage_id, parent_mask_storage_id, producer_operation`,
    [storageId, scope.tenantId, scope.userId, scope.projectId, width, height, png, ticketId]);
    const row = result.rows[0];
    if (!row) throw new Error('Canonical local MASK persistence failed');
    const storedPng = Buffer.from(row.png_bytes);
    const same = row.tenant_id === scope.tenantId && row.user_id === scope.userId && row.project_id === scope.projectId && Number(row.width) === width && Number(row.height) === height && storedPng.equals(png);
    if (!same) throw new Error('Local execution ticket is already bound to a different canonical MASK');
    return fromRow(row, storedPng);
  }

  /** Durable recovery path for an already committed local execution replay. */
  async loadLocalExecution(ticketId: string, scope: AuthenticatedScope & { projectId: string }): Promise<StoredMask | undefined> {
    if (!ticketId) return undefined;
    const result = await this.pool.query(`SELECT storage_id, tenant_id, user_id, project_id, width, height, png_bytes, source_image_storage_id, parent_mask_storage_id, producer_operation
      FROM canonical_mask_artifacts
      WHERE local_execution_ticket_id=$1 AND tenant_id=$2 AND user_id=$3 AND project_id=$4
        AND role='MASK' AND encoding='ALPHA_8_LOSSLESS' AND coordinate_space='ORIGINAL' AND revoked_at IS NULL`,
    [ticketId, scope.tenantId, scope.userId, scope.projectId]);
    const row = result.rows[0]; if (!row) return undefined;
    return fromRow(row);
  }

  async load(storageId: string, scope: AuthenticatedScope & { projectId: string }): Promise<StoredMask | undefined> {
    const result = await this.pool.query(`SELECT storage_id, tenant_id, user_id, project_id, width, height, png_bytes, source_image_storage_id, parent_mask_storage_id, producer_operation
      FROM canonical_mask_artifacts WHERE storage_id=$1 AND tenant_id=$2 AND user_id=$3 AND project_id=$4 AND role='MASK'
      AND encoding='ALPHA_8_LOSSLESS' AND coordinate_space='ORIGINAL' AND revoked_at IS NULL`,
    [storageId, scope.tenantId, scope.userId, scope.projectId]);
    const row = result.rows[0]; if (!row) return undefined;
    return fromRow(row);
  }
}

async function encodeMask(width: number, height: number, alpha: Uint8Array): Promise<Buffer> {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || alpha.byteLength !== width * height) throw new Error('Malformed canonical MASK alpha');
  return sharp(alpha, { raw: { width, height, channels: 1 } }).toColourspace('b-w').png({ compressionLevel: 9, colours: 256 }).toBuffer();
}
function fromRow(row: any, png = Buffer.from(row.png_bytes)): StoredMask {
  return freezeStoredMask({
    storageId: row.storage_id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    projectId: row.project_id,
    width: Number(row.width),
    height: Number(row.height),
    png: new Uint8Array(png),
    sourceImageStorageId: row.source_image_storage_id ?? undefined,
    parentMaskStorageId: row.parent_mask_storage_id ?? undefined,
    producerOperation: row.producer_operation ?? undefined,
  });
}
function freezeStoredMask(value: StoredMask): StoredMask { return Object.freeze({ ...value, png: Uint8Array.from(value.png) }); }