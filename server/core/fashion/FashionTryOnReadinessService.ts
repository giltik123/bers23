import type { Pool } from 'pg';
import type { StoredProjectImageEvidence } from '../artifacts/artifactAuthority.ts';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import type { GarmentDestinationMesh } from './bodyAnchorGeometry.ts';
import {
  garmentCategoryGroup,
  type GarmentCategoryGroup,
  type PostgresGarmentWardrobeStore,
} from './postgresGarmentWardrobeStore.ts';
import type {
  ManagedGarmentRepresentation,
  PostgresGarmentRepresentationStore,
} from './postgresGarmentRepresentationStore.ts';
import type { PostgresProjectBodyAnchorStore } from './postgresProjectBodyAnchorStore.ts';
import type { ArtifactAuthority } from '../artifacts/artifactAuthority.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUPPORTED_GROUPS = new Set<GarmentCategoryGroup>(['tops', 'bottoms', 'dresses', 'footwear']);

export const FASHION_TRYON_READINESS_STATUSES = Object.freeze([
  'READY',
  'SOURCE_UNAVAILABLE',
  'STALE_SOURCE',
  'GARMENT_UNAVAILABLE',
  'GARMENT_UNSUPPORTED',
  'REPRESENTATION_REQUIRED',
  'REPRESENTATION_AMBIGUOUS',
  'BODY_ANCHORS_REQUIRED',
  'BODY_ANCHORS_AMBIGUOUS',
  'EVIDENCE_INVALID',
] as const);

export type FashionTryOnReadinessStatus = (typeof FASHION_TRYON_READINESS_STATUSES)[number];
export type SupportedFashionGarmentGroup = Extract<GarmentCategoryGroup, 'tops' | 'bottoms' | 'dresses' | 'footwear'>;

export type FashionTryOnReadinessCommand = Readonly<{
  projectId: string;
  sourceArtifactId: string;
  garmentId: string;
}>;

export type FashionTryOnReadiness = Readonly<{
  status: FashionTryOnReadinessStatus;
  projectId: string;
  sourceArtifactId: string;
  garmentId: string;
  categoryGroup?: GarmentCategoryGroup;
}>;

export type ResolvedFashionTryOnEvidence = Readonly<{
  status: 'READY';
  projectId: string;
  sourceArtifactId: string;
  garmentId: string;
  categoryGroup: SupportedFashionGarmentGroup;
  source: StoredProjectImageEvidence;
  representationId: string;
  anchorSetId: string;
  destinationMesh: GarmentDestinationMesh;
}>;

export type FashionTryOnReadinessResolution = ResolvedFashionTryOnEvidence | FashionTryOnReadiness;

type ArtifactReader = Pick<ArtifactAuthority, 'resolveStoredImageEvidence'>;
type WardrobeReader = Pick<PostgresGarmentWardrobeStore, 'get'>;
type RepresentationReader = Pick<PostgresGarmentRepresentationStore, 'list'>;
type BodyAnchorAuthority = Pick<PostgresProjectBodyAnchorStore, 'deriveDestinationMesh'>;

export type FashionTryOnReadinessDependencies = Readonly<{
  pool: Pool;
  artifacts: ArtifactReader;
  wardrobe: WardrobeReader;
  representations: RepresentationReader;
  bodyAnchors: BodyAnchorAuthority;
}>;

type AnchorCandidate = Readonly<{ id: string; createdAt: string }>;

/**
 * Server-owned F4b.6 readiness resolver.
 *
 * Browser intent is limited to the current Project source and stable garmentId.
 * Representation and body-anchor identities never come from the browser. The
 * resolver selects candidate evidence, then delegates final geometry validation
 * to the already accepted F4b.3 body-anchor authority before reporting READY.
 *
 * This class does not issue execution tickets and does not grant provider,
 * Billing, cloud, FINAL or Project-mutation authority.
 */
