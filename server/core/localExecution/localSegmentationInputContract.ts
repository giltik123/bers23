export type LocalSegmentationPoint = Readonly<{
  x: number;
  y: number;
  label: 'POSITIVE' | 'NEGATIVE';
  coordinateSpace: 'ORIGINAL';
}>;

export type LocalSegmentationAnalysis = Readonly<{
  originalWidth: number;
  originalHeight: number;
  analysisWidth: number;
  analysisHeight: number;
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
}>;

export type LocalSegmentationSelection = Readonly<{
  analysis: LocalSegmentationAnalysis;
  points: readonly LocalSegmentationPoint[];
}>;

export type LocalSegmentationContractReason =
  | 'ANALYSIS_REQUIRED'
  | 'ANALYSIS_INVALID'
  | 'POINTS_INVALID'
  | 'SOURCE_MISMATCH'
  | 'POINT_OUT_OF_BOUNDS';

export class LocalSegmentationContractError extends Error {
  readonly reason: LocalSegmentationContractReason;
  constructor(reason: LocalSegmentationContractReason, message: string) {
    super(message);
    this.name = 'LocalSegmentationContractError';
    this.reason = reason;
  }
}

/**
 * Pure shared contract for all MobileSAM-style local selection entry points.
 * It owns no auth, Artifact, ticket, model, runtime, persistence or HTTP authority.
 */
export function normalizeLocalSegmentationSelection(
  analysisInput: unknown,
  pointsInput: unknown,
): LocalSegmentationSelection {
  if (!analysisInput || typeof analysisInput !== 'object' || Array.isArray(analysisInput)) {
    throw contractError('ANALYSIS_REQUIRED', 'Segmentation analysis transform is required');
  }
  const analysisRecord = analysisInput as Readonly<Record<string, unknown>>;
  const analysis = Object.freeze({
    originalWidth: finite(analysisRecord.originalWidth, 'originalWidth'),
    originalHeight: finite(analysisRecord.originalHeight, 'originalHeight'),
    analysisWidth: finite(analysisRecord.analysisWidth, 'analysisWidth'),
    analysisHeight: finite(analysisRecord.analysisHeight, 'analysisHeight'),
    scaleX: finite(analysisRecord.scaleX, 'scaleX'),
    scaleY: finite(analysisRecord.scaleY, 'scaleY'),
    offsetX: finite(analysisRecord.offsetX, 'offsetX'),
    offsetY: finite(analysisRecord.offsetY, 'offsetY'),
  });

  if (!Array.isArray(pointsInput) || pointsInput.length < 1 || pointsInput.length > 64) {
    throw contractError('POINTS_INVALID', 'Segmentation requires between 1 and 64 prompt points');
  }
  const points = Object.freeze(pointsInput.map(point => {
    if (!point || typeof point !== 'object' || Array.isArray(point)) {
      throw contractError('POINTS_INVALID', 'Segmentation prompt point is invalid');
    }
    const value = point as Readonly<Record<string, unknown>>;
    if (!Number.isFinite(value.x) || !Number.isFinite(value.y)
        || (value.label !== 'POSITIVE' && value.label !== 'NEGATIVE')
        || value.coordinateSpace !== 'ORIGINAL') {
      throw contractError('POINTS_INVALID', 'Segmentation prompt point is invalid');
    }
    return Object.freeze({
      x: Number(value.x),
      y: Number(value.y),
      label: value.label,
      coordinateSpace: 'ORIGINAL' as const,
    });
  }));
  return Object.freeze({ analysis, points });
}

export function validateLocalSegmentationGeometry(
  analysis: LocalSegmentationAnalysis,
  points: readonly LocalSegmentationPoint[],
  width: number,
  height: number,
): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw contractError('SOURCE_MISMATCH', 'Canonical source dimensions are invalid');
  }
  if (!Number.isInteger(analysis.originalWidth) || !Number.isInteger(analysis.originalHeight)
      || analysis.originalWidth !== width || analysis.originalHeight !== height) {
    throw contractError('SOURCE_MISMATCH', 'Analysis transform does not match the canonical source dimensions');
  }
  if (!Number.isInteger(analysis.analysisWidth) || !Number.isInteger(analysis.analysisHeight)
      || analysis.analysisWidth < 1 || analysis.analysisHeight < 1
      || analysis.analysisWidth > width || analysis.analysisHeight > height) {
    throw contractError('ANALYSIS_INVALID', 'Analysis resolution is invalid');
  }
  if (!(analysis.scaleX > 0) || !(analysis.scaleY > 0) || analysis.offsetX !== 0 || analysis.offsetY !== 0) {
    throw contractError('ANALYSIS_INVALID', 'Analysis transform must be a positive zero-offset source transform');
  }

  // scaleX/scaleY are derived geometry, not client-owned authority. The browser may use a
  // uniform pre-rounding scale while analysisWidth/analysisHeight are rounded to integer pixels,
  // so admit at most the half-analysis-pixel error introduced by that rounding. Anything wider
  // could move a prompt materially away from the canonical ORIGINAL coordinate selected by user.
  const expectedScaleX = analysis.analysisWidth / analysis.originalWidth;
  const expectedScaleY = analysis.analysisHeight / analysis.originalHeight;
  const toleranceX = 0.5 / analysis.originalWidth + Number.EPSILON;
  const toleranceY = 0.5 / analysis.originalHeight + Number.EPSILON;
  if (Math.abs(analysis.scaleX - expectedScaleX) > toleranceX
      || Math.abs(analysis.scaleY - expectedScaleY) > toleranceY) {
    throw contractError('ANALYSIS_INVALID', 'Analysis scale is inconsistent with the admitted analysis resolution');
  }

  for (const point of points) {
    if (point.x < 0 || point.y < 0 || point.x >= width || point.y >= height) {
      throw contractError('POINT_OUT_OF_BOUNDS', 'Segmentation prompt point is outside the canonical source');
    }
  }
}

function finite(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw contractError('ANALYSIS_INVALID', `Segmentation analysis ${field} is invalid`);
  }
  return value;
}
function contractError(reason: LocalSegmentationContractReason, message: string): LocalSegmentationContractError {
  return new LocalSegmentationContractError(reason, message);
}
