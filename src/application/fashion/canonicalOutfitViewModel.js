export function createCanonicalOutfitViewModel({ outfits, wardrobe }) {
  if (!outfits
    || typeof outfits.list !== 'function'
    || typeof outfits.create !== 'function'
    || typeof outfits.updateMetadata !== 'function'
    || typeof outfits.archive !== 'function'
    || typeof outfits.restore !== 'function'
    || typeof outfits.addEntry !== 'function'
    || typeof outfits.removeEntry !== 'function'
    || typeof outfits.setEntryRole !== 'function'
    || typeof outfits.reorderEntries !== 'function') {
    throw new TypeError('Canonical Outfit view model requires the Managed Outfit client');
  }
  if (!wardrobe || typeof wardrobe.list !== 'function') {
    throw new TypeError('Canonical Outfit view model requires Managed Wardrobe display projection');
  }

  return Object.freeze({
    async load() {
      const outfitSnapshot = sortOutfits(await outfits.list());
      try {
        return Object.freeze({
          outfits: outfitSnapshot,
          garments: sortGarments(await wardrobe.list()),
          wardrobeError: null,
        });
      } catch (wardrobeError) {
        return Object.freeze({
          outfits: outfitSnapshot,
          garments: Object.freeze([]),
          wardrobeError,
        });
      }
    },
    async create(input) {
      return outfits.create({ name: requiredString(input?.name, 'name') });
    },
    async setFavorite(outfit, favorite) {
      const current = outfitIntent(outfit);
      return outfits.updateMetadata(current.id, current.revision, { favorite: Boolean(favorite) });
    },
    async archive(outfit) {
      const current = outfitIntent(outfit);
      return outfits.archive(current.id, current.revision);
    },
    async restore(outfit) {
      const current = outfitIntent(outfit);
      return outfits.restore(current.id, current.revision);
    },
    async addEntry(outfit, garmentId, layerRole = undefined) {
      const current = outfitIntent(outfit);
      const input = { garmentId: requiredString(garmentId, 'garmentId') };
      if (layerRole !== undefined && layerRole !== '') input.layerRole = layerRole;
      return outfits.addEntry(current.id, current.revision, input);
    },
    async removeEntry(outfit, entryId) {
      const current = outfitIntent(outfit);
      return outfits.removeEntry(current.id, requiredString(entryId, 'entryId'), current.revision);
    },
    async setEntryRole(outfit, entryId, layerRole) {
      const current = outfitIntent(outfit);
      return outfits.setEntryRole(
        current.id,
        requiredString(entryId, 'entryId'),
        current.revision,
        requiredString(layerRole, 'layerRole'),
      );
    },
    async moveEntry(outfit, entryId, delta) {
      const current = outfitIntent(outfit);
      if (delta !== -1 && delta !== 1) throw new TypeError('delta must be -1 or 1');
      if (!Array.isArray(outfit.entries)) throw new TypeError('Outfit entries are required for reorder');
      const index = outfit.entries.findIndex((entry) => entry.entryId === entryId);
      const target = index + delta;
      if (index < 0) throw new TypeError('entryId is not part of the Outfit snapshot');
      if (target < 0 || target >= outfit.entries.length) return outfit;
      const order = outfit.entries.map((entry) => entry.entryId);
      [order[index], order[target]] = [order[target], order[index]];
      return outfits.reorderEntries(current.id, current.revision, order);
    },
  });
}

export function sortOutfits(values) {
  if (!Array.isArray(values)) throw new TypeError('Managed Outfit client must return an array');
  return Object.freeze([...values].sort(
    (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)) || String(a.id).localeCompare(String(b.id)),
  ));
}

function sortGarments(values) {
  if (!Array.isArray(values)) throw new TypeError('Managed Wardrobe client must return an array');
  return Object.freeze([...values].sort(
    (a, b) => String(a.name).localeCompare(String(b.name)) || String(a.garmentId).localeCompare(String(b.garmentId)),
  ));
}

function outfitIntent(value) {
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !Number.isSafeInteger(value.revision) || value.revision < 1) {
    throw new TypeError('Outfit action requires a canonical Outfit snapshot');
  }
  return Object.freeze({ id: value.id, revision: value.revision });
}

function requiredString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} is required`);
  return value;
}
