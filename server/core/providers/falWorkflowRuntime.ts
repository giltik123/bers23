import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { ProviderRuntimePort, Artifact, Scope, WorkflowOperation } from '../../../src/platform/creative/workflow-engine/types.ts';
import type { PixelImage } from '../../../src/platform/creative/pipeline/ControlledLocalEdit.ts';
import { composeCreativeProviders } from '../../../src/platform/creative/composition/CreativeProviderComposition.ts';
import { FalProviderError } from '../../../src/platform/creative/providers/fal/FalErrorMapper.ts';
import type { CreativeProvider } from '../../../src/platform/creative/providers/fal/types.ts';
import type { SignedArtifactAuthority } from '../artifacts/signedArtifactAuthority.ts';

export type MaterializedProviderInput = Readonly<{ url: string; byteSize: number; width: number; height: number }>;
export interface ProviderInputMaterializer { materialize(input: Readonly<{ bytes: Uint8Array; mimeType: 'image/png'; purpose: 'roi' | 'mask'; scope: Scope }>, signal?: AbortSignal): Promise<MaterializedProviderInput> }

export function createFalWorkflowRuntime(input: Readonly<{ apiKey: string; baseUrl: string; timeoutMs: number; artifacts: SignedArtifactAuthority; fetcher?: typeof fetch; materializer?: ProviderInputMaterializer }>): ProviderRuntimePort {
  const fetcher = input.fetcher ?? globalThis.fetch.bind(globalThis);
  const composed = composeCreativeProviders({ fetcher, api: { apiKey: input.apiKey, baseUrl: input.baseUrl, timeoutMs: input.timeoutMs, maxRetries: 0 }, clock: Date.now, random: Math.random, id: randomUUID, sleep: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)) });
  const provider = composed.registry.resolve('image-edit') as CreativeProvider;
  const materializer = input.materializer ?? new FalTemporaryInputMaterializer(input.apiKey, fetcher);
  const active = new Map<string, AbortController>();
  return Object.freeze({
    async execute(request: Readonly<{ workflowId: string; operation: WorkflowOperation; artifacts: readonly Artifact[]; scope: Scope }>) {
      if (active.has(request.workflowId)) throw new Error(`Creative provider execution is already active: ${request.workflowId}`);
      const controller = new AbortController(); active.set(request.workflowId, controller); const signal = controller.signal;
      try {
        throwIfCancelled(signal);
        if (request.operation.type === 'VIRTUAL_TRY_ON') return await virtualTryOn(request, provider, materializer, input.timeoutMs, signal);
        if (request.operation.type !== 'image-edit' && request.operation.type !== 'CONTROLLED_LOCAL_EDIT') throw new Error(`Unsupported FAL workflow operation type: ${request.operation.type}`);
        if (request.operation.type === 'CONTROLLED_LOCAL_EDIT') return await controlled(request, provider, materializer, input.timeoutMs, signal);
        const source = request.artifacts.find(artifact => artifact.id === request.operation.input?.sourceArtifactId)
          ?? request.artifacts[0];
        if (!source) throw new Error('A canonical input artifact is required');
        if (isPixelImage(source.value)) {
          // Full-frame generation/editing uses canonical pixels, never an opaque
          // stored-image token or an untrusted browser-provided provider URL.
          const original = source.value;
          if (original.width * original.height > 16_777_216)
            throw new Error('Cloud full-frame editing supports up to 16 megapixels');
          const sourcePng = await encodeTryOnInput(original);
          const uploaded = await materializer.materialize({
            bytes:sourcePng,mimeType:'image/png',purpose:'roi',scope:request.scope,
          },signal);
          throwIfCancelled(signal);
          const completed = await provider.execute({
            id:`${request.workflowId}:${request.operation.id}`,scope:request.scope,
            capability:'image-edit',prompt:String(request.operation.input?.prompt ?? ''),
            imageUrl:uploaded.url,timeoutMs:input.timeoutMs,metadata:providerMetadata(request),
          },signal);
          throwIfCancelled(signal);
          if(completed.artifacts.length!==1 || !completed.artifacts[0].bytes)
            throw new Error('Full-frame FAL editing must return one trusted image');
          const meta=await sharp(completed.artifacts[0].bytes,{limitInputPixels:16_777_216}).metadata();
          if(!meta.width||!meta.height||
             Math.abs((meta.width/meta.height)/(original.width/original.height)-1)>0.03)
            throw new Error('Generated image changed the source aspect ratio');
          const decoded=await sharp(completed.artifacts[0].bytes,{limitInputPixels:16_777_216})
            .resize(original.width,original.height,{fit:'fill'})
            .ensureAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true});
          throwIfCancelled(signal);
          const image:PixelImage={width:original.width,height:original.height,
            data:new Uint8ClampedArray(decoded.data),format:'RGBA8',orientation:1,colorSpace:'srgb'};
          return {artifacts:[{id:`${request.workflowId}-global-final`,kind:'image',value:image,
            scope:request.scope,metadata:{lifecycle:'FINAL',artifactRole:'COMPOSITE',
              producerOperation:'GLOBAL_EDIT',parentArtifactIds:[source.id],
              sourceArtifactId:source.id,
              integrityMetrics:{verificationOutcome:'PASS',
                assessment:'DECODED_STRUCTURE_ONLY_NOT_VISUAL_QUALITY'}}}],
            latencyMs:completed.metrics.latencyMs};
        }
        const trusted = input.artifacts.resolve(source.id, request.scope);
        const result = await provider.execute({ id: `${request.workflowId}:${request.operation.id}`, scope: request.scope, capability: 'image-edit', prompt: String(request.operation.input?.prompt ?? ''), imageUrl: trusted.url, timeoutMs: input.timeoutMs, metadata: providerMetadata(request) }, signal);
        throwIfCancelled(signal);
        return { artifacts: result.artifacts.map((artifact, index) => ({ id: `${request.workflowId}-output-${index}`, kind: 'image', value: { url: artifact.url, hash: artifact.hash, mimeType: artifact.mimeType } })), latencyMs: result.metrics.latencyMs };
      } catch (cause) {
        if (signal.aborted) throw cancellationReason(signal);
        if (cause instanceof FalProviderError && cause.category === 'timeout') throw Object.assign(new Error('Provider result requires reconciliation'), { code: 'PROVIDER_RESULT_UNKNOWN', unknownOutcome: true });
        throw cause;
      } finally { if (active.get(request.workflowId) === controller) active.delete(request.workflowId); }
    },
    cancel(workflowId: string) {
      const controller = active.get(workflowId); if (!controller || controller.signal.aborted) return false;
      controller.abort(new DOMException('Creative execution cancelled', 'AbortError'));
      return true;
    },
  });
}

