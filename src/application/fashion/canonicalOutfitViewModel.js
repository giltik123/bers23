export const OUTFIT_STYLES = Object.freeze([
  'minimal', 'classic', 'elegant', 'streetwear', 'business', 'luxury', 'sport', 'vintage',
  'casual', 'modern', 'creative', 'smart_casual',
]);
export const OUTFIT_SEASONS = Object.freeze(['all_season', 'spring', 'summer', 'autumn', 'winter']);
export const OUTFIT_OCCASIONS = Object.freeze([
  'casual', 'business', 'formal', 'wedding', 'party', 'travel', 'sport', 'outdoor',
  'streetwear', 'luxury', 'home', 'beach', 'night_out',
]);
export const OUTFIT_LAYER_ROLES = Object.freeze([
  'BASE_TOP', 'MID_TOP', 'OUTER_TOP', 'FULL_BODY', 'BOTTOM', 'FOOTWEAR', 'ACCESSORY',
]);

const EMPTY_ROLES = Object.freeze([]);
const CATEGORY_LAYER_ROLES = Object.freeze({
  tshirts: Object.freeze(['BASE_TOP']),
  shirts: Object.freeze(['BASE_TOP', 'MID_TOP']),
  jackets: Object.freeze(['OUTER_TOP']),
  hoodies: Object.freeze(['MID_TOP', 'OUTER_TOP']),
  sweaters: Object.freeze(['MID_TOP']),
  pants: Object.freeze(['BOTTOM']),
  shorts: Object.freeze(['BOTTOM']),
  jeans: Object.freeze(['BOTTOM']),
  skirts: Object.freeze(['BOTTOM']),
  dresses: Object.freeze(['FULL_BODY']),
  shoes: Object.freeze(['FOOTWEAR']),
  boots: Object.freeze(['FOOTWEAR']),
  sneakers: Object.freeze(['FOOTWEAR']),
  sandals: Object.freeze(['FOOTWEAR']),
  hats: Object.freeze(['ACCESSORY']),
  glasses: Object.freeze(['ACCESSORY']),
  scarves: Object.freeze(['ACCESSORY']),
  bags: Object.freeze(['ACCESSORY']),
  belts: Object.freeze(['ACCESSORY']),
  jewelry: Object.freeze(['ACCESSORY']),
  gloves: Object.freeze(['ACCESSORY']),
  socks: Object.freeze(['ACCESSORY']),
  other: EMPTY_ROLES,
});

/**
 * Thin UI orchestration over accepted F3 Outfit and F2 Wardrobe clients.
 * Outfit remains the sole owner of references, order, roles, readiness and revision.
 * Wardrobe is read-only display/picker projection and may fail independently.
 */
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

  const load = async () => {
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
  };

  const updateMetadata = async (outfit, input) => {
    const current = outfitIntent(outfit);
    const patch = canonicalMetadataPatch(input);
    const changed = Object.fromEntries(Object.entries(patch).filter(([key, value]) => outfit[key] !== value));
    if (Object.keys(changed).length === 0) return outfit;
    return outfits.updateMetadata(current.id, current.revision, Object.freeze(changed));
  };

  return Object.freeze({
    load,
    async create(input) {
      return outfits.create(canonicalCreate(input));
    },
    updateMetadata,
    async setFavorite(outfit, favorite) {
      if (typeof favorite !== 'boolean') throw new TypeError('favorite must be boolean');
      return updateMetadata(outfit, { favorite });
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
      if (layerRole !== undefined && layerRole !== '') input.layerRole = canonicalRole(layerRole);
      return outfits.addEntry(current.id, current.revision, Object.freeze(input));
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
        canonicalRole(layerRole),
      );
    },
    async moveEntry(outfit, entryId, delta) {
      const current = outfitIntent(outfit);
      if (delta !== -1 && delta !== 1) throw new TypeError('delta must be -1 or 1');
      if (!Array.isArray(outfit.entries)) throw new TypeError('Outfit entries are required for reorder');
      const index = outfit.entries.findIndex((entry) => entry.entryId === entryId);
      if (index < 0) throw new TypeError('entryId is not part of the Outfit snapshot');
      const target = index + delta;
      if (target < 0 || target >= outfit.entries.length) return outfit;
      const order = outfit.entries.map((entry) => entry.entryId);
      [order[index], order[target]] = [order[target], order[index]];
      return outfits.reorderEntries(current.id, current.revision, Object.freeze(order));
    },
  });
}

