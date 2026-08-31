import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Pool } from 'pg';
import type { PixelImage } from '../../../src/platform/creative/pipeline/ControlledLocalEdit.ts';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import {
  normalizeGarmentTextureFinalLineageParameters,
  type GarmentTextureCompositeProducerParametersV1,
} from '../fashion/garmentTextureFinalLineage.ts';

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

export type GarmentTextureCompositeFinalImageLineage = Readonly<{
  sourceImageStorageId: string;
  maskStorageId?: undefined;
  producerOperation: 'GARMENT_TEXTURE_COMPOSITE';
  garmentWarpLayerId: string;
  garmentWarpLayerSha256: string;
  producerParameters: GarmentTextureCompositeProducerParametersV1;
}>;

export type FinalImageLineage =
  | BackgroundIsolationFinalImageLineage
  | CropFinalImageLineage
  | ResizeFinalImageLineage
  | OrthogonalTransformFinalImageLineage
  | GarmentTextureCompositeFinalImageLineage;

type NormalizedGarmentTextureCompositeFinalImageLineage = GarmentTextureCompositeFinalImageLineage & Readonly<{
  producerParametersSha256: string;
}>;

type NormalizedFinalImageLineage =
  | BackgroundIsolationFinalImageLineage
  | CropFinalImageLineage
  | ResizeFinalImageLineage
  | OrthogonalTransformFinalImageLineage
  | NormalizedGarmentTextureCompositeFinalImageLineage;

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
  producerOperation?: 'BACKGROUND_ISOLATION' | 'CROP' | 'RESIZE' | 'ORTHOGONAL_TRANSFORM' | 'GARMENT_TEXTURE_COMPOSITE';
  garmentWarpLayerId?: string;
  garmentWarpLayerSha256?: string;
  producerParameters?: GarmentTextureCompositeProducerParametersV1;
  producerParametersSha256?: string;
}>;
export type StoredImage = Omit<StoredFinalImage, 'executionId'|'operationId'|'role'|'lifecycle'> & {
  executionId?: string;
  operationId?: string;
  role: 'ORIGINAL'|'COMPOSITE';
  lifecycle: 'IMMUTABLE'|'FINAL';
};

/** Durable blob implementation behind the canonical artifact authority. */
export class PostgresImageArtifactStore {
  private readonly pool: Pool;
  private readonly nextId: () => string;

  constructor(pool: Pool, nextId: () => string = randomUUID) {
    this.pool = pool;
    this.nextId = nextId;
  }

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

