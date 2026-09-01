import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GARMENT_APPEARANCE_REFINEMENT_ALPHA_POLICY,
  GARMENT_APPEARANCE_REFINEMENT_DILATION_POLICY,
  GARMENT_APPEARANCE_REFINEMENT_DILATION_RADIUS_PX,
  GARMENT_APPEARANCE_REFINEMENT_OUTSIDE_SUPPORT_POLICY,
  GARMENT_APPEARANCE_REFINEMENT_PRODUCTION_ADMISSION,
  GARMENT_APPEARANCE_REFINEMENT_PROFILE,
  composeGarmentAppearanceRefinementCandidate,
  deriveGarmentAppearanceRefinementSupport,
  verifyGarmentAppearanceRefinementCandidate,
} from '../src/platform/creative/deterministic/GarmentAppearanceRefinementSupport.ts';

function warp(width: number, height: number, points: readonly (readonly [number, number])[]): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (const [x, y] of points) {
    const offset = (y * width + x) * 4;
    rgba[offset] = 11;
    rgba[offset + 1] = 22;
    rgba[offset + 2] = 33;
    rgba[offset + 3] = 255;
  }
  return rgba;
}

function expectedSquareMask(width: number, height: number, points: readonly (readonly [number, number])[], radius = 2): Uint8Array {
  const result = new Uint8Array(width * height);
  for (const [sourceX, sourceY] of points) {
    for (let y = Math.max(0, sourceY - radius); y <= Math.min(height - 1, sourceY + radius); y += 1) {
      for (let x = Math.max(0, sourceX - radius); x <= Math.min(width - 1, sourceX + radius); x += 1) {
        result[y * width + x] = 255;
      }
    }
  }
  return result;
}

test('F5a.1 identity is closed, conservative and not production-admitted', () => {
  assert.equal(GARMENT_APPEARANCE_REFINEMENT_PROFILE, 'REFINE_REALISM_V1');
  assert.equal(GARMENT_APPEARANCE_REFINEMENT_DILATION_RADIUS_PX, 2);
  assert.equal(GARMENT_APPEARANCE_REFINEMENT_DILATION_POLICY, 'CHEBYSHEV_SQUARE_CLIPPED');
  assert.equal(GARMENT_APPEARANCE_REFINEMENT_OUTSIDE_SUPPORT_POLICY, 'BYTE_EXACT_PARENT_RGBA8_OUTSIDE_SUPPORT');
  assert.equal(GARMENT_APPEARANCE_REFINEMENT_ALPHA_POLICY, 'PRESERVE_PARENT_ALPHA_GLOBAL');
  assert.equal(GARMENT_APPEARANCE_REFINEMENT_PRODUCTION_ADMISSION, 'NOT_ADMITTED');
});

test('F5a.1 isolated garment alpha expands by exact clipped 2px square radius', () => {
  const width = 7;
  const height = 7;
  const input = warp(width, height, [[3, 3]]);
  const before = Uint8ClampedArray.from(input);
  const support = deriveGarmentAppearanceRefinementSupport(input, width, height);
  assert.deepEqual(support.mask, expectedSquareMask(width, height, [[3, 3]]));
  assert.deepEqual(input, before, 'support derivation must not mutate accepted warp bytes');
  assert.equal(support.width, width);
  assert.equal(support.height, height);
  assert.equal(support.alphaPolicy, 'PRESERVE_PARENT_ALPHA_GLOBAL');
  assert.ok([...support.mask].every(value => value === 0 || value === 255));
});

test('F5a.1 support dilation clips at project edges without wraparound', () => {
  const width = 4;
  const height = 4;
  const support = deriveGarmentAppearanceRefinementSupport(warp(width, height, [[0, 0]]), width, height);
  assert.deepEqual(support.mask, expectedSquareMask(width, height, [[0, 0]]));
  assert.equal(support.mask[2 * width + 2], 255);
  assert.equal(support.mask[3 * width + 3], 0);
});

test('F5a.1 multiple accepted warp-alpha pixels produce the deterministic union support', () => {
  const width = 9;
  const height = 6;
  const points = [[2, 2], [6, 3]] as const;
  const support = deriveGarmentAppearanceRefinementSupport(warp(width, height, points), width, height);
  assert.deepEqual(support.mask, expectedSquareMask(width, height, points));
});

test('F5a.1 empty garment warp support and malformed geometry fail closed', () => {
  assert.throws(
    () => deriveGarmentAppearanceRefinementSupport(new Uint8ClampedArray(4 * 4 * 4), 4, 4),
    /non-empty deterministic warp alpha support/i,
  );
  assert.throws(() => deriveGarmentAppearanceRefinementSupport(new Uint8Array(3), 1, 1), /byte length/i);
  assert.throws(() => deriveGarmentAppearanceRefinementSupport(new Uint8Array(4), 0, 1), /positive safe integer/i);
});

