/**
 * Portable, explicit BERS local editing recipes.
 * No pixels, URLs, session tokens, Core mutation or automatic cloud saves.
 * A SHA-256 of the ORIGINAL full-resolution decoded RGBA8 plus dimensions
 * prevents accidental application to a different picture. This fingerprint is
 * only an integrity guard for user files, not authorization or provenance.
 */
import { normalizeLocalSettings, MAX_LOCAL_PIXELS } from './localAdjustments.js';
import { normalizeAdvancedSettings } from './localAdvanced.js';
import { normalizeLocalAnnotations } from './localAnnotations.js';

export const LOCAL_RECIPE_FORMAT = 'bers.local-photo-recipe';
export const LOCAL_RECIPE_VERSION = 1;
export const MAX_LOCAL_RECIPE_BYTES = 2 * 1024 * 1024;
const SHA256_HEX = /^[0-9a-f]{64}$/;

function keysOnly(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(key => !allowed.includes(key))) {
    throw new Error('Invalid local recipe ' + label);
  }
}

function size(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
      || width < 1 || height < 1 || width * height > MAX_LOCAL_PIXELS) {
    throw new Error('Invalid local recipe image geometry');
  }
}

function verifiedSource(source) {
  keysOnly(source, ['width', 'height', 'sha256'], 'image identity');
  size(source.width, source.height);
  if (typeof source.sha256 !== 'string' || !SHA256_HEX.test(source.sha256)) {
    throw new Error('Invalid local recipe original image fingerprint');
  }
  return Object.freeze({ width: source.width, height: source.height, sha256: source.sha256 });
}

export async function fingerprintOriginalRgba(pixels, width, height, subtle = globalThis.crypto?.subtle) {
  size(width, height);
  if (!(pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray)
      || pixels.length !== width * height * 4) {
    throw new Error('Local recipe fingerprint requires original full-size RGBA8 pixels');
  }
  if (!subtle || typeof subtle.digest !== 'function') {
    throw new Error('Browser SHA-256 is unavailable; use an HTTPS browser to save or restore local edits.');
  }
  const buffer = await subtle.digest('SHA-256', pixels);
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createLocalRecipe(source, settings, advanced, annotations) {
  const image = verifiedSource(source);
  const adjustments = normalizeLocalSettings(settings);
  const precision = normalizeAdvancedSettings(advanced);
  const vectors = normalizeLocalAnnotations(annotations);
  return Object.freeze({
    format: LOCAL_RECIPE_FORMAT,
    version: LOCAL_RECIPE_VERSION,
    source: image,
    edits: Object.freeze({ settings: adjustments, advanced: precision, annotations: vectors }),
  });
}

export function parseLocalRecipe(input, expectedSource) {
  if (typeof input !== 'string' || !input.trim()
      || new TextEncoder().encode(input).byteLength > MAX_LOCAL_RECIPE_BYTES) {
    throw new Error('Local recipe JSON must be nonempty and at most 2 MB');
  }
  let object;
  try { object = JSON.parse(input); }
  catch { throw new Error('Local recipe must be valid JSON'); }
  keysOnly(object, ['format', 'version', 'source', 'edits'], 'document');
  if (object.format !== LOCAL_RECIPE_FORMAT || object.version !== LOCAL_RECIPE_VERSION) {
    throw new Error('Unsupported local recipe format/version');
  }
  const image = verifiedSource(object.source);
  const expected = verifiedSource(expectedSource);
  if (image.width !== expected.width || image.height !== expected.height || image.sha256 !== expected.sha256) {
    throw new Error('This recipe belongs to a different original image. Open the exact same original photo before restoring its edits.');
  }
  keysOnly(object.edits, ['settings', 'advanced', 'annotations'], 'edits');
  if (!Object.hasOwn(object.edits, 'settings')
      || !Object.hasOwn(object.edits, 'advanced')
      || !Object.hasOwn(object.edits, 'annotations')) {
    throw new Error('Incomplete local recipe edits');
  }
  return createLocalRecipe(image, object.edits.settings, object.edits.advanced, object.edits.annotations);
}
