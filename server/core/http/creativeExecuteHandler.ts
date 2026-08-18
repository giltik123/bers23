import { randomUUID } from 'node:crypto';
import { CreativeExecutionService, publicError, type AuthenticatedScope, type CreativeEditCommand } from '../application/creativeExecutionService.ts';

export type CoreRequest = Readonly<{ body?: unknown; auth?: AuthenticatedScope }>;
export type CoreResponse = Readonly<{ status: number; body: unknown }>;

/** Framework-neutral POST /api/core/creative/execute transport adapter. */
export function createCreativeExecuteHandler(service: CreativeExecutionService) {
  return async (request: CoreRequest): Promise<CoreResponse> => {
    const correlationId = randomUUID();
    try {
      if (!request.auth) throw publicError('unauthenticated', 'Authentication is required', 401, false);
      const command = validate(request.body);
      const outcome = await service.execute(command, request.auth);
      const image = outcome.artifacts.find((artifact) => artifact.kind === 'image');
      return { status: outcome.status === 'UNKNOWN' ? 202 : 200, body: { executionId: outcome.executionId, correlationId, status: outcome.status, imageUrl: typeof image?.value === 'object' && image?.value ? (image.value as { url?: string }).url : undefined, artifacts: outcome.artifacts.map((artifact) => ({ id: artifact.id, kind: artifact.kind, url: typeof artifact.value === 'object' && artifact.value ? (artifact.value as { url?: string }).url : undefined, state: artifact.state })), verification: outcome.verification } };
    } catch (cause) {
      const error = cause as Error & { code?: string; status?: number; retryable?: boolean };
      return { status: error.status ?? 500, body: { code: error.code ?? 'creative_execution_failed', message: error.status ? error.message : 'Creative execution failed', correlationId, retryable: error.retryable ?? false } };
    }
  };
}
function validate(body: unknown): CreativeEditCommand { if (!body || typeof body !== 'object') throw publicError('validation_error', 'Request body is required', 400, false); const value = body as Record<string, unknown>; if (typeof value.projectId !== 'string' || !value.projectId.trim() || typeof value.instruction !== 'string' || !value.instruction.trim() || typeof value.inputArtifactId !== 'string' || !value.inputArtifactId || typeof value.clientRequestId !== 'string' || !value.clientRequestId) throw publicError('validation_error', 'projectId, instruction, inputArtifactId and clientRequestId are required', 400, false); return { projectId: value.projectId, instruction: value.instruction, inputArtifactId: value.inputArtifactId, clientRequestId: value.clientRequestId, selectedObjectIds: arrayOfStrings(value.selectedObjectIds), maskArtifactIds: arrayOfStrings(value.maskArtifactIds), preserveMode: typeof value.preserveMode === 'string' ? value.preserveMode : undefined }; }
function arrayOfStrings(value: unknown): string[] { if (value === undefined) return []; if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw publicError('validation_error', 'Artifact and object IDs must be string arrays', 400, false); return value; }
