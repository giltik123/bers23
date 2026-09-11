import {
  normalizeOrthogonalTransformMode,
  orthogonalTransformOutputGeometry,
  orthogonalTransformRgba8,
} from '../src/platform/creative/deterministic/OrthogonalTransform.ts';
import { normalizeResizeDimensions, resizeRgba8 } from '../src/platform/creative/deterministic/Resize.ts';
import { encodeDeterministicRgbaPng } from '../src/platform/creative/deterministic/DeterministicPng.ts';

type CalibrationInput = Readonly<
  | { operation: 'ORTHOGONAL_TRANSFORM'; sourceWidth: number; sourceHeight: number; mode: string }
  | { operation: 'RESIZE'; sourceWidth: number; sourceHeight: number; width: number; height: number }
>;

type CalibrationHold = Readonly<{
  source: Uint8ClampedArray;
  output: Uint8ClampedArray;
  png: Uint8Array;
}>;

let hold: CalibrationHold | undefined;

async function frame(): Promise<void> {
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

function deterministicSource(width: number, height: number): Uint8ClampedArray {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw new Error('invalid calibration source geometry');
  const bytes = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < bytes.length; index += 4) {
    const pixel = index >>> 2;
    bytes[index] = (pixel * 17 + 11) & 255;
    bytes[index + 1] = (pixel * 29 + 23) & 255;
    bytes[index + 2] = (pixel * 43 + 37) & 255;
    bytes[index + 3] = 64 + ((pixel * 13) % 192);
  }
  return bytes;
}

async function runCalibration(input: CalibrationInput) {
  hold = undefined;
  const source = deterministicSource(input.sourceWidth, input.sourceHeight);
  await frame();

  let output: Uint8ClampedArray;
  let outputWidth: number;
  let outputHeight: number;
  if (input.operation === 'ORTHOGONAL_TRANSFORM') {
    const mode = normalizeOrthogonalTransformMode(input.mode);
    const geometry = orthogonalTransformOutputGeometry(input.sourceWidth, input.sourceHeight, mode);
    output = orthogonalTransformRgba8(source, input.sourceWidth, input.sourceHeight, mode);
    outputWidth = geometry.width;
    outputHeight = geometry.height;
  } else {
    const target = normalizeResizeDimensions({ width: input.width, height: input.height }, input.sourceWidth, input.sourceHeight);
    output = resizeRgba8(source, input.sourceWidth, input.sourceHeight, target);
    outputWidth = target.width;
    outputHeight = target.height;
  }
  await frame();

  const png = await encodeDeterministicRgbaPng(Object.freeze({
    width: outputWidth,
    height: outputHeight,
    data: output,
    format: 'RGBA8' as const,
    orientation: 1 as const,
    colorSpace: 'srgb' as const,
  }));

  // Retain externally visible buffers through one frame so CDP sampling can
  // observe the post-encode working set. Encoder-internal scanline/copy buffers
  // are sampled concurrently while encodeDeterministicRgbaPng is running.
  hold = Object.freeze({ source, output, png });
  await frame();
  return Object.freeze({
    operation: input.operation,
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    outputWidth,
    outputHeight,
    sourceRgbaBytes: source.byteLength,
    outputRgbaBytes: output.byteLength,
    pngBytes: png.byteLength,
  });
}

function releaseCalibration(): void {
  hold = undefined;
}

Object.assign(globalThis, {
  runAeeResourceBudgetCalibration: runCalibration,
  releaseAeeResourceBudgetCalibration: releaseCalibration,
});
