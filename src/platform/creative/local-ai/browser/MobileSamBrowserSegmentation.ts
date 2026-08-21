import manifest from '../models/interactive-segmentation.manifest.json';
import manifestText from '../models/interactive-segmentation.manifest.json?raw';
import manifestSignature from '../models/interactive-segmentation.manifest.sig?raw';
import publicKeyPem from '../models/interactive-segmentation.public-key.pem?raw';
import type { AnalysisTransform, InteractiveSegmentationPort, SelectionCandidate } from '../../../../application/selection';
import { OnnxLocalRuntime } from '../runtimes/OnnxLocalRuntime';
import type { InferenceResult, ModelManifest, OnnxSessionFactory, TensorValue } from '../types';

const MODEL_ID = 'mobilesam-vit-t', MODEL_VERSION = '1.0.2', CANVAS = 1024;
const PIXEL_MEAN = [123.675, 116.28, 103.53], PIXEL_STD = [58.395, 57.12, 57.375];
type PackArtifact = typeof manifest.artifacts.encoder;
type CachedArtifact = { bytes: Uint8Array; signature: Uint8Array };
export type MobileSamEvidence = { provider: 'wasm'; cache: Record<'encoder' | 'decoder', 'hit' | 'miss'>; encoderInvocations: number; decoderInvocations: number; encoderLatencyMs: number; decoderLatencyMs: number };

export interface VerifiedModelCache { read(key: string): Promise<CachedArtifact | undefined>; write(key: string, value: CachedArtifact): Promise<void> }
export interface ImageArtifactResolver { resolve(imageArtifactId: string): Promise<string | Blob> }
export class BrowserImageArtifactResolver implements ImageArtifactResolver {
  #sources = new Map<string, string | Blob>();
  register(imageArtifactId: string, source: string | Blob) { this.#sources.set(imageArtifactId, source); }
  async resolve(imageArtifactId: string) { const source = this.#sources.get(imageArtifactId); if (source) return source; if (/^(https?:|blob:|data:)/.test(imageArtifactId)) return imageArtifactId; throw new Error(`Selection image artifact is unresolved: ${imageArtifactId}`); }
}

export class IndexedDbVerifiedModelCache implements VerifiedModelCache {
  async read(key: string) { return this.withStore('readonly', store => request<CachedArtifact | undefined>(store.get(key))); }
  async write(key: string, value: CachedArtifact) { await this.withStore('readwrite', store => request(store.put(value, key))); }
  private withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => { const open = indexedDB.open('bers-verified-models', 1); open.onupgradeneeded = () => open.result.createObjectStore('artifacts'); open.onerror = () => reject(open.error); open.onsuccess = () => { const transaction = open.result.transaction('artifacts', mode); action(transaction.objectStore('artifacts')).then(resolve, reject).finally(() => open.result.close()); }; });
  }
}
function request<T>(value: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error); }); }

