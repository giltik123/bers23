import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreTryOnForegroundRgba8 } from '../src/platform/creative/deterministic/TryOnForegroundOcclusionPrototype.js';

const project = new Uint8ClampedArray([
  20, 30, 40, 255, // hand, foreground
  80, 90, 100, 255, // torso, behind garment
  10, 20, 30, 255, // background
]);
const tryOn = new Uint8ClampedArray([
  220, 10, 10, 255,
  210, 20, 20, 255,
  10, 20, 30, 255,
]);

test('restores an occluding hand without erasing clothing on torso', () => {
  const result = restoreTryOnForegroundRgba8({
    originalProjectRgba: project,
    garmentCompositeRgba: tryOn,
    personForegroundMask: new Uint8Array([255, 0, 0]),
    width: 3,
    height: 1,
  });
  assert.deepEqual([...result], [
    20, 30, 40, 255,
    210, 20, 20, 255,
    10, 20, 30, 255,
  ]);
  assert.deepEqual([...tryOn], [220,10,10,255,210,20,20,255,10,20,30,255]);
});

test('empty mask produces byte-identical result, without modifying source buffers', () => {
  const before = new Uint8ClampedArray(project);
  const actual = restoreTryOnForegroundRgba8({
    originalProjectRgba: project, garmentCompositeRgba: tryOn,
    personForegroundMask: new Uint8Array([0,0,0]),
    width: 3,height: 1,
  });
  assert.deepEqual(actual, tryOn);
  assert.deepEqual(project, before);
  assert.notStrictEqual(actual, tryOn);
});

test('rejects absent, ambiguous and mismatched masks rather than guessing occlusion', () => {
  const input = { originalProjectRgba: project, garmentCompositeRgba: tryOn, width: 3, height: 1 };
  assert.throws(() => restoreTryOnForegroundRgba8({ ...input }), /foreground mask/);
  assert.throws(() => restoreTryOnForegroundRgba8({ ...input, personForegroundMask: new Uint8Array([255,128,0]) }), /binary/);
  assert.throws(() => restoreTryOnForegroundRgba8({ ...input, personForegroundMask: new Uint8Array([255]) }), /foreground mask/);
  assert.throws(() => restoreTryOnForegroundRgba8({ ...input, personForegroundMask: new Uint8Array([255,0,0]), width: 4 }), /RGBA8/);
});

test('preserves real RGBA alpha for restored foreground including transparent pixels', () => {
  const transparent = new Uint8ClampedArray([0, 0, 0, 0]);
  const opaqueGarment = new Uint8ClampedArray([255, 255, 255, 255]);
  const actual = restoreTryOnForegroundRgba8({
    originalProjectRgba: transparent, garmentCompositeRgba: opaqueGarment,
    personForegroundMask: new Uint8Array([255]), width: 1, height: 1,
  });
  assert.deepEqual([...actual], [0, 0, 0, 0]);
});
