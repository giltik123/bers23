/**
 * Non-destructive Editor Layer Stack — independent experimental RGBA8 compositor.
 *
 * This module has NO Project/Artifact/Core/Provider admission. Layer imagery
 * and alpha masks must be separately verified and owned by canonical Core
 * before any future production wiring. No Canvas, fetch, dynamic models or
 * payment authority is available here.
 */
export type EditorRasterLayer = Readonly<{
  id: string;
  pixels: Uint8Array | Uint8ClampedArray;
  mask?: Uint8Array | Uint8ClampedArray;
  opacityQ8: number;
  visible: boolean;
  blendMode: 'NORMAL';
}>;

const MAX_PIXELS = 16_777_216;
const MAX_PIXEL_LAYER_VISITS = 64_000_000;
function rgba(bytes: unknown, count: number, label: string): asserts bytes is Uint8Array | Uint8ClampedArray {
  if (!(bytes instanceof Uint8Array || bytes instanceof Uint8ClampedArray) || bytes.byteLength !== count * 4) {
    throw new Error(`${label} must be exact RGBA8 bytes`);
  }
}
function mask(bytes: unknown, count: number): asserts bytes is Uint8Array | Uint8ClampedArray {
  if (!(bytes instanceof Uint8Array || bytes instanceof Uint8ClampedArray) || bytes.byteLength !== count) {
    throw new Error('Layer mask must be exact R8 bytes');
  }
}
function halfUp(dividend: number, divisor: number): number { return Math.floor((dividend + Math.floor(divisor / 2)) / divisor); }

/**
 * Deterministic source-over with opacity + R8 coverage. The source RGBA is
 * immutable; layer ordering is bottom-to-top, and identical inputs must yield
 * identical bytes. Pixel channels are sRGB byte-domain, not color-managed
 * linear-light compositing. All-invisible layers are byte-perfect no-ops.
 */
export function composeEditorRasterLayersRgba8(
  source: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  layers: readonly EditorRasterLayer[],
): Uint8ClampedArray {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || width > 16_384 || height > 16_384 ||
      width * height > MAX_PIXELS) throw new Error('Layer stack image geometry is invalid');
  const count=width * height;
  if (!Array.isArray(layers) || layers.length > 32) throw new Error('Layer stack exceeds 32-layer admission bound');
  // Reject excessive image × layer work before touching enormous caller buffers.
  if (count * layers.length > MAX_PIXEL_LAYER_VISITS) {
    throw new Error('Layer stack exceeds bounded pixel-layer processing budget');
  }
  rgba(source,count,'Layer stack source');
  const ids=new Set<string>();
  for(const layer of layers) {
    if (!layer || typeof layer.id !== 'string' || !/^[a-zA-Z0-9_-]{1,96}$/.test(layer.id) || ids.has(layer.id)) {
      throw new Error('Layer stack identities must be unique and bounded');
    }
    ids.add(layer.id);
    if (layer.visible !== true && layer.visible !== false) throw new Error('Layer visibility must be boolean');
    if (layer.blendMode !== 'NORMAL') throw new Error('Unreviewed layer blend mode is prohibited');
    if (!Number.isSafeInteger(layer.opacityQ8) || layer.opacityQ8 < 0 || layer.opacityQ8 > 255) {
      throw new Error('Layer opacity requires integer 0..255');
    }
    rgba(layer.pixels,count,'Layer pixels');
    if (layer.mask !== undefined) mask(layer.mask,count);
  }
  const output=new Uint8ClampedArray(source);
  for(const layer of layers) {
    if (!layer.visible || layer.opacityQ8 === 0) continue;
    for(let pixel=0;pixel<count;pixel++) {
      const offset=pixel*4;
      const coverage=layer.mask === undefined ? 255 : layer.mask[pixel];
      if (coverage === 0 || layer.pixels[offset+3] === 0) continue;
      const sourceAlpha=output[offset+3];
      const overlayAlpha=halfUp(layer.pixels[offset+3] * layer.opacityQ8 * coverage,255*255);
      if (overlayAlpha === 0) continue;
      const backWeight=sourceAlpha*(255-overlayAlpha);
      const frontWeight=overlayAlpha*255;
      const total=frontWeight+backWeight;
      output[offset+3]=halfUp(total,255);
      for(let channel=0;channel<3;channel++) {
        output[offset+channel]=halfUp(layer.pixels[offset+channel]*frontWeight+output[offset+channel]*backWeight,total);
      }
    }
  }
  return output;
}
