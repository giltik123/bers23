import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { ProviderRuntimePort, Artifact, Scope, WorkflowOperation } from '../../../src/platform/creative/workflow-engine/types.ts';
import type { PixelImage } from '../../../src/platform/creative/pipeline/ControlledLocalEdit.ts';
import { composeCreativeProviders } from '../../../src/platform/creative/composition/CreativeProviderComposition.ts';
import { FalProviderError } from '../../../src/platform/creative/providers/fal/FalErrorMapper.ts';
import type { CreativeProvider } from '../../../src/platform/creative/providers/fal/types.ts';
import type { SignedArtifactAuthority } from '../artifacts/signedArtifactAuthority.ts';

export type MaterializedProviderInput = Readonly<{ url: string; byteSize: number; width: number; height: number }>;
export interface ProviderInputMaterializer { materialize(input: Readonly<{ bytes: Uint8Array; mimeType: 'image/png'; purpose: 'roi' | 'mask'; scope: Scope }>): Promise<MaterializedProviderInput> }

export function createFalWorkflowRuntime(input: Readonly<{ apiKey: string; baseUrl: string; timeoutMs: number; artifacts: SignedArtifactAuthority; fetcher?: typeof fetch; materializer?: ProviderInputMaterializer }>): ProviderRuntimePort {
  const fetcher = input.fetcher ?? globalThis.fetch.bind(globalThis);
  const composed = composeCreativeProviders({ fetcher, api: { apiKey: input.apiKey, baseUrl: input.baseUrl, timeoutMs: input.timeoutMs, maxRetries: 0 }, clock: Date.now, random: Math.random, id: randomUUID, sleep: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)) });
  const provider = composed.registry.resolve('image-edit') as CreativeProvider;
  const materializer = input.materializer ?? new FalTemporaryInputMaterializer(input.apiKey, fetcher);
  return Object.freeze({
    async execute(request: Readonly<{ workflowId: string; operation: WorkflowOperation; artifacts: readonly Artifact[]; scope: Scope }>) {
      try {
        if (request.operation.type === 'CONTROLLED_LOCAL_EDIT') return await controlled(request, provider, materializer, input.timeoutMs);
        const source = request.artifacts[0]; if (!source) throw new Error('A canonical input artifact is required');
        const trusted = input.artifacts.resolve(source.id, request.scope);
        const result = await provider.execute({ id: `${request.workflowId}:${request.operation.id}`, scope: request.scope, capability: 'image-edit', prompt: String(request.operation.input?.prompt ?? ''), imageUrl: trusted.url, timeoutMs: input.timeoutMs, metadata: providerMetadata(request) });
        return { artifacts: result.artifacts.map((artifact, index) => ({ id: `${request.workflowId}-output-${index}`, kind: 'image', value: { url: artifact.url, hash: artifact.hash, mimeType: artifact.mimeType } })), latencyMs: result.metrics.latencyMs };
      } catch (cause) {
        if (cause instanceof FalProviderError && cause.category === 'timeout') throw Object.assign(new Error('Provider result requires reconciliation'), { code: 'PROVIDER_RESULT_UNKNOWN', unknownOutcome: true });
        throw cause;
      }
    },
  });
}

