import { immutableClone } from '../immutable';
import type { ModelManifest, ModelStatus } from '../types';
export class LocalModelRegistry {
  readonly #models = new Map<string, ModelManifest>();
  readonly #history = new Map<string, ModelManifest[]>();
  register(manifest: ModelManifest): ModelManifest {
    const current = this.#models.get(manifest.modelId);
    if (current?.version === manifest.version) throw new Error(`Duplicate model version: ${manifest.modelId}@${manifest.version}`);
    if (current) this.#history.set(manifest.modelId, [...(this.#history.get(manifest.modelId) ?? []), current]);
    const stored = immutableClone(manifest) as ModelManifest; this.#models.set(stored.modelId, stored); return stored;
  }
  get(modelId: string): ModelManifest | undefined { return this.#models.get(modelId); }
  list(status?: ModelStatus): readonly ModelManifest[] { return Object.freeze([...this.#models.values()].filter((item) => !status || item.status === status).sort((a, b) => a.modelId.localeCompare(b.modelId))); }
  updateStatus(modelId: string, status: ModelStatus): ModelManifest {
    const model = this.get(modelId); if (!model) throw new Error(`Unknown model: ${modelId}`);
    const updated = immutableClone({ ...model, status }) as ModelManifest; this.#models.set(modelId, updated); return updated;
  }
  remove(modelId: string): ModelManifest { const model = this.get(modelId); if (!model) throw new Error(`Unknown model: ${modelId}`); this.#models.delete(modelId); return model; }
  rollback(modelId: string): ModelManifest {
    const history = this.#history.get(modelId) ?? []; const prior = history.pop(); if (!prior) throw new Error(`No rollback available: ${modelId}`);
    this.#models.set(modelId, prior); this.#history.set(modelId, history); return prior;
  }
}
