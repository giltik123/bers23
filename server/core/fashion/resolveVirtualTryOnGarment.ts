import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { ArtifactAuthority } from '../artifacts/artifactAuthority.ts';
import type { PostgresProjectStore } from '../projects/postgresProjectStore.ts';
import type { PostgresGarmentStore } from './postgresGarmentStore.ts';
import type { PostgresGarmentWardrobeStore } from './postgresGarmentWardrobeStore.ts';
import type { AuthenticatedScope, VirtualTryOnGarment } from '../application/creativeExecutionService.ts';

/** Read canonical, owner-scoped bytes; a client URL/contour is never an input. */
export function createVirtualTryOnGarmentResolver(deps: Readonly<{
  garments: Pick<PostgresGarmentStore, 'get' | 'loadView'>;
  wardrobe: Pick<PostgresGarmentWardrobeStore, 'get'>;
  artifacts: Pick<ArtifactAuthority, 'resolveStoredImageEvidence'>;
  projects: Pick<PostgresProjectStore, 'get'>;
}>) {
  return async (scope: AuthenticatedScope & { projectId: string }, garmentId: string, sourceArtifactId: string): Promise<VirtualTryOnGarment> => {
    const source = await deps.artifacts.resolveStoredImageEvidence(scope, sourceArtifactId);
    const project = await deps.projects.get(scope, scope.projectId);
    if (!project || String(project.current_image_storage_id) !== source.storageId) throw denied(409, 'fashion_source_changed', 'The project image changed. Select the current photo again.');
    const garment = await deps.garments.get(scope, garmentId);
    const metadata = await deps.wardrobe.get(scope, garmentId);
    if (!garment || garment.status !== 'ACTIVE' || !metadata || metadata.status !== 'ACTIVE') throw denied(404, 'garment_not_found', 'Garment not found');
    const category = metadata.categoryGroup === 'dresses' ? 'one-pieces' : metadata.categoryGroup;
    if (category !== 'tops' && category !== 'bottoms' && category !== 'one-pieces') throw denied(422, 'fashion_category_unsupported', 'Choose a top, bottom or dress for this try-on model.');
    const view = await deps.garments.loadView(scope, garment.id, garment.primaryViewId);
    if (!view) throw denied(404, 'garment_not_found', 'Garment image is unavailable');
    const identity = createHash('sha256').update(JSON.stringify([garment.id, garment.primaryViewId, view.contentSha256, category])).digest('hex');
    const { data, info } = await sharp(view.bytes).ensureAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    return Object.freeze({ identity, category, artifact: Object.freeze({
      id: `fashion-reference:${identity}`, kind: 'image', role: 'WORKING', state: 'AVAILABLE',
      producerOperationId: 'managed-garment', scope,
      value: { width: info.width, height: info.height, data: new Uint8ClampedArray(data), format: 'RGBA8', orientation: 1, colorSpace: 'srgb' },
      metadata: { virtualTryOnReference: true },
    }) });
  };
}
function denied(status: number, code: string, message: string) { return Object.assign(new Error(message), { status, code }); }
