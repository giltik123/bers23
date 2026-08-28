import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Pool } from 'pg';
import type { PixelImage } from '../../../src/platform/creative/pipeline/ControlledLocalEdit.ts';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';

export type BackgroundIsolationFinalImageLineage = Readonly<{
  sourceImageStorageId: string;
  maskStorageId: string;
  producerOperation: 'BACKGROUND_ISOLATION';
}>;

export type CropFinalImageLineage = Readonly<{
  sourceImageStorageId: string;
  maskStorageId?: undefined;
  producerOperation: 'CROP';
}>;

export type ResizeFinalImageLineage = Readonly<{
  sourceImageStorageId: string;
  maskStorageId?: undefined;
  producerOperation: 'RESIZE';
}>;

export type OrthogonalTransformFinalImageLineage = Readonly<{
  sourceImageStorageId: string;
  maskStorageId?: undefined;
  producerOperation: 'ORTHOGONAL_TRANSFORM';
}>;

export type FinalImageLineage = BackgroundIsolationFinalImageLineage | CropFinalImageLineage | ResizeFinalImageLineage | OrthogonalTransformFinalImageLineage;

export type StoredFinalImage = Readonly<{
  storageId: string;
  tenantId: string;
  userId: string;
  projectId: string;
  executionId: string;
  operationId: string;
  role: 'COMPOSITE';
  lifecycle: 'FINAL';
  width: number;
  height: number;
  encoding: 'PNG_RGBA8_LOSSLESS';
  contentType: 'image/png';
  bytes: Uint8Array;
  sourceImageStorageId?: string;
  maskStorageId?: string;
  producerOperation?: 'BACKGROUND_ISOLATION' | 'CROP' | 'RESIZE' | 'ORTHOGONAL_TRANSFORM';
}>;
export type StoredImage = Omit<StoredFinalImage, 'executionId'|'operationId'|'role'|'lifecycle'> & { executionId?: string; operationId?: string; role: 'ORIGINAL'|'COMPOSITE'; lifecycle: 'IMMUTABLE'|'FINAL' };

/** Durable blob implementation behind the canonical artifact authority. */
export class PostgresImageArtifactStore {
  private readonly pool: Pool; private readonly nextId: () => string;
  constructor(pool: Pool, nextId: () => string = randomUUID) { this.pool = pool; this.nextId = nextId; }

