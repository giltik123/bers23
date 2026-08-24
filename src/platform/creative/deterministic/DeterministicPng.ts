import type { PixelImage } from '../pipeline/ControlledLocalEdit.ts';

const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const IHDR = ascii('IHDR');
const IDAT = ascii('IDAT');
const IEND = ascii('IEND');

/**
 * Browser-safe RGBA8 PNG encoder that never passes pixels through Canvas.
 * Filter type 0 keeps the pre-compression byte stream exactly defined; zlib is
 * transport-only and Core always verifies decoded RGBA bytes independently.
 */
export async function encodeDeterministicRgbaPng(image: PixelImage): Promise<Uint8Array> {
  assertImage(image);
  if (typeof CompressionStream !== 'function') throw new Error('Deterministic PNG encoding requires CompressionStream(deflate)');
  const scanlines = new Uint8Array(image.height * (1 + image.width * 4));
  const rowBytes = image.width * 4;
  for (let y = 0; y < image.height; y += 1) {
    const target = y * (rowBytes + 1);
    scanlines[target] = 0;
    scanlines.set(image.data.subarray(y * rowBytes, (y + 1) * rowBytes), target + 1);
  }
  const compressed = await deflate(scanlines);
  const ihdr = new Uint8Array(13);
  writeU32(ihdr, 0, image.width);
  writeU32(ihdr, 4, image.height);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // no interlace
  return concat(PNG_SIGNATURE, chunk(IHDR, ihdr), chunk(IDAT, compressed), chunk(IEND, new Uint8Array()));
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new CompressionStream('deflate');
  const writer = stream.writable.getWriter();
  await writer.write(bytes);
  await writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}
function chunk(type: Uint8Array, data: Uint8Array): Uint8Array {
  const output = new Uint8Array(12 + data.length);
  writeU32(output, 0, data.length);
  output.set(type, 4);
  output.set(data, 8);
  writeU32(output, 8 + data.length, crc32(output.subarray(4, 8 + data.length)));
  return output;
}
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function writeU32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 255; target[offset + 1] = (value >>> 16) & 255; target[offset + 2] = (value >>> 8) & 255; target[offset + 3] = value & 255;
}
function ascii(value: string): Uint8Array { return Uint8Array.from([...value].map(char => char.charCodeAt(0))); }
function concat(...parts: readonly Uint8Array[]): Uint8Array { const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0; for (const part of parts) { output.set(part, offset); offset += part.length; } return output; }
function assertImage(image: PixelImage): void {
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1 || !(image.data instanceof Uint8ClampedArray) || image.data.length !== image.width * image.height * 4) throw new Error('Malformed RGBA8 image');
}