async function controlled(request: Readonly<{ workflowId: string; operation: WorkflowOperation; artifacts: readonly Artifact[]; scope: Scope }>, provider: CreativeProvider, materializer: ProviderInputMaterializer, timeoutMs: number) {
  const roiArtifact = request.artifacts.find(artifact => artifact.metadata?.artifactRole === 'ROI_INPUT');
  const roi = roiArtifact?.value as PixelImage | undefined; const mask = roiArtifact?.metadata?.mask;
  if (!isPixelImage(roi) || !(mask instanceof Uint8Array)) throw new Error('Controlled FAL input requires canonical ROI pixels and provider mask');
  if (mask.byteLength !== roi.width * roi.height) throw new Error('Controlled FAL mask dimensions must exactly match ROI');
  const [roiPng, maskPng] = await Promise.all([encodeRoi(roi), encodeFalMask(mask, roi.width, roi.height)]);
  const [imageInput, maskInput] = await Promise.all([
    materializer.materialize({ bytes: roiPng, mimeType: 'image/png', purpose: 'roi', scope: request.scope }),
    materializer.materialize({ bytes: maskPng, mimeType: 'image/png', purpose: 'mask', scope: request.scope }),
  ]);
  if (imageInput.width !== roi.width || imageInput.height !== roi.height || maskInput.width !== roi.width || maskInput.height !== roi.height) throw new Error('Materialized controlled inputs changed dimensions');
  const result = await provider.execute({ id: `${request.workflowId}:${request.operation.id}`, scope: request.scope, capability: 'inpaint', prompt: String(request.operation.input?.instruction ?? ''), imageUrl: imageInput.url, maskUrl: maskInput.url, timeoutMs, metadata: { ...providerMetadata(request), roiWidth: roi.width, roiHeight: roi.height, roiBytes: roiPng.byteLength, maskWidth: roi.width, maskHeight: roi.height, maskBytes: maskPng.byteLength } });
  const output = result.artifacts[0]; if (!output?.bytes) throw new Error('Controlled FAL result did not contain trusted image bytes');
  const patch = await decodePatch(output.bytes); if (patch.width !== roi.width || patch.height !== roi.height) throw new Error(`Controlled FAL patch dimensions ${patch.width}x${patch.height} do not match requested ${roi.width}x${roi.height}`);
  return { artifacts: [{ id: `${request.workflowId}-provider-patch`, kind: 'image', value: patch }], latencyMs: result.metrics.latencyMs };
}

/** FAL fill uses a grayscale PNG: white (255) is edited and black (0) is preserved. Canonical nonzero alpha means selected/edit. */
export async function encodeFalMask(canonicalAlpha: Uint8Array, width: number, height: number): Promise<Uint8Array> {
  if (canonicalAlpha.byteLength !== width * height) throw new Error('Provider mask pixel count mismatch');
  return sharp(canonicalAlpha, { raw: { width, height, channels: 1 } }).toColourspace('b-w').png({ compressionLevel: 9, colours: 256 }).toBuffer();
}
async function encodeRoi(image: PixelImage): Promise<Uint8Array> { return sharp(new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength), { raw: { width: image.width, height: image.height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer(); }
async function decodePatch(bytes: Uint8Array): Promise<PixelImage> { const decoded = await sharp(bytes).ensureAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true }); return { width: decoded.info.width, height: decoded.info.height, data: new Uint8ClampedArray(decoded.data), format: 'RGBA8', orientation: 1, colorSpace: 'srgb' }; }
function isPixelImage(value: unknown): value is PixelImage { return Boolean(value && typeof value === 'object' && Number.isInteger((value as PixelImage).width) && Number.isInteger((value as PixelImage).height) && (value as PixelImage).data instanceof Uint8ClampedArray); }
function providerMetadata(request: Readonly<{ workflowId: string; operation: WorkflowOperation }>) { return { executionId: request.workflowId, operationId: request.operation.id, attemptId: `${request.workflowId}:${request.operation.id}:1`, correlationId: request.operation.input?.correlationId }; }

/** Uploads ephemeral, unguessably named provider inputs to FAL's HTTPS media boundary. */
class FalTemporaryInputMaterializer implements ProviderInputMaterializer {
  constructor(private readonly apiKey: string, private readonly fetcher: typeof fetch) {}
  async materialize(input: Readonly<{ bytes: Uint8Array; mimeType: 'image/png'; purpose: 'roi' | 'mask'; scope: Scope }>): Promise<MaterializedProviderInput> {
    const body = new FormData(); body.append('file', new Blob([Uint8Array.from(input.bytes)], { type: input.mimeType }), `${randomUUID()}.png`);
    const response = await this.fetcher('https://v3.fal.media/files/upload', { method: 'POST', headers: { authorization: `Key ${this.apiKey}` }, body });
    if (!response.ok) throw new Error(`Provider input materialization failed (${response.status})`);
    const data = await response.json() as Record<string, unknown>; const url = String(data.access_url ?? data.file_url ?? data.url ?? '');
    if (!url.startsWith('https://')) throw new Error('Provider input materializer returned an unsafe URL');
    const metadata = await sharp(input.bytes).metadata(); return { url, byteSize: input.bytes.byteLength, width: metadata.width ?? 0, height: metadata.height ?? 0 };
  }
}