export class MobileSamBrowserSegmentation implements InteractiveSegmentationPort {
  readonly evidence: MobileSamEvidence = { provider: 'wasm', cache: { encoder: 'miss', decoder: 'miss' }, encoderInvocations: 0, decoderInvocations: 0, encoderLatencyMs: 0, decoderLatencyMs: 0 };
  #encoder?: OnnxLocalRuntime; #decoder?: OnnxLocalRuntime; #loading?: Promise<void>; #embedding?: { key: string; value: TensorValue }; #cancelled = new Set<string>();
  constructor(private readonly sessions: OnnxSessionFactory, private readonly cache: VerifiedModelCache = new IndexedDbVerifiedModelCache(), private readonly fetcher: typeof fetch = fetch, private readonly images: ImageArtifactResolver = new BrowserImageArtifactResolver()) {}
  cancel(requestId: string) { if (!requestId) return; this.#cancelled.add(requestId); this.#encoder?.cancel(`${requestId}:encoder`); this.#decoder?.cancel(`${requestId}:decoder`); }
  async segment(input: Parameters<InteractiveSegmentationPort['segment']>[0]) {
    if (input.privacyMode === 'OFFLINE_ONLY') throw new Error('Offline cached execution is not supported');
    const started = performance.now(); await (this.#loading ??= this.loadPack()); this.assertCurrent(input.requestId);
    const image = await decodeImage(await this.images.resolve(input.imageArtifactId), this.fetcher); this.assertCurrent(input.requestId);
    const prep = preprocess(image, input.analysis); const key = `${input.imageArtifactId}|${JSON.stringify(input.analysis)}|${MODEL_VERSION}`;
    if (this.#embedding?.key !== key) {
      const result = await this.#encoder!.infer({ requestId: `${input.requestId}:encoder`, inputs: { input_image: prep.tensor }, outputNames: ['image_embeddings'] });
      this.evidence.encoderInvocations++; this.evidence.encoderLatencyMs = result.latencyMs; this.#embedding = { key, value: required(result, 'image_embeddings') };
    }
    const coords = new Float32Array(input.points.length * 2), labels = new Float32Array(input.points.length);
    input.points.forEach((point, index) => { coords[index * 2] = (point.x * input.analysis.scaleX + input.analysis.offsetX) * prep.promptScaleX; coords[index * 2 + 1] = (point.y * input.analysis.scaleY + input.analysis.offsetY) * prep.promptScaleY; labels[index] = point.label === 'POSITIVE' ? 1 : 0; });
    const decoded = await this.#decoder!.infer({ requestId: `${input.requestId}:decoder`, inputs: {
      image_embeddings: this.#embedding.value, point_coords: tensor(coords, [1, input.points.length, 2]), point_labels: tensor(labels, [1, input.points.length]),
      mask_input: tensor(new Float32Array(256 * 256), [1, 1, 256, 256]), has_mask_input: tensor(new Float32Array([0]), [1]), orig_im_size: tensor(new Float32Array([input.analysis.analysisHeight, input.analysis.analysisWidth]), [2]),
    }, outputNames: ['masks', 'iou_predictions', 'low_res_masks'] });
    this.evidence.decoderInvocations++; this.evidence.decoderLatencyMs = decoded.latencyMs; this.assertCurrent(input.requestId);
    return { target: 'LOCAL' as const, modelId: MODEL_ID, modelVersion: MODEL_VERSION, latencyMs: performance.now() - started, candidates: candidates(decoded, input.analysis) };
  }
  private assertCurrent(id: string) { if (this.#cancelled.delete(id)) throw new Error('Inference cancelled'); }
  private async loadPack() {
    await verify(manifestTextBytes(), decodeBase64(manifestSignature.trim()), publicKeyPem);
    const [encoderBytes, decoderBytes] = await Promise.all([this.loadArtifact('encoder', manifest.artifacts.encoder), this.loadArtifact('decoder', manifest.artifacts.decoder)]);
    const runtimeManifest = (id: string): ModelManifest => ({ modelId: id, version: MODEL_VERSION, family: 'MobileSAM', capabilities: ['INTERACTIVE_SEGMENTATION'], modelFormat: 'ONNX', runtime: 'WASM', sizeBytes: 1, requiredRam: 256, requiredVram: 0, supportedPlatforms: ['BROWSER'], supportedAccelerators: ['WASM'], estimatedLatency: 1, qualityScore: 1, energyScore: 1, privacyLevel: 'PRIVATE', license: 'Apache-2.0', publisher: manifest.verificationKeyId, downloadUri: 'https://verified.invalid', sha256: '0'.repeat(64), signature: 'verified-release-pack', status: 'READY', stabilityScore: 1 });
    this.#encoder = new OnnxLocalRuntime(this.sessions, ['wasm']); this.#decoder = new OnnxLocalRuntime(this.sessions, ['wasm']);
    await this.#encoder.load(runtimeManifest(`${MODEL_ID}-encoder`), encoderBytes); await this.#decoder.load(runtimeManifest(`${MODEL_ID}-decoder`), decoderBytes);
  }
  private async loadArtifact(name: 'encoder' | 'decoder', artifact: PackArtifact) {
    const key = `${MODEL_ID}@${MODEL_VERSION}:${name}`; let stored = await this.cache.read(key);
    if (stored) { try { await verifyArtifact(stored.bytes, stored.signature, artifact, publicKeyPem); this.evidence.cache[name] = 'hit'; return stored.bytes; } catch { stored = undefined; } }
    this.evidence.cache[name] = 'miss'; const [body, signatureResponse] = await Promise.all([this.fetcher(artifact.url), this.fetcher(artifact.signatureUrl)]);
    if (!body.ok || !signatureResponse.ok) throw new Error(`Model download failed: ${name}`); const bytes = new Uint8Array(await body.arrayBuffer()), signature = new Uint8Array(await signatureResponse.arrayBuffer());
    await verifyArtifact(bytes, signature, artifact, publicKeyPem); await this.cache.write(key, { bytes, signature }); return bytes;
  }
}

function tensor(data: Float32Array, dims: number[]): TensorValue { return { data, dims, type: 'float32' }; }
function required(result: InferenceResult, name: string) { const value = result.outputs[name]; if (!value) throw new Error(`MobileSAM output missing: ${name}`); return value; }
function manifestTextBytes() { return new TextEncoder().encode(manifestText); }
async function verifyArtifact(bytes: Uint8Array, signature: Uint8Array, artifact: PackArtifact, pem: string) { if (bytes.byteLength !== artifact.size) throw new Error('MODEL_SIZE_INVALID'); const digest = hex(await crypto.subtle.digest('SHA-256', owned(bytes))); if (digest !== artifact.sha256) throw new Error('MODEL_SHA_INVALID'); await verify(bytes, signature, pem); }
async function verify(bytes: Uint8Array, signature: Uint8Array, pem: string) { const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, '')), c => c.charCodeAt(0)); const key = await crypto.subtle.importKey('spki', owned(der), { name: 'Ed25519' }, false, ['verify']); const valid = await crypto.subtle.verify('Ed25519', key, owned(signature), owned(bytes)); if (!valid) throw new Error('MODEL_SIGNATURE_INVALID'); }
function decodeBase64(value: string) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
function owned(bytes: Uint8Array): ArrayBuffer { return Uint8Array.from(bytes).buffer; }
function hex(buffer: ArrayBuffer) { return [...new Uint8Array(buffer)].map(value => value.toString(16).padStart(2, '0')).join(''); }
async function decodeImage(source: string | Blob, fetcher: typeof fetch) { if (source instanceof Blob) return createImageBitmap(source); const response = await fetcher(source); if (!response.ok) throw new Error('Selection image is unavailable'); return createImageBitmap(await response.blob()); }
export function samResizedDimensions(width: number, height: number) { const scale = CANVAS / Math.max(width, height); return { width: Math.floor(width * scale + .5), height: Math.floor(height * scale + .5) }; }
export function normalizedSamTensor(rgba: Uint8ClampedArray, resizedWidth: number, resizedHeight: number) {
  const data = new Float32Array(3 * CANVAS * CANVAS), plane = CANVAS * CANVAS;
  for (let y = 0; y < resizedHeight; y++) for (let x = 0; x < resizedWidth; x++) { const pixel = (y * resizedWidth + x) * 4, output = y * CANVAS + x; for (let channel = 0; channel < 3; channel++) data[channel * plane + output] = (rgba[pixel + channel] - PIXEL_MEAN[channel]) / PIXEL_STD[channel]; }
  return tensor(data, [1, 3, CANVAS, CANVAS]);
}
export function preprocess(image: ImageBitmap, analysis: AnalysisTransform) {
  const canvas = new OffscreenCanvas(analysis.analysisWidth, analysis.analysisHeight), context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) throw new Error('Canvas unavailable');
  context.drawImage(image, 0, 0, analysis.analysisWidth, analysis.analysisHeight); image.close(); const size = samResizedDimensions(analysis.analysisWidth, analysis.analysisHeight), rw = size.width, rh = size.height;
  const resized = new OffscreenCanvas(rw, rh), target = resized.getContext('2d', { willReadFrequently: true }); if (!target) throw new Error('Canvas unavailable'); target.drawImage(canvas, 0, 0, rw, rh); const rgba = target.getImageData(0, 0, rw, rh).data;
  return { tensor: normalizedSamTensor(rgba, rw, rh), resizedWidth: rw, resizedHeight: rh, promptScaleX: rw / analysis.analysisWidth, promptScaleY: rh / analysis.analysisHeight };
}

function candidates(result: InferenceResult, analysis: AnalysisTransform): SelectionCandidate[] { const masks = required(result, 'masks'), scores = required(result, 'iou_predictions'), count = Number(masks.dims.at(-3) ?? scores.data.length), h = Number(masks.dims.at(-2)), w = Number(masks.dims.at(-1)); return Array.from({ length: count }, (_, index) => { const alpha = new Uint8Array(analysis.analysisWidth * analysis.analysisHeight); for (let y = 0; y < analysis.analysisHeight; y++) for (let x = 0; x < analysis.analysisWidth; x++) { const sy = Math.min(h - 1, Math.floor(y * h / analysis.analysisHeight)), sx = Math.min(w - 1, Math.floor(x * w / analysis.analysisWidth)); alpha[y * analysis.analysisWidth + x] = Number(masks.data[index * h * w + sy * w + sx]) > 0 ? 255 : 0; } return { alpha, width: analysis.analysisWidth, height: analysis.analysisHeight, coordinateSpace: 'ANALYSIS' as const, score: Number(scores.data[index] ?? 0) }; }); }