    // Keep generic deterministic FINAL persistence composable with the accepted
    // artifact-only migrations. Fashion migration 030 is intentionally later
    // than immutable warp-layer migration 029, so requiring Fashion columns for
    // CROP/RESIZE/etc. would make every generic Project authority depend on the
    // Fashion schema. Two exact static INSERT shapes avoid both dynamic SQL and
    // that backwards dependency: only GARMENT_TEXTURE_COMPOSITE can reference
    // Fashion-specific columns, and therefore it still fails closed if 030 was
    // not applied.
    const result = normalizedLineage?.producerOperation === 'GARMENT_TEXTURE_COMPOSITE'
      ? await this.pool.query(`INSERT INTO canonical_image_artifacts
          (storage_id,tenant_id,user_id,project_id,execution_id,operation_id,role,lifecycle,width,height,encoding,content_type,image_bytes,
           source_image_storage_id,mask_storage_id,producer_operation,garment_warp_layer_id,garment_warp_layer_sha256,producer_parameters,producer_parameters_sha256)
          VALUES ($1,$2,$3,$4,$5,$6,'COMPOSITE','FINAL',$7,$8,'PNG_RGBA8_LOSSLESS','image/png',$9,$10,NULL,$11,$12,$13,$14,$15)
          ON CONFLICT (tenant_id,user_id,project_id,execution_id)
          WHERE role='COMPOSITE' AND lifecycle='FINAL' AND revoked_at IS NULL AND deleted_at IS NULL
          DO UPDATE SET execution_id=EXCLUDED.execution_id
          RETURNING *`, [
            storageId, scope.tenantId, scope.userId, scope.projectId, executionId, operationId,
            image.width, image.height, bytes,
            normalizedLineage.sourceImageStorageId,
            normalizedLineage.producerOperation,
            normalizedLineage.garmentWarpLayerId,
            normalizedLineage.garmentWarpLayerSha256,
            normalizedLineage.producerParameters,
            normalizedLineage.producerParametersSha256,
          ])
      : normalizedLineage
        ? await this.pool.query(`INSERT INTO canonical_image_artifacts
            (storage_id,tenant_id,user_id,project_id,execution_id,operation_id,role,lifecycle,width,height,encoding,content_type,image_bytes,
             source_image_storage_id,mask_storage_id,producer_operation)
            VALUES ($1,$2,$3,$4,$5,$6,'COMPOSITE','FINAL',$7,$8,'PNG_RGBA8_LOSSLESS','image/png',$9,$10,$11,$12)
            ON CONFLICT (tenant_id,user_id,project_id,execution_id)
            WHERE role='COMPOSITE' AND lifecycle='FINAL' AND revoked_at IS NULL AND deleted_at IS NULL
            DO UPDATE SET execution_id=EXCLUDED.execution_id
            RETURNING *`, [
              storageId, scope.tenantId, scope.userId, scope.projectId, executionId, operationId,
              image.width, image.height, bytes,
              normalizedLineage.sourceImageStorageId,
              normalizedLineage.producerOperation === 'BACKGROUND_ISOLATION' ? normalizedLineage.maskStorageId : null,
              normalizedLineage.producerOperation,
            ])
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
    await this.assertStoredFashionLineage(row, scope);
    return fromFinalRow(row);
  }

  async load(storageId: string, scope: AuthenticatedScope & { projectId: string }): Promise<StoredFinalImage | undefined> {
    const result = await this.pool.query(`SELECT * FROM canonical_image_artifacts WHERE storage_id=$1 AND tenant_id=$2 AND user_id=$3 AND project_id=$4
      AND role='COMPOSITE' AND lifecycle='FINAL' AND revoked_at IS NULL AND deleted_at IS NULL`, [storageId, scope.tenantId, scope.userId, scope.projectId]);
    const row = result.rows[0];
    if (!row) return undefined;
    await this.assertStoredFashionLineage(row, scope);
    return fromFinalRow(row);
  }

  /** Durable replay lookup for one canonical FINAL produced by a stable execution identity. */
  async loadFinalByExecution(executionId: string, scope: AuthenticatedScope & { projectId: string }): Promise<StoredFinalImage | undefined> {
    if (!executionId) return undefined;
    const result = await this.pool.query(`SELECT * FROM canonical_image_artifacts WHERE execution_id=$1 AND tenant_id=$2 AND user_id=$3 AND project_id=$4
      AND role='COMPOSITE' AND lifecycle='FINAL' AND revoked_at IS NULL AND deleted_at IS NULL`, [executionId, scope.tenantId, scope.userId, scope.projectId]);
    const row = result.rows[0];
    if (!row) return undefined;
    await this.assertStoredFashionLineage(row, scope);
    return fromFinalRow(row);
  }

  async loadSource(storageId: string, scope: AuthenticatedScope & { projectId: string }): Promise<StoredImage | undefined> {
    const result = await this.pool.query(`SELECT * FROM canonical_image_artifacts WHERE storage_id=$1 AND tenant_id=$2 AND user_id=$3 AND project_id=$4
      AND ((role='ORIGINAL' AND lifecycle='IMMUTABLE') OR (role='COMPOSITE' AND lifecycle='FINAL'))
      AND revoked_at IS NULL AND deleted_at IS NULL`, [storageId, scope.tenantId, scope.userId, scope.projectId]);
    const row = result.rows[0];
    if (!row) return undefined;
    await this.assertStoredFashionLineage(row, scope);
    const lineage = lineageFieldsFromRow(row);
    return Object.freeze({
      storageId: row.storage_id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      projectId: row.project_id,
      executionId: row.execution_id ?? undefined,
      operationId: row.operation_id ?? undefined,
      role: row.role,
      lifecycle: row.lifecycle,
      width: Number(row.width),
      height: Number(row.height),
      encoding: row.encoding,
      contentType: row.content_type,
      bytes: new Uint8Array(row.image_bytes),
      ...lineage,
    });
  }

  private async assertStoredFashionLineage(row: any, scope: AuthenticatedScope & { projectId: string }): Promise<void> {
    if (row.producer_operation !== 'GARMENT_TEXTURE_COMPOSITE') return;
    const lineage = lineageFieldsFromRow(row);
    if (
      lineage.producerOperation !== 'GARMENT_TEXTURE_COMPOSITE'
      || !lineage.sourceImageStorageId
      || !lineage.garmentWarpLayerId
      || !lineage.garmentWarpLayerSha256
      || !lineage.producerParameters
      || !lineage.producerParametersSha256
    ) throw new Error('Canonical Fashion texture FINAL durable lineage is incomplete');

    const relation = await this.pool.query(`SELECT 1
      FROM canonical_fashion_garment_warp_layers layer
      JOIN canonical_image_artifacts source_image
        ON source_image.storage_id=$1
       AND source_image.tenant_id=$2
       AND source_image.user_id=$3
       AND source_image.project_id=$4
       AND source_image.revoked_at IS NULL
       AND source_image.deleted_at IS NULL
       AND ((source_image.role='ORIGINAL' AND source_image.lifecycle='IMMUTABLE') OR (source_image.role='COMPOSITE' AND source_image.lifecycle='FINAL'))
      WHERE layer.layer_id=$5
        AND layer.content_sha256=$6
        AND layer.tenant_id=$2
        AND layer.user_id=$3
        AND layer.project_id::text=$4
        AND layer.project_image_storage_id=$1
        AND layer.width=$7
        AND layer.height=$8`, [
          lineage.sourceImageStorageId,
          scope.tenantId,
          scope.userId,
          scope.projectId,
          lineage.garmentWarpLayerId,
          lineage.garmentWarpLayerSha256,
          Number(row.width),
          Number(row.height),
        ]);
    if (relation.rowCount !== 1) throw new Error('Canonical Fashion texture FINAL durable layer/source evidence is unavailable or inconsistent');
  }
}

