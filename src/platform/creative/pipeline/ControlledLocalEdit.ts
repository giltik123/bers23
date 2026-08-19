/** Provider-independent, lossless local-image transformation capability. */
export type PreserveMode = 'STRICT' | 'BALANCED' | 'CREATIVE';
export type MaskSource = 'USER' | 'SEGMENTATION' | 'AUTO_REFINED' | 'MANUAL_ADD' | 'MANUAL_SUBTRACT' | 'OPERATION_EXPANDED';
export type Bounds = Readonly<{ x: number; y: number; width: number; height: number }>;
export type PixelImage = Readonly<{ width: number; height: number; data: Uint8ClampedArray; format?: string; orientation?: 1 | 3 | 6 | 8; colorSpace?: string }>;
export type OriginalMask = Readonly<{ artifactId: string; width: number; height: number; coordinateSpace: 'ORIGINAL'; source: MaskSource; bounds: Bounds; alpha: Uint8Array; userMaskArtifactId?: string }>;
export type RoiTransform = Readonly<{ originalBounds: Bounds; providerWidth: number; providerHeight: number; scaleX: number; scaleY: number }>;
export type LocalEditPolicy = Readonly<{ preserveMode: PreserveMode; haloPixels?: number; haloRatio?: number; minimumProviderSize?: number; noiseThreshold?: number; outsideChangedPixelRatioLimit?: number; boundaryMeanDeltaLimit?: number }>;
export type DisplayTransform = Readonly<{ displayWidth: number; displayHeight: number; originalWidth: number; originalHeight: number; devicePixelRatio?: number; zoom?: number; panX?: number; panY?: number }>;
export type IntegrityMetrics = Readonly<{ originalPixels: number; roiPixels: number; providerPixels: number; pixelReductionRatio: number; maskCoverage: number; roiCoverage: number; originalBytes: number; providerInputBytes: number; providerOutputBytes: number; outsideChangedPixelRatio: number; outsideMeanDelta: number; outsideMaxDelta: number; boundaryDelta: number; boundaryScore: number; verificationOutcome: 'PASS' | 'FAIL'; preserveMode: PreserveMode }>;

const DEFAULTS = Object.freeze({ STRICT: { noise: 0, outside: 0, boundary: .35 }, BALANCED: { noise: 2 / 255, outside: .002, boundary: .5 }, CREATIVE: { noise: 4 / 255, outside: .01, boundary: .7 } });

export function createOriginalMask(input: Omit<OriginalMask, 'coordinateSpace' | 'bounds'> & { bounds?: Bounds }): OriginalMask {
  if (!input.artifactId || !Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width < 1 || input.height < 1 || input.alpha.length !== input.width * input.height) throw new Error('Malformed mask or mask/image resolution mismatch');
  let minX = input.width, minY = input.height, maxX = -1, maxY = -1;
  input.alpha.forEach((alpha, index) => { if (alpha) { const x = index % input.width, y = Math.floor(index / input.width); minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); } });
  if (maxX < 0) throw new Error('Mask must not be empty');
  const actual = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  if (input.bounds && JSON.stringify(input.bounds) !== JSON.stringify(actual)) throw new Error('Mask bounds do not match alpha data');
  return Object.freeze({ ...input, alpha: new Uint8Array(input.alpha), coordinateSpace: 'ORIGINAL' as const, bounds: Object.freeze(actual) });
}

/** Maps CSS/UI coordinates through letterboxing, DPR, zoom and pan into normalized original pixels. */
export function displayToOriginal(point: Readonly<{ x: number; y: number }>, view: DisplayTransform): Readonly<{ x: number; y: number }> {
  const dpr = view.devicePixelRatio ?? 1, zoom = view.zoom ?? 1;
  if (dpr <= 0 || zoom <= 0 || view.displayWidth <= 0 || view.displayHeight <= 0) throw new Error('Invalid display transform');
  const cssWidth = view.displayWidth / dpr, cssHeight = view.displayHeight / dpr;
  const baseScale = Math.min(cssWidth / view.originalWidth, cssHeight / view.originalHeight);
  const renderedWidth = view.originalWidth * baseScale * zoom, renderedHeight = view.originalHeight * baseScale * zoom;
  const left = (cssWidth - renderedWidth) / 2 + (view.panX ?? 0), top = (cssHeight - renderedHeight) / 2 + (view.panY ?? 0);
  return Object.freeze({ x: clamp((point.x - left) / (baseScale * zoom), 0, view.originalWidth), y: clamp((point.y - top) / (baseScale * zoom), 0, view.originalHeight) });
}

