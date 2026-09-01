import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GARMENT_APPEARANCE_REFINEMENT_ALPHA_POLICY,
  GARMENT_APPEARANCE_REFINEMENT_DILATION_POLICY,
  GARMENT_APPEARANCE_REFINEMENT_DILATION_RADIUS_PX,
  GARMENT_APPEARANCE_REFINEMENT_OUTSIDE_SUPPORT_POLICY,
  GARMENT_APPEARANCE_REFINEMENT_PRODUCTION_ADMISSION,
  GARMENT_APPEARANCE_REFINEMENT_PROFILE,
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

test('F5a.1 candidate may change supported RGB while parent alpha is immutable globally', () => {
  const width = 7;
  const height = 7;
  const support = deriveGarmentAppearanceRefinementSupport(warp(width, height, [[3, 3]]), width, height);
  const parent = Uint8ClampedArray.from({ length: width * height * 4 }, (_, index) => index % 251);
  const parentBefore = Uint8ClampedArray.from(parent);

  const inside = Uint8ClampedArray.from(parent);
  const insideOffset = (3 * width + 3) * 4;
  inside[insideOffset] ^= 0xff;
  inside[insideOffset + 1] ^= 0xff;
  const accepted = verifyGarmentAppearanceRefinementCandidate(parent, inside, support.mask, width, height);
  assert.equal(accepted.changedPixels, 1);
  assert.deepEqual(parent, parentBefore, 'verification must not mutate deterministic parent bytes');

  for (const pixel of [3 * width + 3, 0]) {
    const candidate = Uint8ClampedArray.from(parent);
    candidate[pixel * 4 + 3] ^= 0xff;
    assert.throws(
      () => verifyGarmentAppearanceRefinementCandidate(parent, candidate, support.mask, width, height),
      /globally protected parent alpha/i,
      'parent alpha must remain immutable both inside and outside support',
    );
  }
});

test('F5a.1 protected outside-support RGB is byte-exact in every color channel', () => {
  const width = 7;
  const height = 7;
  const support = deriveGarmentAppearanceRefinementSupport(warp(width, height, [[3, 3]]), width, height);
  const parent = Uint8ClampedArray.from({ length: width * height * 4 }, (_, index) => index % 251);
  for (let channel = 0; channel < 3; channel += 1) {
    const candidate = Uint8ClampedArray.from(parent);
    candidate[channel] ^= 0xff;
    assert.throws(
      () => verifyGarmentAppearanceRefinementCandidate(parent, candidate, support.mask, width, height),
      /protected RGB outside deterministic support/i,
      `outside-support RGB channel ${channel} must remain immutable`,
    );
  }
});

test('F5a.1 candidate verifier rejects mask and geometry substitution', () => {
  const width = 5;
  const height = 5;
  const parent = new Uint8ClampedArray(width * height * 4);
  const candidate = Uint8ClampedArray.from(parent);
  const mask = new Uint8Array(width * height);
  mask.fill(255);
  mask[0] = 1;
  assert.throws(
    () => verifyGarmentAppearanceRefinementCandidate(parent, candidate, mask, width, height),
    /only 0 or 255/i,
  );
  assert.throws(
    () => verifyGarmentAppearanceRefinementCandidate(parent, candidate.subarray(0, candidate.length - 4), new Uint8Array(width * height), width, height),
    /byte length/i,
  );
  assert.throws(
    () => verifyGarmentAppearanceRefinementCandidate(parent, candidate, new Uint8Array(width * height - 1), width, height),
    /support mask byte length/i,
  );
});
