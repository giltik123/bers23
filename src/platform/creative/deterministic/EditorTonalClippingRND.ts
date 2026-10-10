/**
 * Pixel-domain clipping diagnostics for local Editor previews.
 *
 * An advisory signal, not a perceptual-quality score. sRGB byte thresholds
 * depend on editing intent and output profile; human review remains required.
 * Fully transparent pixels are not counted as visibly clipped.
 */
export function analyzeEditorTonalClippingRgba8(
  source: Uint8Array | Uint8ClampedArray,
  result: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  editableMask?: Uint8Array | Uint8ClampedArray,
): Readonly<{
  visiblePixelCount: number;
  editableVisiblePixelCount: number;
  originallyBrightPixelCount: number;
  resultingBrightPixelCount: number;
  newlyBrightEditablePixelCount: number;
  originallyCrushedShadowPixelCount: number;
  resultingCrushedShadowPixelCount: number;
  newlyCrushedEditablePixelCount: number;
  clipThreshold: 250;
  shadowThreshold: 5;
  releaseQualityDecision: 'UNREVIEWED_DIAGNOSTIC_ONLY';
}> {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || width > 16_384 || height > 16_384 ||
      width * height > 16_777_216) {
    throw new Error('Tonal clipping geometry is invalid');
  }
  const length=width*height*4, pixels=width*height;
  if (!(source instanceof Uint8Array || source instanceof Uint8ClampedArray) ||
      !(result instanceof Uint8Array || result instanceof Uint8ClampedArray) ||
      source.byteLength !== length || result.byteLength !== length ||
      (editableMask !== undefined &&
        (!(editableMask instanceof Uint8Array || editableMask instanceof Uint8ClampedArray) ||
          editableMask.byteLength !== pixels))) {
    throw new Error('Tonal clipping requires exact RGBA8 and optional R8 mask lengths');
  }
  let visiblePixelCount=0,editableVisiblePixelCount=0,originallyBrightPixelCount=0,
    resultingBrightPixelCount=0,newlyBrightEditablePixelCount=0,
    originallyCrushedShadowPixelCount=0,resultingCrushedShadowPixelCount=0,
    newlyCrushedEditablePixelCount=0;
  for(let pixel=0;pixel<pixels;pixel++){
    const i=pixel*4;
    if(source[i+3]===0 && result[i+3]===0)continue;
    visiblePixelCount++;
    const editable=editableMask===undefined || editableMask[pixel]>0;
    if(editable)editableVisiblePixelCount++;
    const brightBefore=Math.max(source[i],source[i+1],source[i+2])>=250;
    const brightAfter=Math.max(result[i],result[i+1],result[i+2])>=250;
    const crushedBefore=Math.max(source[i],source[i+1],source[i+2])<=5;
    const crushedAfter=Math.max(result[i],result[i+1],result[i+2])<=5;
    if(brightBefore)originallyBrightPixelCount++;
    if(brightAfter)resultingBrightPixelCount++;
    if(crushedBefore)originallyCrushedShadowPixelCount++;
    if(crushedAfter)resultingCrushedShadowPixelCount++;
    if(editable && !brightBefore && brightAfter)newlyBrightEditablePixelCount++;
    if(editable && !crushedBefore && crushedAfter)newlyCrushedEditablePixelCount++;
  }
  return Object.freeze({
    visiblePixelCount,editableVisiblePixelCount,originallyBrightPixelCount,
    resultingBrightPixelCount,newlyBrightEditablePixelCount,
    originallyCrushedShadowPixelCount,resultingCrushedShadowPixelCount,
    newlyCrushedEditablePixelCount,
    clipThreshold:250,shadowThreshold:5,
    releaseQualityDecision:'UNREVIEWED_DIAGNOSTIC_ONLY',
  });
}