  async persistFinal(
    scope: AuthenticatedScope & { projectId: string },
    executionId: string,
    operationId: string,
    image: PixelImage,
    lineage?: FinalImageLineage,
  ): Promise<StoredFinalImage> {
    if (image.data.length !== image.width * image.height * 4) throw new Error('Malformed final COMPOSITE pixels');
    const bytes = await sharp(image.data, { raw: { width: image.width, height: image.height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
    const storageId = this.nextId();
    const normalizedLineage = lineage ? normalizeLineage(lineage) : undefined;
    const result = normalizedLineage
      ? await this.pool.query(`INSERT INTO canonical_image_artifacts
          (storage_id,tenant_id,user_id,project_id,execution_id,operation_id,role,lifecycle,width,height,encoding,content_type,image_bytes,source_image_storage_id,mask_storage_id,producer_operation)
          VALUES ($1,$2,$3,$4,$5,$6,'COMPOSITE','FINAL',$7,$8,'PNG_RGBA8_LOSSLESS','image/png',$9,$10,$11,$12)
          ON CONFLICT (tenant_id,user_id,project_id,execution_id)
          WHERE role='COMPOSITE' AND lifecycle='FINAL' AND revoked_at IS NULL AND deleted_at IS NULL
          DO UPDATE SET execution_id=EXCLUDED.execution_id
          RETURNING *`, [storageId, scope.tenantId, scope.userId, scope.projectId, executionId, operationId, image.width, image.height, bytes, normalizedLineage.sourceImageStorageId, normalizedLineage.maskStorageId ?? null, normalizedLineage.producerOperation])
      : await this.pool.query(`INSERT INTO canonical_image_artifacts
          (storage_id,tenant_id,user_id,project_id,execution_id,operation_id,role,lifecycle,width,height,encoding,content_type,image_bytes)
          VALUES ($1,$2,$3,$4,$5,$6,'COMPOSITE','FINAL',$7,$8,'PNG_RGBA8_LOSSLESS','image/png',$9)
          ON CONFLICT (tenant_id,user_id,project_id,execution_id)
          WHERE role='COMPOSITE' AND lifecycle='FINAL' AND revoked_at IS NULL AND deleted_at IS NULL
          DO UPDATE SET execution_id=EXCLUDED.execution_id
          RETURNING *`, [storageId, scope.tenantId, scope.userId, scope.projectId, executionId, operationId, image.width, image.height, bytes]);
    const row = result.rows[0];
    if (!row) throw new Error('Canonical FINAL persistence failed');
    if (normalizedLineage) assertExactLineagedReplay(row, scope, executionId, operationId, image.width, image.height, bytes, normalizedLineage);
    return fromFinalRow(row);
  }

  async load(storageId: string, scope: AuthenticatedScope & { projectId: string }): Promise<StoredFinalImage | undefined> {
    const result = await this.pool.query(`SELECT * FROM canonical_image_artifacts WHERE storage_id=$1 AND tenant_id=$2 AND user_id=$3 AND project_id=$4
      AND role='COMPOSITE' AND lifecycle='FINAL' AND revoked_at IS NULL AND deleted_at IS NULL`, [storageId, scope.tenantId, scope.userId, scope.projectId]);
    const row = result.rows[0]; if (!row) return undefined;
    return fromFinalRow(row);
  }

  /** Durable replay lookup for one canonical FINAL produced by a stable execution identity. */
  async loadFinalByExecution(executionId: string, scope: AuthenticatedScope & { projectId: string }): Promise<StoredFinalImage | undefined> {
    if (!executionId) return undefined;
    const result = await this.pool.query(`SELECT * FROM canonical_image_artifacts WHERE execution_id=$1 AND tenant_id=$2 AND user_id=$3 AND project_id=$4
      AND role='COMPOSITE' AND lifecycle='FINAL' AND revoked_at IS NULL AND deleted_at IS NULL`, [executionId, scope.tenantId, scope.userId, scope.projectId]);
    const row = result.rows[0]; if (!row) return undefined;
    return fromFinalRow(row);
  }

  async loadSource(storageId: string, scope: AuthenticatedScope & { projectId: string }): Promise<StoredImage | undefined> {
    const result=await this.pool.query(`SELECT * FROM canonical_image_artifacts WHERE storage_id=$1 AND tenant_id=$2 AND user_id=$3 AND project_id=$4 AND ((role='ORIGINAL' AND lifecycle='IMMUTABLE') OR (role='COMPOSITE' AND lifecycle='FINAL')) AND revoked_at IS NULL AND deleted_at IS NULL`,[storageId,scope.tenantId,scope.userId,scope.projectId]);
    const row=result.rows[0]; if(!row)return undefined;
    return Object.freeze({
      storageId:row.storage_id,tenantId:row.tenant_id,userId:row.user_id,projectId:row.project_id,
      executionId:row.execution_id ?? undefined,operationId:row.operation_id ?? undefined,role:row.role,lifecycle:row.lifecycle,
      width:Number(row.width),height:Number(row.height),encoding:row.encoding,contentType:row.content_type,bytes:new Uint8Array(row.image_bytes),
      sourceImageStorageId:row.source_image_storage_id ?? undefined,maskStorageId:row.mask_storage_id ?? undefined,producerOperation:row.producer_operation ?? undefined,
    });
  }
}

function normalizeLineage(value: FinalImageLineage): FinalImageLineage {
  const sourceImageStorageId = value?.sourceImageStorageId?.trim();
  if (!sourceImageStorageId) throw new Error('Canonical FINAL source lineage is incomplete');
  if (value.producerOperation === 'BACKGROUND_ISOLATION') {
    const maskStorageId = value.maskStorageId?.trim();
    if (!maskStorageId) throw new Error('Canonical Background Isolation FINAL MASK lineage is incomplete');
    if (sourceImageStorageId === maskStorageId) throw new Error('Canonical Background Isolation source and MASK storage identities must differ');
    return Object.freeze({ sourceImageStorageId, maskStorageId, producerOperation: 'BACKGROUND_ISOLATION' as const });
  }
  if (value.producerOperation === 'CROP') {
    if (value.maskStorageId !== undefined) throw new Error('Canonical Crop FINAL must not carry MASK lineage');
    return Object.freeze({ sourceImageStorageId, producerOperation: 'CROP' as const });
  }
  if (value.producerOperation === 'RESIZE') {
    if (value.maskStorageId !== undefined) throw new Error('Canonical Resize FINAL must not carry MASK lineage');
    return Object.freeze({ sourceImageStorageId, producerOperation: 'RESIZE' as const });
  }
  if (value.producerOperation === 'ORTHOGONAL_TRANSFORM') {
    if (value.maskStorageId !== undefined) throw new Error('Canonical orthogonal-transform FINAL must not carry MASK lineage');
    return Object.freeze({ sourceImageStorageId, producerOperation: 'ORTHOGONAL_TRANSFORM' as const });
  }
  throw new Error('Canonical FINAL producer operation is not admitted for lineage');
}

function assertExactLineagedReplay(
  row: any,
  scope: AuthenticatedScope & { projectId: string },
  executionId: string,
  operationId: string,
  width: number,
  height: number,
  bytes: Buffer,
  lineage: FinalImageLineage,
): void {
  const storedBytes = Buffer.from(row.image_bytes ?? []);
  const expectedMaskStorageId = lineage.producerOperation === 'BACKGROUND_ISOLATION' ? lineage.maskStorageId : null;
  const same = row.tenant_id === scope.tenantId
    && row.user_id === scope.userId
    && row.project_id === scope.projectId
    && row.execution_id === executionId
    && row.operation_id === operationId
    && row.role === 'COMPOSITE'
    && row.lifecycle === 'FINAL'
    && Number(row.width) === width
    && Number(row.height) === height
    && row.encoding === 'PNG_RGBA8_LOSSLESS'
    && row.content_type === 'image/png'
    && storedBytes.equals(bytes)
    && row.source_image_storage_id === lineage.sourceImageStorageId
    && (row.mask_storage_id ?? null) === expectedMaskStorageId
    && row.producer_operation === lineage.producerOperation;
  if (!same) throw new Error('Canonical deterministic execution is already bound to a different FINAL or parent lineage');
}

function fromFinalRow(row: any): StoredFinalImage {
  return Object.freeze({
    storageId: row.storage_id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    projectId: row.project_id,
    executionId: row.execution_id,
    operationId: row.operation_id,
    role: row.role,
    lifecycle: row.lifecycle,
    width: Number(row.width),
    height: Number(row.height),
    encoding: row.encoding,
    contentType: row.content_type,
    bytes: new Uint8Array(row.image_bytes),
    sourceImageStorageId: row.source_image_storage_id ?? undefined,
    maskStorageId: row.mask_storage_id ?? undefined,
    producerOperation: row.producer_operation ?? undefined,
  });
}