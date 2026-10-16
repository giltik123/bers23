import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { alphaBoundedGarmentFitRND, sourceHasIntrinsicGarmentAlphaRND } from '../scripts/fashion-alpha-outline-fit-rnd.mjs';

const torso = [[0.2, 0.2], [0.8, 0.2], [0.75, 0.9], [0.25, 0.9]];
function fixture(width = 16, height = 16, box = [4, 4, 11, 11], alpha = 255) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = box[1]; y <= box[3]; y++) {
    for (let x = box[0]; x <= box[2]; x++) {
      const offset = (y * width + x) * 4;
      rgba[offset] = 200;
      rgba[offset + 1] = 40;
      rgba[offset + 2] = 90;
      rgba[offset + 3] = alpha;
    }
  }
  return rgba;
}
function invoke(garmentRgba, width = 16, height = 16, frame = torso, sourceHasIntrinsicTransparency = true) {
  return alphaBoundedGarmentFitRND({
    garmentRgba, garmentWidth: width, garmentHeight: height,
    projectWidth: 64, projectHeight: 96, torsoQ16Normalized: frame, sourceHasIntrinsicTransparency,
  });
}

test('visible inset alpha garment fills the authorized torso frame instead of shrinking with padding', () => {
  const result = invoke(fixture());
  assert.equal(result.status, 'CANDIDATE');
  assert.equal(result.authority, 'RESEARCH_ONLY');
  assert.deepEqual(result.spec.destinationPointsQ16, [[13107, 13107], [52429, 13107], [49152, 58982], [16384, 58982]]);
  assert.deepEqual(result.spec.sourcePointsQ16, [[17476, 17476], [48060, 17476], [48060, 48060], [17476, 48060]]);
  assert.deepEqual(result.spec.triangles, [[0, 1, 2], [0, 2, 3]]);
  assert.deepEqual(result.evidence.boundsPixels, { minX: 4, minY: 4, maxX: 11, maxY: 11 });
  assert.equal(result.evidence.visiblePixels, 64);
  assert.ok(result.evidence.scaleX > 2);
  assert.ok(Object.isFrozen(result.spec));
});

test('synthetic padding is never mistaken for source garment segmentation', () => {
  const paddedOpaqueImage = fixture();
  assert.equal(sourceHasIntrinsicGarmentAlphaRND({
    rgba: paddedOpaqueImage, width: 16, height: 16, encodedHasAlphaChannel: false,
  }), false, 'an opaque JPEG may become padded later but did not contain source alpha');
  assert.equal(invoke(paddedOpaqueImage, 16, 16, torso, false).reason, 'INTRINSIC_SOURCE_ALPHA_REQUIRED');
  assert.equal(sourceHasIntrinsicGarmentAlphaRND({
    rgba: paddedOpaqueImage, width: 16, height: 16, encodedHasAlphaChannel: true,
  }), true);
  assert.equal(sourceHasIntrinsicGarmentAlphaRND({
    rgba: fixture(16, 16, [0, 0, 15, 15]), width: 16, height: 16, encodedHasAlphaChannel: true,
  }), false, 'an all-opaque PNG carries no usable source silhouette');
  const interiorHole = fixture(16, 16, [0, 0, 15, 15]);
  interiorHole[(8 * 16 + 8) * 4 + 3] = 0;
  assert.equal(sourceHasIntrinsicGarmentAlphaRND({
    rgba: interiorHole, width: 16, height: 16, encodedHasAlphaChannel: true,
  }), false, 'alpha holes inside an opaque product photograph are not cutout background evidence');
  assert.equal(sourceHasIntrinsicGarmentAlphaRND({
    rgba: new Uint8ClampedArray(16 * 16 * 4),
    width: 16, height: 16, encodedHasAlphaChannel: true,
  }), false, 'an all-transparent source cannot represent a garment');
  assert.throws(() => sourceHasIntrinsicGarmentAlphaRND({
    rgba: new Uint8Array(1), width: 16, height: 16, encodedHasAlphaChannel: true,
  }), /bounded unpadded RGBA8/);
});

test('R&D never guesses silhouette on an opaque background or empty alpha', () => {
  assert.deepEqual(invoke(fixture(16, 16, [0, 0, 15, 15])).reason, 'NO_TRANSPARENT_OUTLINE_MARGIN');
  assert.deepEqual(invoke(new Uint8ClampedArray(16 * 16 * 4)).reason, 'NO_VISIBLE_ALPHA_GARMENT');
  // Transparent margin smaller than the alpha threshold is not a garment outline.
  assert.deepEqual(invoke(fixture(16, 16, [4, 4, 11, 11], 15)).reason, 'NO_VISIBLE_ALPHA_GARMENT');
});

test('excessive upscaling and strongly anisotropic transparent bounds fail closed', () => {
  assert.equal(invoke(fixture(16, 16, [7, 7, 8, 8])).reason, 'UNSAFE_ALPHA_OUTLINE_MAGNIFICATION');
  assert.equal(invoke(fixture(16, 16, [5, 0, 10, 15])).reason, 'UNSAFE_ALPHA_OUTLINE_MAGNIFICATION');
});

test('invalid sizes, corrupt bytes and folded body geometry never reach a preview spec', () => {
  assert.throws(() => invoke(new Uint8Array(3)), /length/);
  assert.throws(() => invoke(fixture(), 1, 16), /integer dimension/);
  assert.throws(() => invoke(fixture(), 16, 16, [[-0.1, 0], [1, 0], [1, 1], [0, 1]]), /four in-bounds/);
  assert.equal(invoke(fixture(), 16, 16, [[0.8, 0.2], [0.2, 0.2], [0.25, 0.9], [0.75, 0.9]]).reason,
    'TORSO_FRAME_FOLDED_OR_MIRRORED');
  // Both original mesh triangles wind positively here, but the upper-right
  // point cuts inside the quadrilateral. A triangular mesh would fold locally.
  assert.equal(invoke(fixture(), 16, 16, [[0.2, 0.2], [0.8, 0.2], [0.4, 0.4], [0.2, 0.8]]).reason,
    'TORSO_FRAME_FOLDED_OR_MIRRORED');
});

test('comparison is opt-in and cannot replace immutable v1 quality evidence or Core FINAL', async () => {
  const capture = await readFile('scripts/capture-fashion-real-image-quality.mjs', 'utf8');
  const research = await readFile('scripts/fashion-alpha-outline-fit-rnd.mjs', 'utf8');
  assert.match(capture, /--compare-alpha-fit/);
  assert.match(capture, /metadata.hasAlpha === true/);
  assert.match(capture, /if \(verifyIntrinsicAlpha\)/,
    'baseline capture must not parse intrinsic alpha without the opt-in flag');
  assert.match(capture, /args\.compareAlphaFit,/,
    'only the optional A/B capture should request original alpha attestation');
  assert.match(capture, /fit: 'inside'/);
  assert.match(capture, /sourceHasIntrinsicTransparency: garment.sourceHasIntrinsicTransparency/);
  assert.match(capture, /if \(args\.compareAlphaFit\)/);
  assert.match(capture, /research-alpha-fit/);
  assert.match(capture, /changesCanonicalQualityEvidence: false/);
  assert.match(capture, /approvedForProduction: false/);
  assert.match(capture, /const spec = warpSpec\(project, projectFixture\.torsoQ16Normalized\)/);
  assert.match(capture, /outputSha256: sha256\(outputPng\)/);
  for (const forbidden of ['coreClient', 'pushEdit', 'FINAL_READY', 'Billing', 'FASHN', 'fetch(']) {
    assert.equal(research.includes(forbidden), false, forbidden);
  }
});
