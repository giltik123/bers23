/**
 * PROFESSIONAL_RESAMPLE_RND_V1 — a standalone, not-yet-admitted raster kernel.
 *
 * Separable antialiased Lanczos3 with sRGB EOTF/OETF and premultiplied linear
 * RGB/alpha. Downsampling widens the reconstruction footprint to suppress
 * aliasing. Every pass clamps unassociated color to sampled valid-neighbor
 * extrema (anti-ringing). Transparent source RGB never pollutes visible edges.
 *
 * This is a quality candidate, NOT a Photoshop-equivalence claim and NOT
 * a replacement for the accepted deterministic Resize v1 Core pixel law.
 * Source/FINAL ownership, ICC transformations and production history remain
 * authoritative only within Core after a separate versioned admission.
 */
export type ProfessionalResizeTargetRND = Readonly<{ width: number; height: number }>;

const MAX_DIMENSION = 4096;
const MAX_PIXELS = 4_194_304;
const MAX_WORK = 80_000_000;
const LOBES = 3;

type Sample = Readonly<{ index: number; weight: number }>;
const srgbToLinear = Float64Array.from({ length: 256 }, (_, value) => {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
});

function srgbByte(linear: number): number {
  const clamped = Math.max(0, Math.min(1, linear));
  const srgb = clamped <= 0.0031308
    ? clamped * 12.92
    : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(srgb * 255)));
}
function boundDimension(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || width > MAX_DIMENSION ||
      height > MAX_DIMENSION || width * height > MAX_PIXELS) {
    throw new Error('Professional Resize geometry exceeds local quality budget');
  }
}
function sinc(value: number): number {
  if (Math.abs(value) < 1e-12) return 1;
  const t = Math.PI * value;
  return Math.sin(t) / t;
}
function lanczos3(value: number): number {
  const abs = Math.abs(value);
  return abs >= LOBES ? 0 : sinc(value) * sinc(value / LOBES);
}

/** Build source-center taps with correctly expanded anti-alias footprint. */
function axisSamples(source: number, target: number): readonly (readonly Sample[])[] {
  const scale = Math.max(1, source / target);
  const radius = LOBES * scale;
  return Array.from({ length: target }, (_, coordinate) => {
    const center = (coordinate + 0.5) * source / target - 0.5;
    const start = Math.max(0, Math.ceil(center - radius));
    const end = Math.min(source - 1, Math.floor(center + radius));
    const samples: Sample[] = [];
    let sum = 0;
    for (let position = start; position <= end; position++) {
      const weight = lanczos3((position - center) / scale);
      if (Math.abs(weight) < 1e-15) continue;
      samples.push({ index: position, weight });
      sum += weight;
    }
    if (samples.length === 0 || Math.abs(sum) < 1e-12) {
      throw new Error('Professional Resize reconstruction taps are invalid');
    }
    return samples.map(item => Object.freeze({
      index: item.index, weight: item.weight / sum,
    }));
  });
}