function normalizeLineage(value: FinalImageLineage): NormalizedFinalImageLineage {
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
  if (value.producerOperation === 'GARMENT_TEXTURE_COMPOSITE') {
    if (value.maskStorageId !== undefined) throw new Error('Canonical Garment Texture Composite FINAL must not carry MASK lineage');
    const garmentWarpLayerId = canonicalUuid(value.garmentWarpLayerId, 'Canonical Garment Texture Composite layer id');
    const garmentWarpLayerSha256 = canonicalSha256(value.garmentWarpLayerSha256, 'Canonical Garment Texture Composite layer SHA-256');
    const normalizedParameters = normalizeGarmentTextureFinalLineageParameters(value.producerParameters);
    return Object.freeze({
      sourceImageStorageId,
      producerOperation: 'GARMENT_TEXTURE_COMPOSITE' as const,
      garmentWarpLayerId,
      garmentWarpLayerSha256,
      producerParameters: normalizedParameters.document,
      producerParametersSha256: normalizedParameters.sha256,
    });
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
  lineage: NormalizedFinalImageLineage,
): void {
  const storedBytes = Buffer.from(row.image_bytes ?? []);
  const expectedMaskStorageId = lineage.producerOperation === 'BACKGROUND_ISOLATION' ? lineage.maskStorageId : null;
  const expectedLayerId = lineage.producerOperation === 'GARMENT_TEXTURE_COMPOSITE' ? lineage.garmentWarpLayerId : null;
  const expectedLayerSha = lineage.producerOperation === 'GARMENT_TEXTURE_COMPOSITE' ? lineage.garmentWarpLayerSha256 : null;
  const expectedParametersSha = lineage.producerOperation === 'GARMENT_TEXTURE_COMPOSITE' ? lineage.producerParametersSha256 : null;
  const storedParameters = row.producer_parameters == null ? null : normalizeGarmentTextureFinalLineageParameters(row.producer_parameters);
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
    && row.producer_operation === lineage.producerOperation
    && (row.garment_warp_layer_id ?? null) === expectedLayerId
    && (row.garment_warp_layer_sha256 ?? null) === expectedLayerSha
    && (row.producer_parameters_sha256 ?? null) === expectedParametersSha
    && (
      lineage.producerOperation !== 'GARMENT_TEXTURE_COMPOSITE'
      || (
        storedParameters?.sha256 === lineage.producerParametersSha256
        && storedParameters.canonicalJson === normalizeGarmentTextureFinalLineageParameters(lineage.producerParameters).canonicalJson
      )
    );
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
    ...lineageFieldsFromRow(row),
  });
}

