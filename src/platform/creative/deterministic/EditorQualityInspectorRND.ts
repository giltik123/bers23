/**
 * BERS Editor image-integrity inspector, research only.
 *
 * Works on already-decoded, same-geometry canonical orientation-1 RGBA8.
 * This reports deterministic byte changes, NOT perceived image quality.
 * Does not authorize Core, tenant, mask, provider or publication actions.
 */
export type EditorPixelQualitySummary = Readonly<{
  width: number;
  height: number;
  pixelCount: number;
  changedPixels: number;
  changedAlphaPixels: number;
  changedProtectedPixels: number;
  changedAuthorizedPixels: number;
  protectedPixels: number;
  changedChannels: number;
  meanAbsoluteRgbDelta: number;
  maximumAbsoluteRgbDelta: number;
  changedBoundingRect: Readonly<{ x: number; y: number; width: number; height: number }> | null;
}>;

function isBytes(value: unknown): value is Uint8Array | Uint8ClampedArray {
  return value instanceof Uint8Array || value instanceof Uint8ClampedArray;
}
function preflight(
  before: unknown,
  after: unknown,
  width: number,
  height: number,
  mask?: unknown,
): asserts before is Uint8Array | Uint8ClampedArray {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || width > 16_384 || height > 16_384 ||
      width * height > 16_777_216) {
    throw new Error('Editor quality audit geometry is invalid');
  }
  const count = width * height;
  if (!isBytes(before) || !isBytes(after) || before.byteLength !== count * 4 || after.byteLength !== count * 4) {
    throw new Error('Editor quality audit requires two exact RGBA8 buffers');
  }
  if (mask !== undefined && (!isBytes(mask) || mask.byteLength !== count)) {
    throw new Error('Editor quality audit mask must be exact R8 coverage');
  }
}

/**
 * A mask is a read-only *hypothesis* of allowed modification, not authority.
 * All nonzero 0..255 mask values mark editable pixels. Zero is protected.
 * Every RGBA byte is compared, including alpha and invisible RGB.
 */
export function analyzeEditorPixelQualityRgba8(
  before: Uint8Array | Uint8ClampedArray,
  after: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  allowedEditMask?: Uint8Array | Uint8ClampedArray,
): EditorPixelQualitySummary {
  preflight(before,after,width,height,allowedEditMask);
  let changedPixels = 0;
  let changedAlphaPixels = 0;
  let changedProtectedPixels = 0;
  let changedAuthorizedPixels = 0;
  let protectedPixels = 0;
  let changedChannels = 0;
  let rgbSum = 0;
  let rgbMaximum = 0;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  const pixels = width * height;
  for (let index = 0; index < pixels; index++) {
    const protectedPixel = allowedEditMask !== undefined && allowedEditMask[index] === 0;
    if (protectedPixel) protectedPixels++;
    const offset=index*4;
    let changed = false;
    for (let channel = 0; channel < 4; channel++) {
      const difference = Math.abs(before[offset+channel]-after[offset+channel]);
      if (difference > 0) {
        changed = true;
        changedChannels++;
        if (channel === 3) changedAlphaPixels++;
      }
      if (channel < 3) {
        rgbSum += difference;
        if (difference > rgbMaximum) rgbMaximum = difference;
      }
    }
    if (!changed) continue;
    changedPixels++;
    if (protectedPixel) changedProtectedPixels++; else changedAuthorizedPixels++;
    const x=index%width, y=Math.floor(index/width);
    minX=Math.min(minX,x); minY=Math.min(minY,y);
    maxX=Math.max(maxX,x); maxY=Math.max(maxY,y);
  }
  return Object.freeze({
    width,height,pixelCount:pixels,changedPixels,changedAlphaPixels,
    changedProtectedPixels,changedAuthorizedPixels,protectedPixels,changedChannels,
    meanAbsoluteRgbDelta:rgbSum/(pixels*3),
    maximumAbsoluteRgbDelta:rgbMaximum,
    changedBoundingRect:maxX<0?null:Object.freeze({x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1}),
  });
}

/** Fail closed on unauthorized change, including a transparent pixel's hidden RGB. */
export function requireEditorProtectedPixelsUnchanged(summary: EditorPixelQualitySummary): void {
  if (summary.changedProtectedPixels !== 0) {
    throw new Error(`Editor candidate changed ${summary.changedProtectedPixels} protected pixels`);
  }
}


/**
 * Minimal, independent sRGB tonal clipping diagnostic. Near-white means all
 * three 8-bit channels >=250; near-black means all <=5. Only pixels with
 * nonzero alpha inside a declared edit mask are scored. Neither criterion is
 * a skin-tone detector, histogram correction, gamut proof or quality gate.
 */
export function analyzeEditorTonalClippingRgba8(
  before: Uint8Array | Uint8ClampedArray,
  after: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  allowedEditMask?: Uint8Array | Uint8ClampedArray,
): Readonly<{
  evaluatedPixels: number;
  highlightsBefore: number;
  highlightsAfter: number;
  newlyClippedHighlights: number;
  shadowsBefore: number;
  shadowsAfter: number;
  newlyClippedShadows: number;
}> {
  preflight(before,after,width,height,allowedEditMask);
  let evaluatedPixels=0;
  let highlightsBefore=0,highlightsAfter=0,newlyClippedHighlights=0;
  let shadowsBefore=0,shadowsAfter=0,newlyClippedShadows=0;
  for(let i=0;i<width*height;i++){
    if(allowedEditMask && allowedEditMask[i]===0)continue;
    const p=i*4;
    const visibleBefore=before[p+3]>0;
    const visibleAfter=after[p+3]>0;
    if(!visibleBefore && !visibleAfter)continue;
    evaluatedPixels++;
    const brightBefore=visibleBefore &&
      before[p]>=250 && before[p+1]>=250 && before[p+2]>=250;
    const brightAfter=visibleAfter &&
      after[p]>=250 && after[p+1]>=250 && after[p+2]>=250;
    const darkBefore=visibleBefore &&
      before[p]<=5 && before[p+1]<=5 && before[p+2]<=5;
    const darkAfter=visibleAfter &&
      after[p]<=5 && after[p+1]<=5 && after[p+2]<=5;
    if(brightBefore)highlightsBefore++;
    if(brightAfter)highlightsAfter++;
    if(brightAfter&&!brightBefore)newlyClippedHighlights++;
    if(darkBefore)shadowsBefore++;
    if(darkAfter)shadowsAfter++;
    if(darkAfter&&!darkBefore)newlyClippedShadows++;
  }
  return Object.freeze({
    evaluatedPixels,highlightsBefore,highlightsAfter,newlyClippedHighlights,
    shadowsBefore,shadowsAfter,newlyClippedShadows,
  });
}
