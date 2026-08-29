import type { ManagedGarment } from './postgresGarmentStore.ts';

export const CARDINAL_GARMENT_VIEW_KINDS = Object.freeze(['FRONT', 'BACK', 'LEFT', 'RIGHT'] as const);
export const MIN_TECHNICAL_CAPTURE_SHORT_EDGE_PX = 512;
type CardinalViewKind = (typeof CARDINAL_GARMENT_VIEW_KINDS)[number];

export type ManagedGarmentCaptureAssessment = Readonly<{
  cardinalComplete: boolean;
  cardinalCoverageScore: number;
  presentCardinalViewKinds: readonly CardinalViewKind[];
  missingCardinalViewKinds: readonly CardinalViewKind[];
  detailViewCount: number;
  unspecifiedViewCount: number;
  technicalResolution: Readonly<{
    status: 'ADEQUATE' | 'NEEDS_HIGHER_RESOLUTION';
    minimumBestCardinalShortEdgePx: number;
    thresholdShortEdgePx: number;
    lowResolutionCardinalViewKinds: readonly CardinalViewKind[];
    lowResolutionViewIds: readonly string[];
  }>;
  semanticQuality: 'NOT_ASSESSED';
  nextCaptureRequests: readonly Readonly<{
    viewKind: CardinalViewKind;
    reason: 'MISSING_CARDINAL_VIEW' | 'LOW_RESOLUTION_CARDINAL_VIEW';
  }>[];
}>;

/**
 * Deterministic evidence assessment only. It does not infer hidden garment geometry,
 * visibility, material, fit or semantic image quality. For each cardinal kind, technical
 * resolution uses the best available immutable view so a better recapture can improve
 * evidence without deleting or replacing older managed views.
 */
export function assessManagedGarmentCapture(garment: ManagedGarment): ManagedGarmentCaptureAssessment {
  const bestByKind = new Map<CardinalViewKind, { id: string; shortEdgePx: number }>();
  for (const view of garment.views) {
    if (!(CARDINAL_GARMENT_VIEW_KINDS as readonly string[]).includes(view.kind)) continue;
    const kind = view.kind as CardinalViewKind;
    const shortEdgePx = Math.min(view.width, view.height);
    const current = bestByKind.get(kind);
    if (!current || shortEdgePx > current.shortEdgePx) bestByKind.set(kind, { id: view.id, shortEdgePx });
  }

  const present = CARDINAL_GARMENT_VIEW_KINDS.filter(kind => bestByKind.has(kind));
  const missing = CARDINAL_GARMENT_VIEW_KINDS.filter(kind => !bestByKind.has(kind));
  const lowKinds = present.filter(kind => (bestByKind.get(kind)?.shortEdgePx ?? 0) < MIN_TECHNICAL_CAPTURE_SHORT_EDGE_PX);
  const lowResolutionViewIds = lowKinds.map(kind => bestByKind.get(kind)!.id);
  const bestShortEdges = present.map(kind => bestByKind.get(kind)!.shortEdgePx);
  const minimumBestCardinalShortEdgePx = bestShortEdges.length > 0 ? Math.min(...bestShortEdges) : 0;

  return Object.freeze({
    cardinalComplete: missing.length === 0,
    cardinalCoverageScore: present.length / CARDINAL_GARMENT_VIEW_KINDS.length,
    presentCardinalViewKinds: Object.freeze([...present]),
    missingCardinalViewKinds: Object.freeze([...missing]),
    detailViewCount: garment.views.filter(view => view.kind === 'DETAIL').length,
    unspecifiedViewCount: garment.views.filter(view => view.kind === 'UNSPECIFIED').length,
    technicalResolution: Object.freeze({
      status: lowKinds.length === 0 ? 'ADEQUATE' : 'NEEDS_HIGHER_RESOLUTION',
      minimumBestCardinalShortEdgePx,
      thresholdShortEdgePx: MIN_TECHNICAL_CAPTURE_SHORT_EDGE_PX,
      lowResolutionCardinalViewKinds: Object.freeze([...lowKinds]),
      lowResolutionViewIds: Object.freeze(lowResolutionViewIds),
    }),
    semanticQuality: 'NOT_ASSESSED',
    nextCaptureRequests: Object.freeze([
      ...missing.map(viewKind => Object.freeze({ viewKind, reason: 'MISSING_CARDINAL_VIEW' as const })),
      ...lowKinds.map(viewKind => Object.freeze({ viewKind, reason: 'LOW_RESOLUTION_CARDINAL_VIEW' as const })),
    ]),
  });
}
