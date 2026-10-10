/**
 * Non-authoritative Editor color fidelity diagnostics.
 *
 * CIEDE2000 color difference on canonical sRGB bytes with D65 reference
 * white. A reported Delta-E is a difference metric, not a "bad result" grade:
 * creative intent, tone, content and region semantics still need human review.
 *
 * Images must already have a trusted, common color space and geometry; this
 * function does not read ICC, infer skin masks, save Final or call a provider.
 */
export type LabD65 = Readonly<{ L: number; a: number; b: number }>;

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const MAX_PIXELS = 16_777_216;
const MAX_SAMPLES = 65_536;
const TWENTY_FIVE_TO_SEVEN = 6103515625;

function validLab(value: LabD65): boolean {
  return value && Number.isFinite(value.L) && Number.isFinite(value.a) &&
    Number.isFinite(value.b) && value.L >= 0 && value.L <= 100 &&
    Math.abs(value.a) <= 200 && Math.abs(value.b) <= 200;
}
function degrees(radians: number): number {
  const angle = radians * DEG;
  return angle >= 0 ? angle : angle + 360;
}
function pow7(value: number): number {
  return value * value * value * value * value * value * value;
}

/** Standard CIEDE2000 equation with kL=kC=kH=1. */
export function deltaE2000Lab(first: LabD65, second: LabD65): number {
  if (!validLab(first) || !validLab(second)) throw new Error('Invalid D65 CIELAB values');
  const c1 = Math.hypot(first.a, first.b);
  const c2 = Math.hypot(second.a, second.b);
  const meanC = (c1 + c2) / 2;
  const meanC7 = pow7(meanC);
  const g = 0.5 * (1 - Math.sqrt(meanC7 / (meanC7 + TWENTY_FIVE_TO_SEVEN)));
  const a1p = (1 + g) * first.a;
  const a2p = (1 + g) * second.a;
  const c1p = Math.hypot(a1p, first.b);
  const c2p = Math.hypot(a2p, second.b);
  const h1p = c1p === 0 ? 0 : degrees(Math.atan2(first.b, a1p));
  const h2p = c2p === 0 ? 0 : degrees(Math.atan2(second.b, a2p));
  const deltaL = second.L - first.L;
  const deltaC = c2p - c1p;
  let deltaH = 0;
  const product = c1p * c2p;
  if (product !== 0) {
    const difference = h2p - h1p;
    if (Math.abs(difference) <= 180) deltaH = difference;
    else deltaH = difference > 180 ? difference - 360 : difference + 360;
  }
  const deltaHp = 2 * Math.sqrt(product) * Math.sin(deltaH * RAD / 2);
  const meanL = (first.L + second.L) / 2;
  const meanCp = (c1p + c2p) / 2;
  let meanH = h1p + h2p;
  if (product === 0) meanH /= 2;
  else if (Math.abs(h1p - h2p) <= 180) meanH /= 2;
  else if (meanH < 360) meanH = (meanH + 360) / 2;
  else meanH = (meanH - 360) / 2;
  const t = 1 - 0.17 * Math.cos((meanH - 30) * RAD) +
    0.24 * Math.cos(2 * meanH * RAD) +
    0.32 * Math.cos((3 * meanH + 6) * RAD) -
    0.2 * Math.cos((4 * meanH - 63) * RAD);
  const lightnessFactor = (meanL - 50) ** 2;
  const sl = 1 + (0.015 * lightnessFactor) / Math.sqrt(20 + lightnessFactor);
  const sc = 1 + 0.045 * meanCp;
  const sh = 1 + 0.015 * meanCp * t;
  const deltaTheta = 30 * Math.exp(-(((meanH - 275) / 25) ** 2));
  const meanCp7 = pow7(meanCp);
  const rc = 2 * Math.sqrt(meanCp7 / (meanCp7 + TWENTY_FIVE_TO_SEVEN));
  const rt = -Math.sin(2 * deltaTheta * RAD) * rc;
  const dl = deltaL / sl;
  const dc = deltaC / sc;
  const dh = deltaHp / sh;
  return Math.sqrt(Math.max(0, dl * dl + dc * dc + dh * dh + rt * dc * dh));
}
function linear(byte: number): number {
  const srgb = byte / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}