export function buildRoi(mask: OriginalMask, image: Pick<PixelImage, 'width' | 'height'>, policy: LocalEditPolicy): Readonly<{ bounds: Bounds; transform: RoiTransform }> {
  assertMaskImage(mask, image); const halo = Math.max(policy.haloPixels ?? 0, Math.ceil(Math.max(mask.bounds.width, mask.bounds.height) * (policy.haloRatio ?? 0)));
  const x = Math.max(0, mask.bounds.x - halo), y = Math.max(0, mask.bounds.y - halo), right = Math.min(image.width, mask.bounds.x + mask.bounds.width + halo), bottom = Math.min(image.height, mask.bounds.y + mask.bounds.height + halo);
  const bounds = Object.freeze({ x, y, width: right - x, height: bottom - y }); const minimum = Math.max(1, policy.minimumProviderSize ?? 1); const scale = Math.max(1, minimum / bounds.width, minimum / bounds.height);
  const providerWidth = Math.ceil(bounds.width * scale), providerHeight = Math.ceil(bounds.height * scale);
  return Object.freeze({ bounds, transform: Object.freeze({ originalBounds: bounds, providerWidth, providerHeight, scaleX: providerWidth / bounds.width, scaleY: providerHeight / bounds.height }) });
}

export function extractRoi(image: PixelImage, transform: RoiTransform): PixelImage { return resample(image, transform.originalBounds, transform.providerWidth, transform.providerHeight); }
export function extractProviderMask(mask: OriginalMask, transform: RoiTransform): Uint8Array {
  const output = new Uint8Array(transform.providerWidth * transform.providerHeight), b = transform.originalBounds;
  for (let y = 0; y < transform.providerHeight; y++) for (let x = 0; x < transform.providerWidth; x++) { const ox = b.x + Math.min(b.width - 1, Math.floor(x / transform.scaleX)), oy = b.y + Math.min(b.height - 1, Math.floor(y / transform.scaleY)); output[y * transform.providerWidth + x] = mask.alpha[oy * mask.width + ox]; }
  return output;
}

/** Copies provider pixels only with mask alpha; all protected pixels stay byte-identical. */
export function compositePatch(original: PixelImage, patch: PixelImage, mask: OriginalMask, transform: RoiTransform): PixelImage {
  assertImage(original); assertImage(patch); assertMaskImage(mask, original); if (patch.width !== transform.providerWidth || patch.height !== transform.providerHeight) throw new Error('Patch/transform resolution mismatch');
  const result = new Uint8ClampedArray(original.data), b = transform.originalBounds;
  for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) { const ox = b.x + x, oy = b.y + y, alpha = mask.alpha[oy * mask.width + ox] / 255; if (!alpha) continue; const px = Math.min(patch.width - 1, Math.floor(x * transform.scaleX)), py = Math.min(patch.height - 1, Math.floor(y * transform.scaleY)), source = (py * patch.width + px) * 4, target = (oy * original.width + ox) * 4; for (let channel = 0; channel < 4; channel++) result[target + channel] = Math.round(original.data[target + channel] * (1 - alpha) + patch.data[source + channel] * alpha); }
  return Object.freeze({ ...original, data: result, orientation: 1 as const });
}

export function verifyControlledEdit(original: PixelImage, final: PixelImage, mask: OriginalMask, policy: LocalEditPolicy): Readonly<{ valid: boolean; checks: readonly string[]; errors: readonly string[]; metrics: Omit<IntegrityMetrics, 'originalPixels' | 'roiPixels' | 'providerPixels' | 'pixelReductionRatio' | 'maskCoverage' | 'roiCoverage' | 'originalBytes' | 'providerInputBytes' | 'providerOutputBytes' | 'preserveMode'> }> {
  assertImage(original); assertImage(final); assertMaskImage(mask, original); if (final.width !== original.width || final.height !== original.height) throw new Error('Final result must retain original resolution');
  const preset = DEFAULTS[policy.preserveMode], threshold = policy.noiseThreshold ?? preset.noise, boundaryLimit = policy.boundaryMeanDeltaLimit ?? preset.boundary; let outside = 0, changed = 0, sum = 0, max = 0, boundarySum = 0, boundaryCount = 0;
  for (let i = 0; i < mask.alpha.length; i++) { const delta = pixelDelta(original.data, final.data, i * 4); const alpha = mask.alpha[i]; if (!alpha) { outside++; sum += delta; max = Math.max(max, delta); if (delta > threshold) changed++; } if (alpha > 0 && alpha < 255) { boundarySum += delta; boundaryCount++; } }
  const ratio = changed / Math.max(1, outside), mean = sum / Math.max(1, outside), boundary = boundarySum / Math.max(1, boundaryCount), valid = ratio <= (policy.outsideChangedPixelRatioLimit ?? preset.outside) && boundary <= boundaryLimit;
  return Object.freeze({ valid, checks: Object.freeze(['original-resolution', 'protected-outside', 'boundary-quality']), errors: Object.freeze(valid ? [] : [ratio > (policy.outsideChangedPixelRatioLimit ?? preset.outside) ? 'Protected outside region changed' : 'Boundary quality threshold exceeded']), metrics: Object.freeze({ outsideChangedPixelRatio: ratio, outsideMeanDelta: mean, outsideMaxDelta: max, boundaryDelta: boundary, boundaryScore: 1 - boundary, verificationOutcome: valid ? 'PASS' as const : 'FAIL' as const }) });
}

