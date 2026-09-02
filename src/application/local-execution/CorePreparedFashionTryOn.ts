import {
  FASHION_TRYON_MESH_PHASE,
  FASHION_TRYON_TEXTURE_PHASE,
  decodeFashionTryOnMeshExecutionEnvelope,
  decodeFashionTryOnTextureExecutionEnvelope,
  normalizeFashionTryOnPreparedExecutionDescriptor,
  type FashionTryOnExecutionPhase,
  type FashionTryOnPreparedExecutionDescriptorV1,
} from '../../platform/creative/canonical/fashionTryOnPreparedExecution';
import { garmentMeshWarpRgba8 } from '../../platform/creative/deterministic/GarmentMeshWarp';
import { garmentTextureCompositeRgba8 } from '../../platform/creative/deterministic/GarmentTextureComposite';
import { encodeDeterministicRgbaPng } from '../../platform/creative/deterministic/DeterministicPng';
import type { PixelImage } from '../../platform/creative/pipeline/ControlledLocalEdit';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ACK_KEYS = Object.freeze(['status']);

export type FashionTryOnPreparedCandidateSubmissionV1 = Readonly<{
  ticketId: string;
  projectId: string;
  bytes: Uint8Array;
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
  submitPreparedGarmentMeshWarpCandidate(payload: FashionTryOnPreparedCandidateSubmissionV1): Promise<unknown>;
}>;

export type CorePreparedGarmentTextureCompositeClient = Readonly<{
  loadPreparedGarmentTextureCompositeInput(payload: Readonly<{ ticketId: string; projectId: string }>): Promise<Uint8Array>;
  submitPreparedGarmentTextureCompositeCandidate(payload: FashionTryOnPreparedCandidateSubmissionV1): Promise<unknown>;
}>;

/**
 * Product mesh executor: non-authorizing prepared descriptor in, one
 * quarantined PNG candidate out. Core remains responsible for every durable
 * identity, absolute ticket expiry and byte-exact admission decision.
 */
export class CorePreparedGarmentMeshWarp {
  constructor(
    private readonly projectId: string,
    private readonly core: CorePreparedGarmentMeshWarpClient,
    private readonly clock: () => number = () => performance.now(),
  ) { requireProjectId(projectId); }

  async run(descriptorValue: unknown): Promise<PreparedFashionTryOnExecutionResult> {
    const descriptor = requirePreparedDescriptorForPhase(descriptorValue, FASHION_TRYON_MESH_PHASE);
    const envelope = decodeFashionTryOnMeshExecutionEnvelope(
      await this.core.loadPreparedGarmentMeshWarpInput({ ticketId: descriptor.ticketId, projectId: this.projectId }),
    );
    assertDescriptorGeometry(descriptor, envelope.outputWidth, envelope.outputHeight);

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
    const latencyMs = elapsed(this.clock(), startedAt);
    requireSuccessAck(await this.core.submitPreparedGarmentMeshWarpCandidate({
      ticketId: descriptor.ticketId,
      projectId: this.projectId,
      bytes: png,
      latencyMs,
    }));
    return Object.freeze({ target: 'LOCAL', runtime: 'BROWSER_JS', accelerator: 'cpu', preview, latencyMs });
  }
}

/**
 * Product texture executor. FINAL identity is never returned by candidate
 * submission; the caller must recover it later through stable-intent Core
 * orchestration/result authority.
 */
export class CorePreparedGarmentTextureComposite {
  constructor(
    private readonly projectId: string,
    private readonly core: CorePreparedGarmentTextureCompositeClient,
    private readonly clock: () => number = () => performance.now(),
  ) { requireProjectId(projectId); }

  async run(descriptorValue: unknown): Promise<PreparedFashionTryOnExecutionResult> {
    const descriptor = requirePreparedDescriptorForPhase(descriptorValue, FASHION_TRYON_TEXTURE_PHASE);
    const envelope = decodeFashionTryOnTextureExecutionEnvelope(
      await this.core.loadPreparedGarmentTextureCompositeInput({ ticketId: descriptor.ticketId, projectId: this.projectId }),
    );
    assertDescriptorGeometry(descriptor, envelope.outputWidth, envelope.outputHeight);

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
    const latencyMs = elapsed(this.clock(), startedAt);
    requireSuccessAck(await this.core.submitPreparedGarmentTextureCompositeCandidate({
      ticketId: descriptor.ticketId,
      projectId: this.projectId,
      bytes: png,
      latencyMs,
    }));
    return Object.freeze({ target: 'LOCAL', runtime: 'BROWSER_JS', accelerator: 'cpu', preview, latencyMs });
  }
}

function requireProjectId(value: string): void {
  if (!UUID.test(value)) throw new Error('Canonical lowercase Project UUID is required for prepared Fashion Try-On execution');
}
function requirePreparedDescriptorForPhase(
  value: unknown,
  expectedPhase: FashionTryOnExecutionPhase,
): FashionTryOnPreparedExecutionDescriptorV1 {
  const descriptor = normalizeFashionTryOnPreparedExecutionDescriptor(value);
  if (descriptor.phase !== expectedPhase) throw new Error('Fashion Try-On prepared execution descriptor phase is invalid for this executor');
  return descriptor;
}
function assertDescriptorGeometry(descriptor: FashionTryOnPreparedExecutionDescriptorV1, width: number, height: number): void {
  if (descriptor.outputWidth !== width || descriptor.outputHeight !== height) {
    throw new Error('Fashion Try-On execution payload geometry does not match prepared descriptor');
  }
}
function pixelImage(width: number, height: number, rgba: Uint8ClampedArray): PixelImage {
  return Object.freeze({ width, height, data: rgba, format: 'RGBA8', orientation: 1, colorSpace: 'srgb' });
}
function requireSuccessAck(value: unknown): void {
  const record = exactRecord(value, ACK_KEYS, 'Fashion Try-On prepared candidate acknowledgement');
  if (record.status !== 'SUCCESS') throw new Error('Core rejected prepared Fashion Try-On candidate');
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
