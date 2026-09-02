import {
  FASHION_TRYON_EXECUTION_MIME,
  FASHION_TRYON_MESH_PHASE,
  FASHION_TRYON_TEXTURE_PHASE,
  decodeFashionTryOnMeshExecutionEnvelope,
  decodeFashionTryOnTextureExecutionEnvelope,
  requireUsableFashionTryOnExecutionGrant,
  type FashionTryOnExecutionGrantV1,
} from '../../platform/creative/canonical/fashionTryOnOpaqueExecution';
import { garmentMeshWarpRgba8 } from '../../platform/creative/deterministic/GarmentMeshWarp';
import { garmentTextureCompositeRgba8 } from '../../platform/creative/deterministic/GarmentTextureComposite';
import { encodeDeterministicRgbaPng } from '../../platform/creative/deterministic/DeterministicPng';
import type { PixelImage } from '../../platform/creative/pipeline/ControlledLocalEdit';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RECEIPT_KEYS = Object.freeze(['height','mimeType','sizeBytes','status','width']);
const ACK_KEYS = Object.freeze(['status']);

export type FashionTryOnPreparedUploadReceiptV1 = Readonly<{
  status: 'STORED';
  mimeType: typeof FASHION_TRYON_EXECUTION_MIME;
  width: number;
  height: number;
  sizeBytes: number;
}>;

export type FashionTryOnPreparedSubmitV1 = Readonly<{
  ticketId: string;
  projectId: string;
  latencyMs: number;
}>;

export type PreparedFashionTryOnExecutionResult = Readonly<{
  target: 'LOCAL';
  runtime: 'BROWSER_JS';
  accelerator: 'cpu';
  preview: PixelImage;
  latencyMs: number;
}>;

export type CorePreparedGarmentMeshWarpClient = Readonly<{
  loadPreparedGarmentMeshWarpInput(payload: Readonly<{ ticketId: string; projectId: string }>): Promise<Uint8Array>;
  uploadPreparedGarmentMeshWarpImage(payload: Readonly<{ ticketId: string; projectId: string; bytes: Uint8Array }>): Promise<unknown>;
  submitPreparedGarmentMeshWarp(payload: FashionTryOnPreparedSubmitV1): Promise<unknown>;
}>;

export type CorePreparedGarmentTextureCompositeClient = Readonly<{
  loadPreparedGarmentTextureCompositeInput(payload: Readonly<{ ticketId: string; projectId: string }>): Promise<Uint8Array>;
  uploadPreparedGarmentTextureCompositeImage(payload: Readonly<{ ticketId: string; projectId: string; bytes: Uint8Array }>): Promise<unknown>;
  submitPreparedGarmentTextureComposite(payload: FashionTryOnPreparedSubmitV1): Promise<unknown>;
}>;

/** Product mesh executor: opaque grant in, pixels out. No prepare or evidence identity exists in this surface. */
export class CorePreparedGarmentMeshWarp {
  constructor(
    private readonly projectId: string,
    private readonly core: CorePreparedGarmentMeshWarpClient,
    private readonly clock: () => number = () => performance.now(),
    private readonly now: () => number = () => Date.now(),
  ) { requireProjectId(projectId); }

  async run(grantValue: unknown): Promise<PreparedFashionTryOnExecutionResult> {
    const grant = requireUsableFashionTryOnExecutionGrant(grantValue, FASHION_TRYON_MESH_PHASE, this.now());
    const envelope = decodeFashionTryOnMeshExecutionEnvelope(
      await this.core.loadPreparedGarmentMeshWarpInput({ ticketId: grant.ticketId, projectId: this.projectId }),
    );
    assertGrantGeometry(grant, envelope.outputWidth, envelope.outputHeight);

    const startedAt = this.clock();
    const rgba = garmentMeshWarpRgba8(
      envelope.basisViewRgba,
      envelope.basisViewWidth,
      envelope.basisViewHeight,
      {
        sourcePointsQ16: envelope.sourcePointsQ16,
        destinationPointsQ16: envelope.destinationPointsQ16,
        triangles: envelope.triangles,
        outputWidth: envelope.outputWidth,
        outputHeight: envelope.outputHeight,
      },
    );
    const preview = pixelImage(envelope.outputWidth, envelope.outputHeight, rgba);
    const png = await encodeDeterministicRgbaPng(preview);
    requireUploadReceipt(
      await this.core.uploadPreparedGarmentMeshWarpImage({ ticketId: grant.ticketId, projectId: this.projectId, bytes: png }),
      preview,
      png.byteLength,
    );
    const latencyMs = elapsed(this.clock(), startedAt);
    requireSuccessAck(await this.core.submitPreparedGarmentMeshWarp({
      ticketId: grant.ticketId,
      projectId: this.projectId,
      latencyMs,
    }));
    return Object.freeze({ target: 'LOCAL', runtime: 'BROWSER_JS', accelerator: 'cpu', preview, latencyMs });
  }
}