function lineageFieldsFromRow(row: any): Pick<
  StoredFinalImage,
  'sourceImageStorageId' | 'maskStorageId' | 'producerOperation' | 'garmentWarpLayerId' | 'garmentWarpLayerSha256' | 'producerParameters' | 'producerParametersSha256'
> {
  const producerOperation = row.producer_operation ?? undefined;
  const sourceImageStorageId = row.source_image_storage_id ?? undefined;
  const maskStorageId = row.mask_storage_id ?? undefined;
  const garmentWarpLayerId = row.garment_warp_layer_id ?? undefined;
  const garmentWarpLayerSha256 = row.garment_warp_layer_sha256 ?? undefined;
  const producerParametersSha256 = row.producer_parameters_sha256 ?? undefined;
  const producerParametersRaw = row.producer_parameters ?? undefined;

  if (!producerOperation) {
    if (sourceImageStorageId || maskStorageId || garmentWarpLayerId || garmentWarpLayerSha256 || producerParametersRaw || producerParametersSha256) {
      throw new Error('Canonical unlineaged IMAGE carries unexpected lineage fields');
    }
    return {};
  }

  if (producerOperation === 'GARMENT_TEXTURE_COMPOSITE') {
    if (!sourceImageStorageId || maskStorageId || !garmentWarpLayerId || !garmentWarpLayerSha256 || !producerParametersRaw || !producerParametersSha256) {
      throw new Error('Canonical Fashion texture FINAL durable lineage is incomplete');
    }
    const normalized = normalizeGarmentTextureFinalLineageParameters(producerParametersRaw);
    if (canonicalSha256(garmentWarpLayerSha256, 'Stored Garment Texture Composite layer SHA-256') !== garmentWarpLayerSha256) {
      throw new Error('Canonical Fashion texture FINAL layer SHA-256 is not canonical lowercase');
    }
    if (normalized.sha256 !== producerParametersSha256) throw new Error('Canonical Fashion texture FINAL producer-parameter SHA-256 mismatch');
    return {
      sourceImageStorageId,
      producerOperation,
      garmentWarpLayerId: canonicalUuid(garmentWarpLayerId, 'Stored Garment Texture Composite layer id'),
      garmentWarpLayerSha256,
      producerParameters: normalized.document,
      producerParametersSha256,
    };
  }

  if (garmentWarpLayerId || garmentWarpLayerSha256 || producerParametersRaw || producerParametersSha256) {
    throw new Error('Non-Fashion canonical FINAL carries Fashion-specific lineage fields');
  }
  if (!sourceImageStorageId) throw new Error('Canonical derived FINAL source lineage is incomplete');
  if (producerOperation === 'BACKGROUND_ISOLATION') {
    if (!maskStorageId) throw new Error('Canonical Background Isolation FINAL MASK lineage is incomplete');
    return { sourceImageStorageId, maskStorageId, producerOperation };
  }
  if (maskStorageId) throw new Error('Canonical deterministic FINAL unexpectedly carries MASK lineage');
  if (producerOperation === 'CROP' || producerOperation === 'RESIZE' || producerOperation === 'ORTHOGONAL_TRANSFORM') {
    return { sourceImageStorageId, producerOperation };
  }
  throw new Error('Canonical FINAL producer operation is unsupported');
}

function canonicalSha256(value: unknown, label: string): string {
  const hash = String(value ?? '').trim();
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error(`${label} must be canonical lowercase SHA-256`);
  return hash;
}

function canonicalUuid(value: unknown, label: string): string {
  const id = String(value ?? '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
    throw new Error(`${label} must be a canonical lowercase UUID`);
  }
  return id;
}