async function virtualTryOn(request: Readonly<{ workflowId: string; operation: WorkflowOperation; artifacts: readonly Artifact[]; scope: Scope }>, provider: CreativeProvider, materializer: ProviderInputMaterializer, timeoutMs: number, signal: AbortSignal) {
  const source = request.artifacts.find(a => a.id === request.operation.input?.sourceArtifactId);
  const reference = request.artifacts.find(a => a.id === request.operation.input?.referenceArtifactId);
  const person = source?.value as PixelImage; const garment = reference?.value as PixelImage;
  const category = request.operation.input?.category;
  if (!source || !reference || !isPixelImage(person) || !isPixelImage(garment) || reference.metadata?.virtualTryOnReference !== true
      || !['tops', 'bottoms', 'one-pieces'].includes(String(category))
      || [source, reference].some(a => a.scope.tenantId !== request.scope.tenantId || a.scope.userId !== request.scope.userId || a.scope.projectId !== request.scope.projectId)) throw new Error('Virtual Try-On requires canonical person and managed garment pixels');
  const [personPng, garmentPng] = await Promise.all([encodeTryOnInput(person), encodeTryOnInput(garment)]);
  throwIfCancelled(signal);
  const [personInput, garmentInput] = await Promise.all([
    materializer.materialize({ bytes: personPng, mimeType: 'image/png', purpose: 'roi', scope: request.scope }, signal),
    materializer.materialize({ bytes: garmentPng, mimeType: 'image/png', purpose: 'roi', scope: request.scope }, signal),
  ]);
  throwIfCancelled(signal);
  const result = await provider.execute({ id: `${request.workflowId}:${request.operation.id}`, scope: request.scope,
    capability: 'try-on', inputs: { model_image: personInput.url, garment_image: garmentInput.url, category,
      garment_photo_type: 'auto', mode: 'quality', num_samples: 1, output_format: 'png', enable_safety_checker: true },
    timeoutMs, metadata: providerMetadata(request) }, signal);
  throwIfCancelled(signal);
  if (result.artifacts.length !== 1 || !result.artifacts[0].bytes) throw new Error('Virtual Try-On did not return one trusted image');
  const outputMeta = await sharp(result.artifacts[0].bytes, { limitInputPixels: 16_777_216 }).metadata();
  if (!outputMeta.width || !outputMeta.height || Math.abs((outputMeta.width / outputMeta.height) / (person.width / person.height) - 1) > 0.03) throw new Error('Virtual Try-On changed the photo aspect ratio');
  // Keep the full generated frame and the canonical Project dimensions. Decode
  // with bounded input pixels; never treat a provider URL as a persisted FINAL.
  const decoded = await sharp(result.artifacts[0].bytes, { limitInputPixels: 16_777_216 })
    .resize(person.width, person.height, { fit: 'fill' }).ensureAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  throwIfCancelled(signal);
  const image: PixelImage = { width: person.width, height: person.height, data: new Uint8ClampedArray(decoded.data), format: 'RGBA8', orientation: 1, colorSpace: 'srgb' };
  return { artifacts: [{ id: `${request.workflowId}-tryon-final`, kind: 'image', value: image,
    scope: request.scope, metadata: { lifecycle: 'FINAL', artifactRole: 'COMPOSITE', producerOperation: 'VIRTUAL_TRY_ON',
      parentArtifactIds: [source.id, reference.id], sourceArtifactId: source.id,
      integrityMetrics: { verificationOutcome: 'PASS', assessment: 'DECODED_STRUCTURE_ONLY_NOT_VISUAL_QUALITY' } } }], latencyMs: result.metrics.latencyMs };
}

