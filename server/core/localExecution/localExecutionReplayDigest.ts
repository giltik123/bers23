import { createHash } from 'node:crypto';
import type { AnyLocalExecutionResult } from '../../../src/platform/creative/canonical/localExecution.ts';

export const LOCAL_EXECUTION_REPLAY_DIGEST_VERSION = '1' as const;
const DOMAIN = `bers:local-execution:result-replay:v${LOCAL_EXECUTION_REPLAY_DIGEST_VERSION}\0`;

/**
 * Server-owned fingerprint for one already-validated local result payload.
 * Object key order is intentionally irrelevant; array order and every admitted value remain authoritative.
 */
export function localExecutionResultReplayDigest(result: AnyLocalExecutionResult): string {
  const canonical = JSON.stringify(canonicalValue(result));
  return createHash('sha256').update(DOMAIN).update(canonical).digest('hex');
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, canonicalValue(child)]),
  );
}
