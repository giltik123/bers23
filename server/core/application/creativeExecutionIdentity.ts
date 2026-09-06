import { createHash } from 'node:crypto';
import type { AuthenticatedScope, CreativeEditCommand } from './creativeExecutionService.ts';

const IDENTITY_VERSION = 'creative-request-v1';
const RUN_KEY_VERSION = 'creative-run-v1';

export type CreativeExecutionIdentity = Readonly<{
  executionId: string;
  requestFingerprint: string;
  runIdempotencyKey: string;
}>;

/**
 * Preserve the accepted public execution identity while adding a separate,
 * payload-sensitive durable replay identity. The request fingerprint is
 * deliberately exact: array ordering, whitespace and optional-field presence
 * remain part of identity so a changed request can never be mistaken for replay.
 */
export function creativeExecutionIdentity(
  command: CreativeEditCommand,
  auth: AuthenticatedScope,
): CreativeExecutionIdentity {
  const executionKey = `${auth.tenantId}:${auth.userId}:${command.projectId}:${command.clientRequestId}`;
  const executionId = `creative-${sha256(executionKey).slice(0, 24)}`;
  const requestFingerprint = sha256(JSON.stringify([
    IDENTITY_VERSION,
    auth.tenantId,
    auth.userId,
    command.projectId,
    command.instruction,
    command.inputArtifactId,
    command.selectedObjectIds === undefined ? null : [...command.selectedObjectIds],
    command.maskArtifactIds === undefined ? null : [...command.maskArtifactIds],
    command.preserveMode === undefined ? null : command.preserveMode,
  ]));
  const runIdempotencyKey = `${RUN_KEY_VERSION}:${sha256(`${command.clientRequestId}\u0000${requestFingerprint}`)}`;
  return Object.freeze({ executionId, requestFingerprint, runIdempotencyKey });
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
