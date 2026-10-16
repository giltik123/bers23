import assert from 'node:assert/strict';
import test from 'node:test';

import { alphaBoundedGarmentFitRND } from '../scripts/fashion-alpha-outline-fit-rnd.mjs';
import {
  GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY,
  GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
  GARMENT_TEXTURE_COMPOSITE_FIXED_POINT_ONE,
  GARMENT_TEXTURE_COMPOSITE_WRAP_MODE,
  garmentTextureCompositeRgba8,
} from '../src/platform/creative/deterministic/GarmentTextureComposite.ts';

const ONE = GARMENT_TEXTURE_COMPOSITE_FIXED_POINT_ONE;
const garmentWidth = 16;
const garmentHeight = 16;
const projectWidth = 64;
const projectHeight = 96;
const frame = [[0.2, 0.2], [0.8, 0.2], [0.75, 0.9], [0.25, 0.9]];

function originalProject(): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(projectWidth * projectHeight * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 12;
    rgba[i + 1] = 23;
    rgba[i + 2] = 34;
    rgba[i + 3] = 255;
  }
  return rgba;
}

function transparentGarment(): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(garmentWidth * garmentHeight * 4);
  for (let y = 4; y <= 11; y++) {
    for (let x = 4; x <= 11; x++) {
      const offset = (y * garmentWidth + x) * 4;
      rgba[offset] = 220;
      rgba[offset + 1] = 45;
      rgba[offset + 2] = 70;
      rgba[offset + 3] = 255;
    }
  }
  return rgba;
}

const compositeSpec = Object.freeze({
  textureTransform: {
    scaleXQ16: ONE,
    scaleYQ16: ONE,
    offsetXQ16: 0,
    offsetYQ16: 0,
    wrapMode: GARMENT_TEXTURE_COMPOSITE_WRAP_MODE,
    alphaPolicy: GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY,
  },
  featherRadius: 0,
  colorSpacePolicy: GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
});

function countGarmentPixels(rgba: Uint8ClampedArray): number {
  let count = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i] > 100 && rgba[i + 1] < 100 && rgba[i + 2] < 100) count += 1;
  }
  return count;
}

test('A/B pixels: bounded transparent garment occupies torso instead of shrinking inside padded source', () => {
  const project = originalProject();
  const garment = transparentGarment();
  const baselineSpec = {
    sourcePointsQ16: [[0, 0], [ONE, 0], [ONE, ONE], [0, ONE]],
    destinationPointsQ16: frame.map(([x, y]) => [Math.floor(x * ONE + 0.5), Math.floor(y * ONE + 0.5)]),
    triangles: [[0, 1, 2], [0, 2, 3]],
    outputWidth: projectWidth,
    outputHeight: projectHeight,
  };
  const proposed = alphaBoundedGarmentFitRND({
    garmentRgba: garment, garmentWidth, garmentHeight,
    projectWidth, projectHeight, torsoQ16Normalized: frame,
    sourceHasIntrinsicTransparency: true,
  });
  assert.equal(proposed.status, 'CANDIDATE');
  if (proposed.status !== 'CANDIDATE') throw new Error('research candidate unexpectedly unavailable');

  const baseline = garmentTextureCompositeRgba8(
    project, projectWidth, projectHeight, garment, garmentWidth, garmentHeight,
    baselineSpec, compositeSpec,
  );
  const candidate = garmentTextureCompositeRgba8(
    project, projectWidth, projectHeight, garment, garmentWidth, garmentHeight,
    proposed.spec, compositeSpec,
  );
  const again = garmentTextureCompositeRgba8(
    project, projectWidth, projectHeight, garment, garmentWidth, garmentHeight,
    proposed.spec, compositeSpec,
  );
  assert.deepEqual(candidate, again, 'candidate must use byte-replayable existing deterministic kernel');
  const baselinePixels = countGarmentPixels(baseline);
  const correctedPixels = countGarmentPixels(candidate);
  assert.ok(baselinePixels > 0);
  assert.ok(correctedPixels >= baselinePixels * 2,
    `transparent-outline mapping should visibly correct undersizing: baseline=${baselinePixels}, candidate=${correctedPixels}`);
  assert.deepEqual([...candidate.slice(0, 4)], [...project.slice(0, 4)],
    'pixels outside the torso must remain byte-identical to the original photograph');
  assert.deepEqual([...candidate.slice((projectWidth * (projectHeight - 1) + projectWidth - 1) * 4)],
    [...project.slice((projectWidth * (projectHeight - 1) + projectWidth - 1) * 4)]);
  assert.deepEqual([...project.slice(0, 4)], [12, 23, 34, 255], 'no input aliasing');
  assert.deepEqual([...garment.slice((4 * garmentWidth + 4) * 4, (4 * garmentWidth + 4) * 4 + 4)],
    [220, 45, 70, 255], 'original garment colours remain immutable');
});