export function sortOutfits(values) {
  if (!Array.isArray(values)) throw new TypeError('Managed Outfit client must return an array');
  return Object.freeze([...values].sort(
    (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)) || String(a.id).localeCompare(String(b.id)),
  ));
}

export function allowedLayerRolesForCategory(category) {
  if (typeof category !== 'string') return EMPTY_ROLES;
  return CATEGORY_LAYER_ROLES[category] ?? EMPTY_ROLES;
}

export function allowedLayerRolesForEntry(entry, garment) {
  return allowedLayerRolesForCategory(garment?.category ?? entry?.garmentCategory);
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

function canonicalCreate(value) {
  assertPlainObject(value, 'Outfit create');
  const allowed = new Set(['name', 'style', 'season', 'occasion', 'favorite']);
  if (!Object.hasOwn(value, 'name') || Object.keys(value).some((key) => !allowed.has(key))) {
    throw new TypeError('Outfit create requires name and canonical metadata only');
  }
  return Object.freeze({
    name: canonicalName(value.name),
    ...(Object.hasOwn(value, 'style') ? { style: canonicalLowerEnum(value.style, OUTFIT_STYLES, 'style') } : {}),
    ...(Object.hasOwn(value, 'season') ? { season: canonicalLowerEnum(value.season, OUTFIT_SEASONS, 'season') } : {}),
    ...(Object.hasOwn(value, 'occasion') ? { occasion: canonicalLowerEnum(value.occasion, OUTFIT_OCCASIONS, 'occasion') } : {}),
    ...(Object.hasOwn(value, 'favorite') ? { favorite: canonicalBoolean(value.favorite, 'favorite') } : {}),
  });
}

function canonicalMetadataPatch(value) {
  assertPlainObject(value, 'Outfit metadata patch');
  const allowed = new Set(['name', 'style', 'season', 'occasion', 'favorite']);
  if (Object.keys(value).length === 0 || Object.keys(value).some((key) => !allowed.has(key))) {
    throw new TypeError('Outfit metadata patch must contain canonical metadata fields');
  }
  return Object.freeze({
    ...(Object.hasOwn(value, 'name') ? { name: canonicalName(value.name) } : {}),
    ...(Object.hasOwn(value, 'style') ? { style: canonicalLowerEnum(value.style, OUTFIT_STYLES, 'style') } : {}),
    ...(Object.hasOwn(value, 'season') ? { season: canonicalLowerEnum(value.season, OUTFIT_SEASONS, 'season') } : {}),
    ...(Object.hasOwn(value, 'occasion') ? { occasion: canonicalLowerEnum(value.occasion, OUTFIT_OCCASIONS, 'occasion') } : {}),
    ...(Object.hasOwn(value, 'favorite') ? { favorite: canonicalBoolean(value.favorite, 'favorite') } : {}),
  });
}

function canonicalName(value) {
  if (typeof value !== 'string') throw new TypeError('name must be a string');
  const normalized = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (!normalized || Array.from(normalized).length > 200 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new TypeError('name must contain 1 to 200 printable characters');
  }
  return normalized;
}

function canonicalLowerEnum(value, allowed, label) {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string`);
  const normalized = value.normalize('NFKC').trim().toLowerCase();
  if (!allowed.includes(normalized)) throw new TypeError(`${label} is outside the accepted Outfit taxonomy`);
  return normalized;
}

function canonicalRole(value) {
  if (typeof value !== 'string') throw new TypeError('layerRole must be a string');
  const normalized = value.normalize('NFKC').trim().toUpperCase();
  if (!OUTFIT_LAYER_ROLES.includes(normalized)) throw new TypeError('layerRole is outside the accepted Outfit role set');
  return normalized;
}

function canonicalBoolean(value, label) {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be boolean`);
  return value;
}

function requiredString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} is required`);
  return value;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object`);
  }
}