export class FashionTryOnReadinessService {
  constructor(private readonly dependencies: FashionTryOnReadinessDependencies) {}

  async check(command: FashionTryOnReadinessCommand, auth: AuthenticatedScope): Promise<FashionTryOnReadiness> {
    const resolution = await this.resolve(command, auth);
    return Object.freeze({
      status: resolution.status,
      projectId: resolution.projectId,
      sourceArtifactId: resolution.sourceArtifactId,
      garmentId: resolution.garmentId,
      ...('categoryGroup' in resolution && resolution.categoryGroup ? { categoryGroup: resolution.categoryGroup } : {}),
    });
  }

  async resolve(command: FashionTryOnReadinessCommand, auth: AuthenticatedScope): Promise<FashionTryOnReadinessResolution> {
    const normalized = normalizeCommand(command);
    const scope = Object.freeze({ tenantId: auth.tenantId, userId: auth.userId });
    const projectScope = Object.freeze({ ...auth, projectId: normalized.projectId });

    let source: StoredProjectImageEvidence;
    try {
      source = await this.dependencies.artifacts.resolveStoredImageEvidence(projectScope, normalized.sourceArtifactId);
    } catch {
      return failure(normalized, 'SOURCE_UNAVAILABLE');
    }

    const project = await this.dependencies.pool.query(
      `SELECT current_image_storage_id
       FROM canonical_projects
       WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL`,
      [normalized.projectId, scope.tenantId, scope.userId],
    );
    const currentStorageId = project.rows[0]?.current_image_storage_id
      ? String(project.rows[0].current_image_storage_id).toLowerCase()
      : undefined;
    if (!currentStorageId) return failure(normalized, 'SOURCE_UNAVAILABLE');
    if (currentStorageId !== source.storageId) return failure(normalized, 'STALE_SOURCE');

    const wardrobe = await this.dependencies.wardrobe.get(scope, normalized.garmentId);
    if (!wardrobe || wardrobe.status !== 'ACTIVE') return failure(normalized, 'GARMENT_UNAVAILABLE');
    const categoryGroup = garmentCategoryGroup(wardrobe.category);
    if (!SUPPORTED_GROUPS.has(categoryGroup)) return failure(normalized, 'GARMENT_UNSUPPORTED', categoryGroup);

    const representations = selectRepresentations(await this.dependencies.representations.list(scope, normalized.garmentId));
    if (representations.length === 0) return failure(normalized, 'REPRESENTATION_REQUIRED', categoryGroup);
    if (representations.length > 1 && representations[0].admittedAt === representations[1].admittedAt) {
      return failure(normalized, 'REPRESENTATION_AMBIGUOUS', categoryGroup);
    }
    const representation = representations[0];

    const anchors = await loadAnchorCandidates(this.dependencies.pool, scope, normalized.projectId, source);
    if (anchors.length === 0) return failure(normalized, 'BODY_ANCHORS_REQUIRED', categoryGroup);
    if (anchors.length > 1 && anchors[0].createdAt === anchors[1].createdAt) {
      return failure(normalized, 'BODY_ANCHORS_AMBIGUOUS', categoryGroup);
    }
    const anchor = anchors[0];

    let destinationMesh: GarmentDestinationMesh;
    try {
      destinationMesh = await this.dependencies.bodyAnchors.deriveDestinationMesh(
        scope,
        normalized.projectId,
        anchor.id,
        normalized.garmentId,
        representation.id,
      );
    } catch (error) {
      return failure(normalized, mapEvidenceFailure(error), categoryGroup);
    }

    return Object.freeze({
      status: 'READY',
      projectId: normalized.projectId,
      sourceArtifactId: normalized.sourceArtifactId,
      garmentId: normalized.garmentId,
      categoryGroup: categoryGroup as SupportedFashionGarmentGroup,
      source,
      representationId: representation.id,
      anchorSetId: anchor.id,
      destinationMesh,
    });
  }
}

