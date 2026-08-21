import { randomUUID } from 'node:crypto';
import { CreativeExecutionService, publicError, type AuthenticatedScope, type CreativeEditCommand } from '../application/creativeExecutionService.ts';

export type CoreRequest = Readonly<{ body?: unknown; auth?: AuthenticatedScope; correlationId?: string }>;
export type CoreResponse = Readonly<{ status: number; body: unknown }>;

/** Framework-neutral POST /api/core/creative/execute transport adapter. */
export function createCreativeExecuteHandler(service: CreativeExecutionService) {
  return async (request: CoreRequest): Promise<CoreResponse> => {
    const correlationId = request.correlationId ?? randomUUID();
    try {
      if (!request.auth) throw publicError('unauthenticated', 'Authentication is required', 401, false);
      const command = validate(request.body);
      const outcome = await service.execute(command, request.auth, correlationId);
      return { status: outcome.status === 'UNKNOWN' ? 202 : 200, body: publicCreativeOutcome(outcome, correlationId, artifact => service.deliveryUrl(artifact)) };
    } catch (cause) {
      const error = cause as Error & { code?: string; status?: number; retryable?: boolean };
      return { status: error.status ?? 500, body: { code: error.code ?? 'creative_execution_failed', message: error.status ? error.message : 'Creative execution failed', correlationId, retryable: error.retryable ?? false } };
    }
  };
}
export function publicCreativeOutcome(outcome: Awaited<ReturnType<CreativeExecutionService['execute']>>, correlationId?: string, deliveryUrl?: (artifact: (typeof outcome.artifacts)[number]) => string | undefined) {
  const image = outcome.artifacts.find((artifact) => artifact.role === 'COMPOSITE' && artifact.state === 'FINAL') ?? outcome.artifacts.find((artifact) => artifact.kind === 'image');
  const freshUrl = image ? deliveryUrl?.(image) : undefined;
  return { executionId: outcome.executionId, ...(correlationId ? { correlationId } : {}), status: outcome.status, imageUrl: freshUrl ?? (typeof image?.value === 'object' && image?.value ? (image.value as { url?: string }).url : undefined), finalArtifactId: image?.role === 'COMPOSITE' && image.state === 'FINAL' ? image.id : undefined, artifacts: outcome.artifacts.map((artifact) => ({ id: artifact.id, kind: artifact.kind, role: artifact.role, url: artifact === image && freshUrl ? freshUrl : typeof artifact.value === 'object' && artifact.value ? (artifact.value as { url?: string }).url : undefined, state: artifact.state, parentArtifactIds: artifact.metadata?.parentArtifactIds })), verification: outcome.verification };
}
function validate(body: unknown): CreativeEditCommand { if (!body || typeof body !== 'object') throw publicError('validation_error', 'Request body is required', 400, false); const value = body as Record<string, unknown>; if (typeof value.projectId !== 'string' || !value.projectId.trim() || typeof value.instruction !== 'string' || !value.instruction.trim() || typeof value.inputArtifactId !== 'string' || !value.inputArtifactId || typeof value.clientRequestId !== 'string' || !value.clientRequestId) throw publicError('validation_error', 'projectId, instruction, inputArtifactId and clientRequestId are required', 400, false); return { projectId: value.projectId, instruction: value.instruction, inputArtifactId: value.inputArtifactId, clientRequestId: value.clientRequestId, selectedObjectIds: arrayOfStrings(value.selectedObjectIds), maskArtifactIds: arrayOfStrings(value.maskArtifactIds), preserveMode: typeof value.preserveMode === 'string' ? value.preserveMode : undefined }; }
function arrayOfStrings(value: unknown): string[] { if (value === undefined) return []; if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw publicError('validation_error', 'Artifact and object IDs must be string arrays', 400, false); return value; }
