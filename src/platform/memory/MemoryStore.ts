import type { MemoryQuery } from './MemoryQuery';
import type { MemoryRecord, MemoryRecordInput } from './MemoryRecord';
import type { MemoryAccessContext, MemoryClock } from './MemoryTypes';

/** Bounded memory store enforcing immutability, expiration, and tenant/user isolation. */
export class MemoryStore {
  private readonly records = new Map<string, MemoryRecord>(); private sequence = 0;
  constructor(private readonly limit = 10000, private readonly clock: MemoryClock = () => new Date()) { if (!Number.isInteger(limit) || limit < 1) throw new Error('Memory store limit must be a positive integer.'); }
  save<Value>(input: MemoryRecordInput<Value>): MemoryRecord<Value> {
    validateInput(input); const now = this.clock().toISOString(); const id = input.id ?? `memory-${now}-${++this.sequence}`;
    if (this.records.has(id)) throw new Error(`Memory record "${id}" already exists.`);
    const record = deepFreeze({ ...input, id, visibility: input.visibility ?? 'PRIVATE', owner: { ...input.owner }, value: clone(input.value), tags: [...new Set(input.tags ?? [])], confidence: input.confidence ?? 1, retention: { ...(input.retention ?? {}) }, createdAt: now, updatedAt: now }) as MemoryRecord<Value>;
    this.records.set(id, record); while (this.records.size > this.limit) this.records.delete(this.records.keys().next().value!); return record;
  }
  get(id: string, access: MemoryAccessContext): MemoryRecord | undefined { const record = this.records.get(id); return record && canAccess(record, access) && !isExpired(record, this.clock()) ? record : undefined; }
  query(query: MemoryQuery, access: MemoryAccessContext): readonly MemoryRecord[] {
    const now = this.clock(); const from = query.createdAfter ? Date.parse(query.createdAfter) : -Infinity; const to = query.createdBefore ? Date.parse(query.createdBefore) : Infinity;
    const result = [...this.records.values()].filter((record) => canAccess(record, access) && !isExpired(record, now) && (!query.namespace || record.namespace === query.namespace) && (!query.categories || query.categories.includes(record.category)) && (!query.tags || query.tags.every((tag) => record.tags.includes(tag))) && (!query.projectId || record.owner.projectId === query.projectId) && Date.parse(record.createdAt) >= from && Date.parse(record.createdAt) <= to && effectiveConfidence(record, now) >= (query.minimumConfidence ?? 0));
    return Object.freeze(result.slice(0, query.limit === undefined ? result.length : Math.max(0, query.limit)));
  }
  delete(id: string, access: MemoryAccessContext): boolean { const record = this.records.get(id); return Boolean(record && canManage(record, access) && this.records.delete(id)); }
  clearNamespace(namespace: string, access: MemoryAccessContext): number { let deleted = 0; for (const record of this.records.values()) if (record.namespace === namespace && canManage(record, access) && this.records.delete(record.id)) deleted += 1; return deleted; }
  purgeExpired(): number { let deleted = 0; const now = this.clock(); for (const record of this.records.values()) if (isExpired(record, now) && this.records.delete(record.id)) deleted += 1; return deleted; }
  confidence(record: MemoryRecord, at = this.clock()): number { return effectiveConfidence(record, at); }
}

function validateInput(input: MemoryRecordInput): void { if (!input.namespace.trim()) throw new Error('Memory namespace is required.'); if (!input.owner.tenantId || !input.owner.userId) throw new Error('Memory owner tenantId and userId are required.'); if ((input.confidence ?? 1) < 0 || (input.confidence ?? 1) > 1) throw new Error('Memory confidence must be between zero and one.'); if (input.visibility === 'PROJECT' && !input.owner.projectId) throw new Error('Project memory requires projectId.'); }
function canAccess(record: MemoryRecord, access: MemoryAccessContext): boolean { if (record.owner.tenantId !== access.tenantId) return false; if (record.visibility === 'PRIVATE') return record.owner.userId === access.userId; if (record.visibility === 'PROJECT') return Boolean(access.projectId && record.owner.projectId === access.projectId); return true; }
function canManage(record: MemoryRecord, access: MemoryAccessContext): boolean { return record.owner.tenantId === access.tenantId && record.owner.userId === access.userId && (record.visibility !== 'PROJECT' || record.owner.projectId === access.projectId); }
function isExpired(record: MemoryRecord, at: Date): boolean { return Boolean(record.retention.expiresAt && Date.parse(record.retention.expiresAt) <= at.getTime()); }
function effectiveConfidence(record: MemoryRecord, at: Date): number { const halfLife = record.retention.confidenceHalfLifeMs; if (!halfLife || halfLife <= 0) return record.confidence; const age = Math.max(0, at.getTime() - Date.parse(record.updatedAt)); return record.confidence * Math.pow(0.5, age / halfLife); }
function clone<Value>(value: Value): Value { return value === undefined ? value : structuredClone(value); }
function deepFreeze<Value>(value: Value, seen = new WeakSet<object>()): Value { if (value && typeof value === 'object' && !seen.has(value)) { seen.add(value); Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen); } return value; }
