import type { ArtifactAuthority, StoredProjectImageEvidence } from '../artifacts/artifactAuthority.ts';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import type {
  ManagedProjectBodyAnchorSet,
  PostgresProjectBodyAnchorStore,
} from './postgresProjectBodyAnchorStore.ts';

export const MANUAL_BODY_ANCHOR_PRODUCER_ID = 'bers.manual-body-anchors';
export const MANUAL_BODY_ANCHOR_PRODUCER_VERSION = '1';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SOURCE_ARTIFACT_ID_LENGTH = 4096;

type ArtifactReader = Pick<ArtifactAuthority, 'resolveStoredImageEvidence'>;
type AnchorWriter = Pick<PostgresProjectBodyAnchorStore, 'createForExpectedImage'>;

export type ManualProjectBodyAnchorAcquisitionCommand = Readonly<{
  projectId: string;
  sourceArtifactId: string;
  payload: unknown;
}>;

export type ManualProjectBodyAnchorAcquisitionResult = Readonly<{
  projectId: string;
  sourceArtifactId: string;
  anchorSet: ManagedProjectBodyAnchorSet;
}>;

export type ManualProjectBodyAnchorAcquisitionDependencies = Readonly<{
  artifacts: ArtifactReader;
  bodyAnchors: AnchorWriter;
}>;

/**
 * Core-owned manual body-anchor acquisition authority.
 *
 * The caller supplies only stable Project/source intent plus explicit user anchor
 * positions. Storage identity, source hash/geometry and producer provenance are
 * resolved inside Core. The store's Project-row lock remains the final guard:
 * a signed historical source cannot be rebound to a newer Project image.
 *
 * This service creates immutable body-anchor evidence only. It owns no Project
 * mutation, FINAL, provider, Billing, cloud or Try-On execution authority.
 */
export class ManualProjectBodyAnchorAcquisitionService {
  constructor(private readonly dependencies: ManualProjectBodyAnchorAcquisitionDependencies) {}

  async acquire(
    auth: AuthenticatedScope,
    command: ManualProjectBodyAnchorAcquisitionCommand,
  ): Promise<ManualProjectBodyAnchorAcquisitionResult> {
    const normalized = normalizeCommand(command);
    const projectScope = Object.freeze({ ...auth, projectId: normalized.projectId });
    const owner = Object.freeze({ tenantId: auth.tenantId, userId: auth.userId });
    const source = await this.dependencies.artifacts.resolveStoredImageEvidence(projectScope, normalized.sourceArtifactId);
    assertResolvedProjectImage(source, normalized.projectId);

    const anchorSet = await this.dependencies.bodyAnchors.createForExpectedImage(
      owner,
      normalized.projectId,
      Object.freeze({
        storageId: source.storageId,
        sha256: source.sha256,
        width: source.width,
        height: source.height,
      }),
      Object.freeze({
        payload: normalized.payload,
        producerId: MANUAL_BODY_ANCHOR_PRODUCER_ID,
        producerVersion: MANUAL_BODY_ANCHOR_PRODUCER_VERSION,
      }),
    );

    if (anchorSet.projectId !== normalized.projectId) {
      throw acquisitionError(409, 'body_anchor_acquisition_authority_mismatch', 'Persisted body-anchor evidence escaped the requested Project');
    }
    return Object.freeze({
      projectId: normalized.projectId,
      sourceArtifactId: normalized.sourceArtifactId,
      anchorSet,
    });
  }
}

function normalizeCommand(command: ManualProjectBodyAnchorAcquisitionCommand): ManualProjectBodyAnchorAcquisitionCommand {
  if (!command || typeof command !== 'object') {
    throw acquisitionError(400, 'invalid_manual_body_anchor_request', 'Manual body-anchor acquisition request must be an object');
  }
  if (typeof command.projectId !== 'string' || !UUID_PATTERN.test(command.projectId)) {
    throw acquisitionError(400, 'invalid_manual_body_anchor_request', 'projectId must be a UUID');
  }
  if (typeof command.sourceArtifactId !== 'string') {
    throw acquisitionError(400, 'invalid_manual_body_anchor_request', 'sourceArtifactId must be a string');
  }
  const sourceArtifactId = command.sourceArtifactId.trim();
  if (
    !sourceArtifactId
    || sourceArtifactId.length > MAX_SOURCE_ARTIFACT_ID_LENGTH
    || /[\u0000-\u001f\u007f]/u.test(sourceArtifactId)
  ) throw acquisitionError(400, 'invalid_manual_body_anchor_request', 'sourceArtifactId is outside the accepted identifier contract');
  return Object.freeze({
    projectId: command.projectId.toLowerCase(),
    sourceArtifactId,
    payload: command.payload,
  });
}

function assertResolvedProjectImage(source: StoredProjectImageEvidence, projectId: string): void {
  if (
    source.projectId !== projectId
    || !source.storageId
    || !/^[0-9a-f]{64}$/.test(source.sha256)
    || !Number.isSafeInteger(source.width) || source.width < 1
    || !Number.isSafeInteger(source.height) || source.height < 1
    || !((source.role === 'ORIGINAL' && source.lifecycle === 'IMMUTABLE') || (source.role === 'COMPOSITE' && source.lifecycle === 'FINAL'))
  ) throw acquisitionError(409, 'body_anchor_source_evidence_invalid', 'Resolved Project source is outside the canonical image evidence contract');
}

function acquisitionError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}