/** Product texture executor: opaque grant in, deterministic composite out; FINAL identity is recovered separately by Core orchestration. */
export class CorePreparedGarmentTextureComposite {
  constructor(
    private readonly projectId: string,
    private readonly core: CorePreparedGarmentTextureCompositeClient,
    private readonly clock: () => number = () => performance.now(),
    private readonly now: () => number = () => Date.now(),
  ) { requireProjectId(projectId); }

  async run(grantValue: unknown): Promise<PreparedFashionTryOnExecutionResult> {
    const grant = requireUsableFashionTryOnExecutionGrant(grantValue, FASHION_TRYON_TEXTURE_PHASE, this.now());
    const envelope = decodeFashionTryOnTextureExecutionEnvelope(
      await this.core.loadPreparedGarmentTextureCompositeInput({ ticketId: grant.ticketId, projectId: this.projectId }),
    );
    assertGrantGeometry(grant, envelope.outputWidth, envelope.outputHeight);

    const startedAt = this.clock();
    const p = envelope.producerParameters;
    const rgba = garmentTextureCompositeRgba8(
      envelope.projectRgba,
      envelope.outputWidth,
      envelope.outputHeight,
      envelope.garmentSourceRgba,
      envelope.garmentSourceWidth,
      envelope.garmentSourceHeight,
      {
        sourcePointsQ16: envelope.sourcePointsQ16,
        destinationPointsQ16: envelope.destinationPointsQ16,
        triangles: envelope.triangles,
        outputWidth: envelope.outputWidth,
        outputHeight: envelope.outputHeight,
      },
      {
        textureTransform: p.textureTransform,
        featherRadius: p.featherRadius,
        colorSpacePolicy: p.colorSpacePolicy,
      },
    );
    const preview = pixelImage(envelope.outputWidth, envelope.outputHeight, rgba);
    const png = await encodeDeterministicRgbaPng(preview);
    requireUploadReceipt(
      await this.core.uploadPreparedGarmentTextureCompositeImage({ ticketId: grant.ticketId, projectId: this.projectId, bytes: png }),
      preview,
      png.byteLength,
    );
    const latencyMs = elapsed(this.clock(), startedAt);
    requireSuccessAck(await this.core.submitPreparedGarmentTextureComposite({
      ticketId: grant.ticketId,
      projectId: this.projectId,
      latencyMs,
    }));
    return Object.freeze({ target: 'LOCAL', runtime: 'BROWSER_JS', accelerator: 'cpu', preview, latencyMs });
  }
}

function requireProjectId(value: string): void {
  if (!UUID.test(value)) throw new Error('Canonical lowercase Project UUID is required for prepared Fashion Try-On execution');
}
function assertGrantGeometry(grant: FashionTryOnExecutionGrantV1, width: number, height: number): void {
  if (grant.outputWidth !== width || grant.outputHeight !== height) throw new Error('Fashion Try-On execution payload geometry does not match opaque grant');
}
function pixelImage(width: number, height: number, rgba: Uint8ClampedArray): PixelImage {
  return Object.freeze({ width, height, data: rgba, format: 'RGBA8', orientation: 1, colorSpace: 'srgb' });
}
function requireUploadReceipt(value: unknown, preview: PixelImage, encodedSize: number): FashionTryOnPreparedUploadReceiptV1 {
  const record = exactRecord(value, RECEIPT_KEYS, 'Fashion Try-On upload receipt');
  if (record.status !== 'STORED') throw new Error('Fashion Try-On upload receipt status is invalid');
  if (record.mimeType !== FASHION_TRYON_EXECUTION_MIME) throw new Error('Fashion Try-On upload receipt mimeType is invalid');
  if (record.width !== preview.width || record.height !== preview.height) throw new Error('Fashion Try-On upload receipt geometry is invalid');
  if (!Number.isSafeInteger(record.sizeBytes) || Number(record.sizeBytes) !== encodedSize) throw new Error('Fashion Try-On upload receipt size is invalid');
  return Object.freeze({
    status: 'STORED',
    mimeType: FASHION_TRYON_EXECUTION_MIME,
    width: preview.width,
    height: preview.height,
    sizeBytes: Number(record.sizeBytes),
  });
}
function requireSuccessAck(value: unknown): void {
  const record = exactRecord(value, ACK_KEYS, 'Fashion Try-On prepared submission acknowledgement');
  if (record.status !== 'SUCCESS') throw new Error('Core rejected prepared Fashion Try-On execution');
}
function exactRecord(value: unknown, expectedKeys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) throw new Error(`${label} has unknown or missing fields`);
  return record;
}
function elapsed(finishedAt: number, startedAt: number): number {
  const value = Math.max(0, finishedAt - startedAt);
  if (!Number.isFinite(value)) throw new Error('Fashion Try-On browser latency measurement is invalid');
  return value;
}