export async function executeControlledLocalEdit(input: Readonly<{ executionId: string; original: PixelImage; mask: OriginalMask; maskArtifactId: string; instruction: string; policy: LocalEditPolicy; originalBytes?: number; provider: (request: Readonly<{ roi: PixelImage; mask: Uint8Array; instruction: string; preservationConstraints: PreserveMode; transform: RoiTransform }>) => Promise<PixelImage> }>) {
  const roi = buildRoi(input.mask, input.original, input.policy), providerMask = extractProviderMask(input.mask, roi.transform), roiImage = extractRoi(input.original, roi.transform); const candidate = await input.provider({ roi: roiImage, mask: providerMask, instruction: input.instruction, preservationConstraints: input.policy.preserveMode, transform: roi.transform }); const composite = compositePatch(input.original, candidate, input.mask, roi.transform); const verification = verifyControlledEdit(input.original, composite, input.mask, input.policy);
  const maskPixels = input.mask.alpha.reduce((n, value) => n + (value > 0 ? 1 : 0), 0), originalPixels = input.original.width * input.original.height, roiPixels = roi.bounds.width * roi.bounds.height, providerPixels = candidate.width * candidate.height;
  const metrics: IntegrityMetrics = Object.freeze({ ...verification.metrics, originalPixels, roiPixels, providerPixels, pixelReductionRatio: 1 - providerPixels / originalPixels, maskCoverage: maskPixels / originalPixels, roiCoverage: roiPixels / originalPixels, originalBytes: input.originalBytes ?? input.original.data.byteLength, providerInputBytes: roiImage.data.byteLength + providerMask.byteLength, providerOutputBytes: candidate.data.byteLength, preserveMode: input.policy.preserveMode });
  return Object.freeze({ candidatePatch: Object.freeze({ role: 'PATCH' as const, sourceExecutionId: input.executionId, roiBounds: roi.bounds, transform: roi.transform, maskArtifactId: input.maskArtifactId, image: candidate }), composite: Object.freeze({ role: 'COMPOSITE' as const, image: composite }), verification, metrics });
}

function assertMaskImage(mask: OriginalMask, image: Pick<PixelImage, 'width' | 'height'>) { if (mask.coordinateSpace !== 'ORIGINAL' || mask.width !== image.width || mask.height !== image.height) throw new Error('Mask/image resolution mismatch'); }
function assertImage(image: PixelImage) { if (image.width < 1 || image.height < 1 || image.data.length !== image.width * image.height * 4) throw new Error('Malformed RGBA image'); }
function pixelDelta(a: Uint8ClampedArray, b: Uint8ClampedArray, offset: number) { return (Math.abs(a[offset] - b[offset]) + Math.abs(a[offset + 1] - b[offset + 1]) + Math.abs(a[offset + 2] - b[offset + 2]) + Math.abs(a[offset + 3] - b[offset + 3])) / (4 * 255); }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function resample(image: PixelImage, bounds: Bounds, width: number, height: number): PixelImage { assertImage(image); const data = new Uint8ClampedArray(width * height * 4); for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const sx = bounds.x + Math.min(bounds.width - 1, Math.floor(x * bounds.width / width)), sy = bounds.y + Math.min(bounds.height - 1, Math.floor(y * bounds.height / height)), source = (sy * image.width + sx) * 4, target = (y * width + x) * 4; data.set(image.data.subarray(source, source + 4), target); } return Object.freeze({ width, height, data, format: 'raw', orientation: 1 }); }