function labComponent(value: number): number {
  return value > 216 / 24389 ? Math.cbrt(value) : (24389 / 27 * value + 16) / 116;
}
/** sRGB ICC-assumed D65 conversion; do not pass unmanaged Display-P3 pixels. */
export function srgb8ToLabD65(r: number, g: number, b: number): LabD65 {
  if (![r, g, b].every(v => Number.isSafeInteger(v) && v >= 0 && v <= 255)) {
    throw new Error('Color sampling requires sRGB8 channels');
  }
  const red = linear(r), green = linear(g), blue = linear(b);
  const x = (0.4124564 * red + 0.3575761 * green + 0.1804375 * blue) / 0.95047;
  const y = 0.2126729 * red + 0.7151522 * green + 0.0721750 * blue;
  const z = (0.0193339 * red + 0.1191920 * green + 0.9503041 * blue) / 1.08883;
  const fx = labComponent(x), fy = labComponent(y), fz = labComponent(z);
  // The published D65 sRGB matrix rounds its Y coefficients to 1.0000001;
  // without this clamp, pure white exceeds Lab L=100 by ~0.0000039 and is
  // erroneously rejected by the subsequent standards-based Delta-E verifier.
  return { L: Math.max(0, Math.min(100, 116 * fy - 16)),
    a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function isRgba(value: unknown, byteLength: number): value is Uint8Array | Uint8ClampedArray {
  return (value instanceof Uint8Array || value instanceof Uint8ClampedArray) &&
    value.byteLength === byteLength;
}

export type ColorDifferenceReport = Readonly<{
  kind: 'BERS_EDITOR_DELTA_E2000_DIAGNOSTIC_RND';
  totalPixels: number;
  stride: number;
  sampledPositions: number;
  evaluatedOpaquePositions: number;
  skippedProtectedPositions: number;
  skippedLowAlphaPositions: number;
  meanDeltaE2000: number | null;
  p95DeltaE2000UpperBound: number | null;
  maximumDeltaE2000: number | null;
  largeColorShiftPositions: number;
  colorSpaceAssumption: 'BOTH_SRGB_D65';
  qualityApproved: false;
}>;

/**
 * Deterministic bounded sampling: stride ceil(pixelCount/MAX_SAMPLES),
 * samples positions 0, stride, 2*stride...; no random/device dependence.
 * Mask alpha=0 is protected; mask alpha>0 is just an editable hypothesis,
 * not Core MASK authority. Ignore both hidden and low-alpha colors (<16).
 */
export function inspectEditorColorDifferenceRgba8(
  before: Uint8Array | Uint8ClampedArray,
  after: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  editMask?: Uint8Array | Uint8ClampedArray,
): ColorDifferenceReport {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || width > 16384 || height > 16384 ||
      width * height > MAX_PIXELS) throw new Error('Invalid color audit geometry');
  const count = width * height;
  if (!isRgba(before, count * 4) || !isRgba(after, count * 4)) {
    throw new Error('Exact two-frame RGBA8 buffers required');
  }
  if (editMask !== undefined &&
      !((editMask instanceof Uint8Array || editMask instanceof Uint8ClampedArray) &&
        editMask.byteLength === count)) {
    throw new Error('Exact R8 edit mask required');
  }
  const stride = Math.ceil(count / MAX_SAMPLES);
  const histogram = new Uint32Array(402); // 0.25 Delta E units, overflow 100+.
  let sampledPositions = 0, evaluatedOpaquePositions = 0;
  let skippedProtectedPositions = 0, skippedLowAlphaPositions = 0;
  let totalDifference = 0, maximum = 0, largeColorShiftPositions = 0;
  for (let p = 0; p < count; p += stride) {
    sampledPositions++;
    if (editMask && editMask[p] === 0) {
      skippedProtectedPositions++;
      continue;
    }
    const offset = p * 4;
    if (before[offset + 3] < 16 || after[offset + 3] < 16) {
      skippedLowAlphaPositions++;
      continue;
    }
    const first = srgb8ToLabD65(before[offset], before[offset + 1], before[offset + 2]);
    const second = srgb8ToLabD65(after[offset], after[offset + 1], after[offset + 2]);
    const d = deltaE2000Lab(first, second);
    evaluatedOpaquePositions++;
    totalDifference += d;
    maximum = Math.max(maximum, d);
    if (d > 10) largeColorShiftPositions++;
    histogram[Math.min(401, Math.floor(d * 4))]++;
  }
  if (evaluatedOpaquePositions === 0) {
    return Object.freeze({
      kind:'BERS_EDITOR_DELTA_E2000_DIAGNOSTIC_RND',
      totalPixels:count,stride,sampledPositions,evaluatedOpaquePositions,
      skippedProtectedPositions,skippedLowAlphaPositions,
      meanDeltaE2000:null,p95DeltaE2000UpperBound:null,maximumDeltaE2000:null,
      largeColorShiftPositions:0,colorSpaceAssumption:'BOTH_SRGB_D65',qualityApproved:false,
    });
  }
  const p95Target = Math.ceil(evaluatedOpaquePositions * 0.95);
  let cumulative = 0, p95Bucket = 401;
  for (let i=0;i<histogram.length;i++) {
    cumulative += histogram[i];
    if (cumulative >= p95Target) { p95Bucket = i; break; }
  }
  return Object.freeze({
    kind:'BERS_EDITOR_DELTA_E2000_DIAGNOSTIC_RND',
    totalPixels:count,stride,sampledPositions,evaluatedOpaquePositions,
    skippedProtectedPositions,skippedLowAlphaPositions,
    meanDeltaE2000:totalDifference/evaluatedOpaquePositions,
    p95DeltaE2000UpperBound:p95Bucket === 401 ? 100 : (p95Bucket + 1)/4,
    maximumDeltaE2000:maximum,largeColorShiftPositions,
    colorSpaceAssumption:'BOTH_SRGB_D65',qualityApproved:false,
  });
}