function within(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Identity: exact RGBA bytes, including hidden RGB. Scale: transparent RGB
 * policy ZERO (explicitly different from the accepted Resize v1 policy).
 * The output uses deterministic Math.round-to-byte and float64 work buffers.
 */
export function resizeProfessionalLanczos3Rgba8RND(
  source: Uint8Array | Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  target: ProfessionalResizeTargetRND,
): Uint8ClampedArray {
  boundDimension(sourceWidth, sourceHeight);
  if (!target || typeof target !== 'object') {
    throw new Error('Professional Resize target is required');
  }
  boundDimension(target.width, target.height);
  if (!(source instanceof Uint8Array || source instanceof Uint8ClampedArray) ||
      source.byteLength !== sourceWidth * sourceHeight * 4) {
    throw new Error('Professional Resize requires exact RGBA8 bytes');
  }
  if (sourceWidth === target.width && sourceHeight === target.height) {
    return new Uint8ClampedArray(source);
  }
  // Constant opaque/transparent colors must remain byte-exact at any scale;
  // this prevents floating color-space round trips drifting by a byte.
  let constant = true;
  for (let i = 4; i < source.length; i += 4) {
    if (source[i] !== source[0] || source[i + 1] !== source[1] ||
        source[i + 2] !== source[2] || source[i + 3] !== source[3]) {
      constant = false;
      break;
    }
  }
  if (constant) {
    const output = new Uint8ClampedArray(target.width * target.height * 4);
    const pixel = source.subarray(0, 4);
    for (let i = 0; i < output.length; i += 4) output.set(pixel, i);
    return output;
  }

  const xSamples = axisSamples(sourceWidth, target.width);
  const ySamples = axisSamples(sourceHeight, target.height);
  const work = xSamples.reduce((total, values) => total + values.length, 0) * sourceHeight +
    ySamples.reduce((total, values) => total + values.length, 0) * target.width;
  if (work > MAX_WORK) throw new Error('Professional Resize filter work exceeds local budget');

  // Intermediate stores four float64 values per horizontally reconstructed
  // pixel: red/green/blue in premultiplied linear-light space, then alpha.
  const temporary = new Float64Array(sourceHeight * target.width * 4);

  for (let y = 0; y < sourceHeight; y++) {
    for (let tx = 0; tx < target.width; tx++) {
      const taps = xSamples[tx];
      const acc = [0, 0, 0, 0];
      const minimum = [Infinity, Infinity, Infinity];
      const maximum = [-Infinity, -Infinity, -Infinity];
      let visible = false;
      for (const tap of taps) {
        const offset = (y * sourceWidth + tap.index) * 4;
        const alpha = source[offset + 3] / 255;
        acc[3] += tap.weight * alpha;
        if (alpha <= 0) continue;
        visible = true;
        for (let ch = 0; ch < 3; ch++) {
          const linear = srgbToLinear[source[offset + ch]];
          acc[ch] += tap.weight * linear * alpha;
          minimum[ch] = Math.min(minimum[ch], linear);
          maximum[ch] = Math.max(maximum[ch], linear);
        }
      }
      const dest = (y * target.width + tx) * 4;
      const alpha = within(acc[3], 0, 1);
      temporary[dest + 3] = alpha;
      for (let ch = 0; ch < 3; ch++) {
        // Do not allow negative-lobe ringing to create impossible new colors.
        const straight = visible && acc[3] > 1e-12
          ? within(acc[ch] / acc[3], minimum[ch], maximum[ch]) : 0;
        temporary[dest + ch] = straight * alpha;
      }
    }
  }

  const output = new Uint8ClampedArray(target.width * target.height * 4);
  for (let ty = 0; ty < target.height; ty++) {
    const taps = ySamples[ty];
    for (let x = 0; x < target.width; x++) {
      const acc = [0, 0, 0, 0];
      const minimum = [Infinity, Infinity, Infinity];
      const maximum = [-Infinity, -Infinity, -Infinity];
      let visible = false;
      for (const tap of taps) {
        const offset = (tap.index * target.width + x) * 4;
        const alpha = temporary[offset + 3];
        acc[3] += tap.weight * alpha;
        if (alpha <= 1e-12) continue;
        visible = true;
        for (let ch = 0; ch < 3; ch++) {
          const linear = temporary[offset + ch] / alpha;
          acc[ch] += tap.weight * temporary[offset + ch];
          minimum[ch] = Math.min(minimum[ch], linear);
          maximum[ch] = Math.max(maximum[ch], linear);
        }
      }
      const dest = (ty * target.width + x) * 4;
      const alpha = within(acc[3], 0, 1);
      output[dest + 3] = Math.round(alpha * 255);
      for (let ch = 0; ch < 3; ch++) {
        const straight = alpha > 1e-12 && visible && acc[3] > 1e-12
          ? within(acc[ch] / acc[3], minimum[ch], maximum[ch]) : 0;
        output[dest + ch] = srgbByte(straight);
      }
    }
  }
  return output;
}