function selectRepresentations(values: readonly ManagedGarmentRepresentation[]): readonly ManagedGarmentRepresentation[] {
  return Object.freeze(values
    .filter(value => value.tier === 'PARAMETRIC'
      && value.format === 'BERS_PARAMETRIC_V1'
      && value.admissionState === 'ADMITTED'
      && value.revokedAt === null)
    .sort((left, right) => right.admittedAt.localeCompare(left.admittedAt) || left.id.localeCompare(right.id)));
}

async function loadAnchorCandidates(
  pool: Pool,
  scope: Readonly<{ tenantId: string; userId: string }>,
  projectId: string,
  source: StoredProjectImageEvidence,
): Promise<readonly AnchorCandidate[]> {
  const result = await pool.query(
    `SELECT anchor_set_id, created_at::text AS created_at_text
     FROM canonical_project_body_anchor_sets
     WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3
       AND project_image_storage_id=$4 AND project_image_sha256=$5
       AND project_image_width=$6 AND project_image_height=$7
     ORDER BY created_at DESC, anchor_set_id`,
    [projectId, scope.tenantId, scope.userId, source.storageId, source.sha256, source.width, source.height],
  );
  return Object.freeze(result.rows.map(row => Object.freeze({
    id: String(row.anchor_set_id).toLowerCase(),
    createdAt: String(row.created_at_text),
  })));
}

function mapEvidenceFailure(error: unknown): FashionTryOnReadinessStatus {
  const code = typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : '';
  if (code === 'body_anchor_project_evidence_stale') return 'STALE_SOURCE';
  if (code === 'body_anchor_garment_unavailable') return 'GARMENT_UNAVAILABLE';
  if (code === 'body_anchor_set_not_found') return 'BODY_ANCHORS_REQUIRED';
  if (code === 'body_anchor_garment_representation_unavailable' || code === 'body_anchor_garment_representation_stale') {
    return 'REPRESENTATION_REQUIRED';
  }
  if (code.includes('required_anchor') || code.includes('anchor_missing')) return 'BODY_ANCHORS_REQUIRED';
  return 'EVIDENCE_INVALID';
}

function failure(
  command: FashionTryOnReadinessCommand,
  status: Exclude<FashionTryOnReadinessStatus, 'READY'>,
  categoryGroup?: GarmentCategoryGroup,
): FashionTryOnReadiness {
  return Object.freeze({
    status,
    projectId: command.projectId,
    sourceArtifactId: command.sourceArtifactId,
    garmentId: command.garmentId,
    ...(categoryGroup ? { categoryGroup } : {}),
  });
}

function normalizeCommand(command: FashionTryOnReadinessCommand): FashionTryOnReadinessCommand {
  if (!command || typeof command !== 'object') throw requestError('Fashion Try-On readiness request must be an object');
  if (typeof command.projectId !== 'string' || !UUID_PATTERN.test(command.projectId)) throw requestError('projectId must be a UUID');
  if (typeof command.garmentId !== 'string' || !UUID_PATTERN.test(command.garmentId)) throw requestError('garmentId must be a UUID');
  if (typeof command.sourceArtifactId !== 'string') throw requestError('sourceArtifactId must be a string');
  const sourceArtifactId = command.sourceArtifactId.trim();
  if (!sourceArtifactId || sourceArtifactId.length > 4096 || /[\u0000-\u001f\u007f]/u.test(sourceArtifactId)) {
    throw requestError('sourceArtifactId is outside the accepted identifier contract');
  }
  return Object.freeze({
    projectId: command.projectId.toLowerCase(),
    sourceArtifactId,
    garmentId: command.garmentId.toLowerCase(),
  });
}

function requestError(message: string): Error & { status: 400; code: 'invalid_fashion_tryon_readiness_request' } {
  return Object.assign(new Error(message), { status: 400 as const, code: 'invalid_fashion_tryon_readiness_request' as const });
}
