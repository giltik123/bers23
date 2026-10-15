import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';

import {
  sourceHasIntrinsicGarmentAlphaRND,
  alphaBoundedGarmentFitRND,
} from '../scripts/fashion-alpha-outline-fit-rnd.mjs';

const FIT_W = 16, FIT_H = 16;
const torso = [[0.2, 0.2], [0.8, 0.2], [0.75, 0.9], [0.25, 0.9]];

async function sourceAlphaBeforeContain(imageBytes) {
  const metadata = await sharp(imageBytes).metadata();
  if (metadata.hasAlpha !== true) return false;
  const { data, info } = await sharp(imageBytes).rotate().resize(FIT_W, FIT_H, {
    fit: 'inside', withoutEnlargement: false,
  }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return sourceHasIntrinsicGarmentAlphaRND({
    rgba: data, width: info.width, height: info.height,
    encodedHasAlphaChannel: metadata.hasAlpha,
  });
}

async function containGarment(imageBytes) {
  const { data, info } = await sharp(imageBytes).rotate().resize(FIT_W, FIT_H, {
    fit: 'contain', position: 'centre',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
    withoutEnlargement: false,
  }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, info };
}

async function encodedImage({ withCutout, output }) {
  const width = 8, height = 16;
  const rgba = Buffer.alloc(width * height * 4, 0);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    rgba[i] = 200;
    rgba[i + 1] = 40;
    rgba[i + 2] = 90;
    rgba[i + 3] = withCutout && (x === 0 || x === width - 1 || y < 2 || y >= height - 2) ? 0 : 255;
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } })[output]().toBuffer();
}

test('real JPEG with opaque source gains contain letterbox alpha but must skip size fitting', async () => {
  const jpeg = await encodedImage({ withCutout: false, output: 'jpeg' });
  const { data, info } = await containGarment(jpeg);
  assert.equal(info.width, FIT_W);
  assert.equal(info.height, FIT_H);
  assert.equal(data[3], 0, 'contain produces synthetic transparent padding');
  const intrinsic = await sourceAlphaBeforeContain(jpeg);
  assert.equal(intrinsic, false, 'JPEG never supplies actual alpha silhouette');
  assert.equal(alphaBoundedGarmentFitRND({
    garmentRgba: data, garmentWidth: FIT_W, garmentHeight: FIT_H,
    projectWidth: 64, projectHeight: 96, torsoQ16Normalized: torso,
    sourceHasIntrinsicTransparency: intrinsic,
  }).reason, 'INTRINSIC_SOURCE_ALPHA_REQUIRED');
});

test('real transparent cutout PNG keeps intrinsic alpha proof distinct from padding', async () => {
  const png = await encodedImage({ withCutout: true, output: 'png' });
  assert.equal(await sourceAlphaBeforeContain(png), true);
  const { data } = await containGarment(png);
  const outcome = alphaBoundedGarmentFitRND({
    garmentRgba: data, garmentWidth: FIT_W, garmentHeight: FIT_H,
    projectWidth: 64, projectHeight: 96, torsoQ16Normalized: torso,
    sourceHasIntrinsicTransparency: true,
  });
  assert.equal(outcome.authority, 'RESEARCH_ONLY');
  assert.equal(outcome.status, 'CANDIDATE');
});

test('opaque RGBA PNG is not proof of a transparent garment outline', async () => {
  const png = await encodedImage({ withCutout: false, output: 'png' });
  assert.equal(await sourceAlphaBeforeContain(png), false);
});
