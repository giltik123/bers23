/**
 * Explicit on-device draft storage for the local photo editor.
 *
 * This is intentionally ONE slot, not an invisible automatic cache: a person
 * must click Save, can clear it, and saving another photo replaces the slot.
 * No photograph, URL, token or Core account data is written by this module.
 *
 * Storage is injected so policy, failures and private mode can be unit-tested
 * without browser APIs. Cross-device transfer uses the portable JSON recipe.
 */
import {
  parseLocalRecipe, MAX_LOCAL_RECIPE_BYTES,
} from './localRecipe.js';

export const LOCAL_DEVICE_DRAFT_KEY = 'bers.local-photo-edit.explicit-draft.v1';

function checkStorage(storage) {
  if (!storage || typeof storage.getItem !== 'function'
      || typeof storage.setItem !== 'function'
      || typeof storage.removeItem !== 'function') {
    throw new Error('Browser device storage is not available');
  }
}

export function hasLocalDeviceDraft(storage) {
  checkStorage(storage);
  return storage.getItem(LOCAL_DEVICE_DRAFT_KEY) !== null;
}

export function saveLocalDeviceDraft(storage, recipe) {
  checkStorage(storage);
  if (!recipe || typeof recipe !== 'object') throw new Error('Invalid local edit recipe');
  // Round-trip through the full versioned parser: a forged format, an
  // unexpected key, or a partial recipe must fail before any storage write.
  const normalized = parseLocalRecipe(JSON.stringify(recipe), recipe.source);
  const json = JSON.stringify(normalized);
  if (new TextEncoder().encode(json).byteLength > MAX_LOCAL_RECIPE_BYTES) {
    throw new Error('Local editing recipe is too large to save on this device');
  }
  try { storage.setItem(LOCAL_DEVICE_DRAFT_KEY, json); }
  catch { throw new Error('Could not store local edits on this device. Browser storage may be full or disabled. Download a JSON recipe instead.'); }
  return json.length;
}

export function restoreLocalDeviceDraft(storage, source) {
  checkStorage(storage);
  let raw;
  try { raw = storage.getItem(LOCAL_DEVICE_DRAFT_KEY); }
  catch { throw new Error('Browser storage is unavailable. Restore from a downloaded JSON recipe instead.'); }
  if (raw === null) throw new Error('No local edit draft was saved on this device');
  return parseLocalRecipe(raw, source);
}

export function clearLocalDeviceDraft(storage) {
  checkStorage(storage);
  try { storage.removeItem(LOCAL_DEVICE_DRAFT_KEY); }
  catch { throw new Error('Browser would not clear the saved local edit draft'); }
}
