import type { HttpRequest } from './index';
/** Placeholder contract for future persisted offline requests. */
export class OfflineQueue {
  /** Offline persistence is intentionally disabled in Sprint 1. */
  enqueue(_request: HttpRequest): never { throw new Error('Offline request queue is not implemented'); }
}