async function encodeTryOnInput(image: PixelImage): Promise<Uint8Array> {
  if (image.width < 1 || image.height < 1 || image.width * image.height > 67_108_864 || image.data.length !== image.width * image.height * 4) throw new Error('Virtual Try-On image dimensions are unsafe');
  return sharp(image.data, { raw: { width: image.width, height: image.height, channels: 4 } })
    .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
}

async function controlled(request: Readonly<{ workflowId: string; operation: WorkflowOperation; artifacts: readonly Artifact[]; scope: Scope }>, provider: CreativeProvider, materializer: ProviderInputMaterializer, timeoutMs: number, signal: AbortSignal) {
  throwIfCancelled(signal);
  const roiArtifact = request.artifacts.find(artifact => artifact.metadata?.artifactRole === 'ROI_INPUT');
  const roi = roiArtifact?.value as PixelImage | undefined; const mask = roiArtifact?.metadata?.mask;
  if (!isPixelImage(roi) || !(mask instanceof Uint8Array)) throw new Error('Controlled FAL input requires canonical ROI pixels and provider mask');
  if (mask.byteLength !== roi.width * roi.height) throw new Error('Controlled FAL mask dimensions must exactly match ROI');
  const [roiPng, maskPng] = await Promise.all([encodeRoi(roi), encodeFalMask(mask, roi.width, roi.height)]); throwIfCancelled(signal);
  const [imageInput, maskInput] = await Promise.all([
    materializer.materialize({ bytes: roiPng, mimeType: 'image/png', purpose: 'roi', scope: request.scope }, signal),
    materializer.materialize({ bytes: maskPng, mimeType: 'image/png', purpose: 'mask', scope: request.scope }, signal),
  ]); throwIfCancelled(signal);
  if (imageInput.width !== roi.width || imageInput.height !== roi.height || maskInput.width !== roi.width || maskInput.height !== roi.height) throw new Error('Materialized controlled inputs changed dimensions');
  const result = await provider.execute({ id: `${request.workflowId}:${request.operation.id}`, scope: request.scope, capability: 'inpaint', prompt: String(request.operation.input?.instruction ?? ''), imageUrl: imageInput.url, maskUrl: maskInput.url, timeoutMs, metadata: { ...providerMetadata(request), roiWidth: roi.width, roiHeight: roi.height, roiBytes: roiPng.byteLength, maskWidth: roi.width, maskHeight: roi.height, maskBytes: maskPng.byteLength } }, signal);
  throwIfCancelled(signal);
  const output = result.artifacts[0]; if (!output?.bytes) throw new Error('Controlled FAL result did not contain trusted image bytes');
  const patch = await decodePatch(output.bytes); throwIfCancelled(signal); if (patch.width !== roi.width || patch.height !== roi.height) throw new Error(`Controlled FAL patch dimensions ${patch.width}x${patch.height} do not match requested ${roi.width}x${roi.height}`);
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
export class FalTemporaryInputMaterializer implements ProviderInputMaterializer {
  constructor(private readonly apiKey: string, private readonly fetcher: typeof fetch) {}
  async materialize(input: Readonly<{ bytes: Uint8Array; mimeType: 'image/png'; purpose: 'roi' | 'mask'; scope: Scope }>, signal: AbortSignal = new AbortController().signal): Promise<MaterializedProviderInput> {
    throwIfCancelled(signal);
    const response = await this.fetcher('https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3', { method: 'POST', headers: { authorization: `Key ${this.apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ content_type: input.mimeType, file_name: `${randomUUID()}.png` }), signal }); throwIfCancelled(signal);
    if (!response.ok) throw new Error(`Provider input materialization failed (${response.status})`);
    const data = await response.json() as Record<string, unknown>; throwIfCancelled(signal); const uploadUrl = String(data.upload_url ?? ''); const url = String(data.file_url ?? '');
    if (!uploadUrl.startsWith('https://') || !url.startsWith('https://')) throw new Error('Provider input materializer returned an unsafe URL');
    const uploaded = await this.fetcher(uploadUrl, { method: 'PUT', headers: { 'content-type': input.mimeType }, body: Uint8Array.from(input.bytes), signal }); throwIfCancelled(signal);
    if (!uploaded.ok) throw new Error(`Provider input upload failed (${uploaded.status})`);
    const metadata = await sharp(input.bytes).metadata(); throwIfCancelled(signal); return { url, byteSize: input.bytes.byteLength, width: metadata.width ?? 0, height: metadata.height ?? 0 };
  }
}

function throwIfCancelled(signal: AbortSignal): void { if (signal.aborted) throw cancellationReason(signal); }
function cancellationReason(signal: AbortSignal): Error { return signal.reason instanceof Error ? signal.reason : new DOMException('Creative execution cancelled', 'AbortError'); }
