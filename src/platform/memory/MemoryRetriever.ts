import type { MemoryRecord } from './MemoryRecord';
import type { MemoryStore } from './MemoryStore';
import type { MemoryAccessContext, MemoryCategory, MemoryClock } from './MemoryTypes';

export interface RelevantMemoryRequest { readonly text?: string; readonly tags?: readonly string[]; readonly categories?: readonly MemoryCategory[]; readonly namespace?: string; readonly limit?: number; readonly minimumConfidence?: number; }
/** Retrieves decayed, privacy-filtered memories by relevance, recency, or confidence. */
export class MemoryRetriever {
  constructor(private readonly store: MemoryStore, private readonly clock: MemoryClock = () => new Date()) {}
  relevant(request: RelevantMemoryRequest, access: MemoryAccessContext): readonly MemoryRecord[] {
    const terms = tokenize(request.text ?? ''); const tagSet = new Set(request.tags ?? []); const now = this.clock();
    const records = this.store.query({ namespace: request.namespace, categories: request.categories }, access).map((record) => {
      const searchable = `${record.tags.join(' ')} ${safeText(record.value)}`.toLowerCase(); const termMatches = terms.filter((term) => searchable.includes(term)).length; const tagMatches = record.tags.filter((tag) => tagSet.has(tag)).length;
      const relevance = terms.length + tagSet.size === 0 ? 1 : (termMatches + tagMatches * 2) / Math.max(1, terms.length + tagSet.size * 2); const confidence = this.store.confidence(record, now);
      const recency = 1 / (1 + Math.max(0, now.getTime() - Date.parse(record.updatedAt)) / 86400000); return { record, score: relevance * 0.6 + confidence * 0.3 + recency * 0.1, confidence };
    }).filter((item) => item.confidence >= (request.minimumConfidence ?? 0) && (terms.length + tagSet.size === 0 || item.score > 0.3));
    return Object.freeze(records.sort((left, right) => right.score - left.score || right.record.updatedAt.localeCompare(left.record.updatedAt)).slice(0, request.limit ?? 20).map((item) => item.record));
  }
  recent(access: MemoryAccessContext, limit = 20): readonly MemoryRecord[] { return Object.freeze([...this.store.query({}, access)].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, limit)); }
  highConfidence(access: MemoryAccessContext, minimumConfidence = 0.8, limit = 20): readonly MemoryRecord[] { const now = this.clock(); return Object.freeze(this.store.query({}, access).filter((record) => this.store.confidence(record, now) >= minimumConfidence).sort((left, right) => this.store.confidence(right, now) - this.store.confidence(left, now)).slice(0, limit)); }
}
function tokenize(value: string): string[] { return [...new Set(value.toLowerCase().match(/[\p{L}\p{N}-]+/gu) ?? [])]; }
function safeText(value: unknown): string { try { return JSON.stringify(value) ?? ''; } catch { return String(value); } }
