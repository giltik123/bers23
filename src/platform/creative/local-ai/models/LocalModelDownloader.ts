import type { FetchPort, ModelManifest, ModelStoragePort, TrustResult } from '../types';
import { LocalModelRegistry } from './LocalModelRegistry';
import { ModelManifestVerifier } from '../trust/ModelTrust';
export class LocalModelDownloader {
  readonly #controllers = new Map<string, AbortController>();
  readonly #paused = new Set<string>();
  constructor(private readonly fetcher: FetchPort, private readonly storage: ModelStoragePort, private readonly registry: LocalModelRegistry, private readonly verifier: ModelManifestVerifier) {}
  async download(manifest: ModelManifest): Promise<ModelManifest> {
    if (await this.storage.freeBytes() < manifest.sizeBytes) throw new Error('Insufficient model storage');
    const current = this.registry.get(manifest.modelId);
    if (!current || current.version !== manifest.version) this.registry.register({ ...manifest, status: 'DOWNLOADING' });
    else this.registry.updateStatus(manifest.modelId, 'DOWNLOADING');
    const controller = new AbortController(); this.#controllers.set(manifest.modelId, controller);
    try {
      const existing = await this.storage.read(manifest.modelId); const offset = existing?.byteLength ?? 0;
      const tail = await this.fetcher.fetch(manifest.downloadUri, offset, controller.signal);
      if (this.#paused.has(manifest.modelId)) return this.registry.updateStatus(manifest.modelId, 'AVAILABLE');
      const bytes = concat(existing, tail); this.registry.updateStatus(manifest.modelId, 'VERIFYING');
      const trust = await this.verifier.verify(manifest, bytes); this.#assertTrusted(manifest.modelId, trust);
      if (bytes.byteLength !== manifest.sizeBytes) { this.registry.updateStatus(manifest.modelId, 'QUARANTINED'); throw new Error('Model size mismatch'); }
      await this.storage.write(manifest.modelId, bytes); return this.registry.updateStatus(manifest.modelId, 'READY');
    } catch (error) {
      if (controller.signal.aborted) this.registry.updateStatus(manifest.modelId, 'AVAILABLE');
      throw error;
    } finally { this.#controllers.delete(manifest.modelId); }
  }
  pause(modelId: string): void { this.#paused.add(modelId); this.#controllers.get(modelId)?.abort(); }
  resume(manifest: ModelManifest): Promise<ModelManifest> { this.#paused.delete(manifest.modelId); return this.download(manifest); }
  cancel(modelId: string): void { this.#paused.delete(modelId); this.#controllers.get(modelId)?.abort(); }
  async remove(modelId: string): Promise<void> { this.registry.updateStatus(modelId, 'REMOVING'); await this.storage.remove(modelId); this.registry.remove(modelId); }
  rollback(modelId: string): ModelManifest { return this.registry.rollback(modelId); }
  #assertTrusted(modelId: string, trust: TrustResult): void { if (!trust.trusted) { this.registry.updateStatus(modelId, 'QUARANTINED'); throw new Error(trust.errors.join('; ')); } }
}
function concat(first: Uint8Array | undefined, second: Uint8Array): Uint8Array { if (!first) return second; const result = new Uint8Array(first.length + second.length); result.set(first); result.set(second, first.length); return result; }