test('F5a.1 canonical compositor clips arbitrary model output to Core-derived RGB support', () => {
  const width = 7;
  const height = 7;
  const warpRgba = warp(width, height, [[3, 3]]);
  const support = deriveGarmentAppearanceRefinementSupport(warpRgba, width, height);
  const parent = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) parent[pixel * 4 + 3] = 77;
  const model = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    model[offset] = 101;
    model[offset + 1] = 102;
    model[offset + 2] = 103;
    model[offset + 3] = 250;
  }
  const parentBefore = Uint8ClampedArray.from(parent);
  const modelBefore = Uint8ClampedArray.from(model);

  const composed = composeGarmentAppearanceRefinementCandidate(parent, model, warpRgba, width, height);
  let supportedPixels = 0;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    assert.equal(composed[offset + 3], 77, 'canonical candidate must preserve parent alpha globally');
    if (support.mask[pixel] === 255) {
      supportedPixels += 1;
      assert.deepEqual(Array.from(composed.subarray(offset, offset + 3)), [101, 102, 103]);
    } else {
      assert.deepEqual(Array.from(composed.subarray(offset, offset + 4)), [0, 0, 0, 77]);
    }
  }
  assert.equal(supportedPixels, 25);
  assert.deepEqual(parent, parentBefore, 'compositor must not mutate deterministic parent');
  assert.deepEqual(model, modelBefore, 'compositor must not mutate raw model output');
  assert.equal(verifyGarmentAppearanceRefinementCandidate(parent, composed, warpRgba, width, height).changedPixels, 25);
});

test('F5a.1 candidate may change supported RGB while parent alpha is immutable globally', () => {
  const width = 7;
  const height = 7;
  const warpRgba = warp(width, height, [[3, 3]]);
  const parent = Uint8ClampedArray.from({ length: width * height * 4 }, (_, index) => index % 251);
  const parentBefore = Uint8ClampedArray.from(parent);

  const inside = Uint8ClampedArray.from(parent);
  const insideOffset = (3 * width + 3) * 4;
  inside[insideOffset] ^= 0xff;
  inside[insideOffset + 1] ^= 0xff;
  const accepted = verifyGarmentAppearanceRefinementCandidate(parent, inside, warpRgba, width, height);
  assert.equal(accepted.changedPixels, 1);
  assert.deepEqual(parent, parentBefore, 'verification must not mutate deterministic parent bytes');

  for (const pixel of [3 * width + 3, 0]) {
    const candidate = Uint8ClampedArray.from(parent);
    candidate[pixel * 4 + 3] ^= 0xff;
    assert.throws(
      () => verifyGarmentAppearanceRefinementCandidate(parent, candidate, warpRgba, width, height),
      /globally protected parent alpha/i,
      'parent alpha must remain immutable both inside and outside support',
    );
  }
});

test('F5a.1 protected outside-support RGB is byte-exact in every color channel', () => {
  const width = 7;
  const height = 7;
  const warpRgba = warp(width, height, [[3, 3]]);
  const parent = Uint8ClampedArray.from({ length: width * height * 4 }, (_, index) => index % 251);
  for (let channel = 0; channel < 3; channel += 1) {
    const candidate = Uint8ClampedArray.from(parent);
    candidate[channel] ^= 0xff;
    assert.throws(
      () => verifyGarmentAppearanceRefinementCandidate(parent, candidate, warpRgba, width, height),
      /protected RGB outside deterministic support/i,
      `outside-support RGB channel ${channel} must remain immutable`,
    );
  }
});

test('F5a.1 verifier re-derives support from immutable warp and ignores any separately delivered mask', () => {
  const width = 7;
  const height = 7;
  const warpRgba = warp(width, height, [[3, 3]]);
  const delivered = deriveGarmentAppearanceRefinementSupport(warpRgba, width, height);
  delivered.mask.fill(255); // Simulate a corrupted/over-broad delivered model mask.

  const parent = new Uint8ClampedArray(width * height * 4);
  const candidate = Uint8ClampedArray.from(parent);
  candidate[0] = 255; // Pixel (0,0) is outside the true radius-2 support.
  assert.throws(
    () => verifyGarmentAppearanceRefinementCandidate(parent, candidate, warpRgba, width, height),
    /protected RGB outside deterministic support/i,
    'verification authority must be the F4 warp, never the delivered support mask',
  );
});

test('F5a.1 candidate verifier and compositor reject warp and geometry substitution', () => {
  const width = 5;
  const height = 5;
  const warpRgba = warp(width, height, [[2, 2]]);
  const parent = new Uint8ClampedArray(width * height * 4);
  const candidate = Uint8ClampedArray.from(parent);
  assert.throws(
    () => verifyGarmentAppearanceRefinementCandidate(parent, candidate.subarray(0, candidate.length - 4), warpRgba, width, height),
    /byte length/i,
  );
  assert.throws(
    () => verifyGarmentAppearanceRefinementCandidate(parent, candidate, warpRgba.subarray(0, warpRgba.length - 4), width, height),
    /byte length/i,
  );
  assert.throws(
    () => composeGarmentAppearanceRefinementCandidate(parent, candidate.subarray(0, candidate.length - 4), warpRgba, width, height),
    /byte length/i,
  );
  assert.throws(
    () => verifyGarmentAppearanceRefinementCandidate(parent, candidate, new Uint8ClampedArray(width * height * 4), width, height),
    /non-empty deterministic warp alpha support/i,
  );
});
