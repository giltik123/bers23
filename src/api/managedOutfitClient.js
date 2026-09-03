const PREFIX = '/wardrobe/outfits';
const EXPECTED_REVISION_HEADER = 'X-Expected-Outfit-Revision';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ENTRIES = 32;
const STYLES = new Set(['minimal','classic','elegant','streetwear','business','luxury','sport','vintage','casual','modern','creative','smart_casual']);
const SEASONS = new Set(['all_season','spring','summer','autumn','winter']);
const OCCASIONS = new Set(['casual','business','formal','wedding','party','travel','sport','outdoor','streetwear','luxury','home','beach','night_out']);
const LAYER_ROLES = new Set(['BASE_TOP','MID_TOP','OUTER_TOP','FULL_BODY','BOTTOM','FOOTWEAR','ACCESSORY']);
const GARMENT_CATEGORIES = new Set([
  'tshirts','shirts','jackets','hoodies','sweaters','pants','shorts','jeans','skirts','dresses',
  'shoes','boots','sneakers','sandals','hats','glasses','scarves','bags','belts','jewelry','gloves','socks','other',
]);
const ENTRY_READINESS = new Set(['READY','GARMENT_UNAVAILABLE','ROLE_REVIEW_REQUIRED']);
const OUTFIT_READINESS = new Set(['REFERENCES_READY','EMPTY','GARMENT_UNAVAILABLE','ROLE_REVIEW_REQUIRED']);

/**
 * Pure browser adapter for the accepted canonical Outfit aggregate.
 *
 * The caller injects the existing Core request transport. This module never
 * calls fetch, never owns cookies/CSRF and cannot fall back to generic entity
 * CRUD. It only translates product intent to the narrow F3 Outfit HTTP surface
 * and validates the returned canonical aggregate before UI consumption.
 */
export function createManagedOutfitClient(request) {
  if (typeof request !== 'function') throw new TypeError('Managed Outfit client requires the canonical Core request transport');
  return Object.freeze({
    list: async () => normalizeOutfitList(await request(PREFIX)),
    get: async (outfitId) => normalizeOutfit(await request(outfitPath(outfitId))),
    create: async (input) => normalizeOutfit(await request(PREFIX, json('POST', createBody(input)))),
    updateMetadata: async (outfitId, expectedRevision, patch) => normalizeOutfit(await request(
      outfitPath(outfitId),
      jsonWithRevision('PATCH', metadataPatch(patch), expectedRevision),
    )),
    duplicate: async (outfitId, name) => normalizeOutfit(await request(
      `${outfitPath(outfitId)}/duplicate`,
      json('POST', Object.freeze({ name: canonicalName(name) })),
    )),
    archive: async (outfitId, expectedRevision) => normalizeOutfit(await request(
      `${outfitPath(outfitId)}/archive`,
      mutationWithRevision('POST', expectedRevision),
    )),
    restore: async (outfitId, expectedRevision) => normalizeOutfit(await request(
      `${outfitPath(outfitId)}/restore`,
      mutationWithRevision('POST', expectedRevision),
    )),
    remove: async (outfitId, expectedRevision) => request(
      outfitPath(outfitId),
      mutationWithRevision('DELETE', expectedRevision),
    ),
    addEntry: async (outfitId, expectedRevision, input) => normalizeOutfit(await request(
      `${outfitPath(outfitId)}/entries`,
      jsonWithRevision('POST', entryBody(input), expectedRevision),
    )),
    replaceEntry: async (outfitId, entryId, expectedRevision, input) => normalizeOutfit(await request(
      `${outfitPath(outfitId)}/entries/${encodeId(entryId, 'entryId')}`,
      jsonWithRevision('PUT', entryBody(input), expectedRevision),
    )),
    removeEntry: async (outfitId, entryId, expectedRevision) => normalizeOutfit(await request(
      `${outfitPath(outfitId)}/entries/${encodeId(entryId, 'entryId')}`,
      mutationWithRevision('DELETE', expectedRevision),
    )),
    setEntryRole: async (outfitId, entryId, expectedRevision, layerRole) => normalizeOutfit(await request(
      `${outfitPath(outfitId)}/entries/${encodeId(entryId, 'entryId')}`,
      jsonWithRevision('PATCH', Object.freeze({ layer_role: canonicalLayerRole(layerRole) }), expectedRevision),
    )),
    reorderEntries: async (outfitId, expectedRevision, entryIds) => normalizeOutfit(await request(
      `${outfitPath(outfitId)}/reorder`,
      jsonWithRevision('POST', Object.freeze({ entry_ids: canonicalEntryOrder(entryIds) }), expectedRevision),
    )),
  });
}

export function normalizeManagedOutfitDto(value) {
  return normalizeOutfit(value);
}

function outfitPath(outfitId) {
  return `${PREFIX}/${encodeId(outfitId, 'outfitId')}`;
}

function createBody(input) {
  assertPlainObject(input, 'Outfit create');
  assertOnlyKeys(input, ['name', 'style', 'season', 'occasion', 'favorite'], 'Outfit create');
  if (!Object.hasOwn(input, 'name')) throw new TypeError('Outfit create requires name');
  return Object.freeze({
    name: canonicalName(input.name),
    ...(Object.hasOwn(input, 'style') ? { style: canonicalLowerEnum(input.style, STYLES, 'style') } : {}),
    ...(Object.hasOwn(input, 'season') ? { season: canonicalLowerEnum(input.season, SEASONS, 'season') } : {}),
    ...(Object.hasOwn(input, 'occasion') ? { occasion: canonicalLowerEnum(input.occasion, OCCASIONS, 'occasion') } : {}),
    ...(Object.hasOwn(input, 'favorite') ? { favorite: booleanValue(input.favorite, 'favorite') } : {}),
  });
}

function metadataPatch(input) {
  assertPlainObject(input, 'Outfit metadata patch');
  const allowed = ['name', 'style', 'season', 'occasion', 'favorite'];
  assertOnlyKeys(input, allowed, 'Outfit metadata patch');
  const patch = {
    ...(Object.hasOwn(input, 'name') ? { name: canonicalName(input.name) } : {}),
    ...(Object.hasOwn(input, 'style') ? { style: canonicalLowerEnum(input.style, STYLES, 'style') } : {}),
    ...(Object.hasOwn(input, 'season') ? { season: canonicalLowerEnum(input.season, SEASONS, 'season') } : {}),
    ...(Object.hasOwn(input, 'occasion') ? { occasion: canonicalLowerEnum(input.occasion, OCCASIONS, 'occasion') } : {}),
    ...(Object.hasOwn(input, 'favorite') ? { favorite: booleanValue(input.favorite, 'favorite') } : {}),
  };
  if (Object.keys(patch).length === 0) throw new TypeError('Outfit metadata patch must change at least one field');
  return Object.freeze(patch);
}

function entryBody(input) {
  assertPlainObject(input, 'Outfit entry');
  assertOnlyKeys(input, ['garmentId', 'layerRole'], 'Outfit entry');
  if (!Object.hasOwn(input, 'garmentId')) throw new TypeError('Outfit entry requires garmentId');
  return Object.freeze({
    garment_id: canonicalUuidIntent(input.garmentId, 'garmentId'),
    ...(Object.hasOwn(input, 'layerRole') ? { layer_role: canonicalLayerRole(input.layerRole) } : {}),
  });
}

function canonicalEntryOrder(value) {
  if (!Array.isArray(value) || value.length > MAX_ENTRIES) throw new TypeError(`entryIds must contain at most ${MAX_ENTRIES} entries`);
  const ids = value.map((id, index) => canonicalUuidIntent(id, `entryIds[${index}]`));
  if (new Set(ids).size !== ids.length) throw new TypeError('entryIds must not contain duplicates');
  return Object.freeze(ids);
}

function normalizeOutfitList(value) {
  if (!Array.isArray(value)) throw new TypeError('Managed Outfit list response must be an array');
  return Object.freeze(value.map(normalizeOutfit));
}

function normalizeOutfit(value) {
  assertPlainObject(value, 'Managed Outfit response');
  assertExactKeys(value, [
    'id', 'name', 'style', 'season', 'occasion', 'favorite', 'status', 'revision',
    'reference_readiness', 'entries', 'created_at', 'updated_at',
  ], 'Managed Outfit response');
  if (!Array.isArray(value.entries)) throw new TypeError('Managed Outfit entries must be an array');
  if (value.entries.length > MAX_ENTRIES) throw new TypeError('Managed Outfit exceeds the canonical entry limit');
  const entries = value.entries.map((entry, index) => normalizeEntry(entry, index));
  if (entries.some((entry, index) => entry.position !== index)) throw new TypeError('Managed Outfit entries must have contiguous canonical positions');
  if (new Set(entries.map(entry => entry.entryId)).size !== entries.length) throw new TypeError('Managed Outfit entry IDs must be unique');
  const referenceReadiness = exactEnum(value.reference_readiness, OUTFIT_READINESS, 'reference_readiness');
  const expectedReadiness = deriveOutfitReadiness(entries);
  if (referenceReadiness !== expectedReadiness) {
    throw new TypeError(`Managed Outfit aggregate readiness ${referenceReadiness} does not match canonical entries (${expectedReadiness})`);
  }
  return Object.freeze({
    id: canonicalUuidResponse(value.id, 'id'),
    name: canonicalResponseName(value.name),
    style: exactLowerEnum(value.style, STYLES, 'style'),
    season: exactLowerEnum(value.season, SEASONS, 'season'),
    occasion: exactLowerEnum(value.occasion, OCCASIONS, 'occasion'),
    favorite: booleanValue(value.favorite, 'favorite'),
    status: exactEnum(value.status, new Set(['ACTIVE','ARCHIVED']), 'status'),
    revision: positiveSafeInteger(value.revision, 'revision'),
    referenceReadiness,
    entries: Object.freeze(entries),
    createdAt: canonicalTimestamp(value.created_at, 'created_at'),
    updatedAt: canonicalTimestamp(value.updated_at, 'updated_at'),
  });
}

function normalizeEntry(value, index) {
  assertPlainObject(value, `Managed Outfit entry ${index}`);
  const allowed = ['entry_id', 'garment_id', 'position', 'layer_role', 'garment_category', 'reference_readiness'];
  assertOnlyKeys(value, allowed, `Managed Outfit entry ${index}`);
  for (const required of ['entry_id', 'garment_id', 'position', 'layer_role', 'reference_readiness']) {
    if (!Object.hasOwn(value, required)) throw new TypeError(`Managed Outfit entry ${index} is missing ${required}`);
  }
  return Object.freeze({
    entryId: canonicalUuidResponse(value.entry_id, `entries[${index}].entry_id`),
    garmentId: canonicalUuidResponse(value.garment_id, `entries[${index}].garment_id`),
    position: nonNegativeSafeInteger(value.position, `entries[${index}].position`),
    layerRole: exactEnum(value.layer_role, LAYER_ROLES, `entries[${index}].layer_role`),
    ...(value.garment_category !== undefined ? { garmentCategory: exactLowerEnum(value.garment_category, GARMENT_CATEGORIES, `entries[${index}].garment_category`) } : {}),
    referenceReadiness: exactEnum(value.reference_readiness, ENTRY_READINESS, `entries[${index}].reference_readiness`),
  });
}

function deriveOutfitReadiness(entries) {
  if (entries.length === 0) return 'EMPTY';
  if (entries.some(entry => entry.referenceReadiness === 'GARMENT_UNAVAILABLE')) return 'GARMENT_UNAVAILABLE';
  if (entries.some(entry => entry.referenceReadiness === 'ROLE_REVIEW_REQUIRED')) return 'ROLE_REVIEW_REQUIRED';
  return 'REFERENCES_READY';
}

function json(method, body) {
  return Object.freeze({ method, body: JSON.stringify(body) });
}

function jsonWithRevision(method, body, expectedRevision) {
  return Object.freeze({
    method,
    headers: Object.freeze({ [EXPECTED_REVISION_HEADER]: String(positiveSafeInteger(expectedRevision, 'expectedRevision')) }),
    body: JSON.stringify(body),
  });
}

function mutationWithRevision(method, expectedRevision) {
  return Object.freeze({
    method,
    headers: Object.freeze({ [EXPECTED_REVISION_HEADER]: String(positiveSafeInteger(expectedRevision, 'expectedRevision')) }),
  });
}

function encodeId(value, label) {
  return encodeURIComponent(canonicalUuidIntent(value, label));
}

function canonicalUuidIntent(value, label) {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a UUID string`);
  const normalized = value.normalize('NFKC').trim().toLowerCase();
  if (!UUID.test(normalized)) throw new TypeError(`${label} must be a UUID`);
  return normalized;
}

function canonicalUuidResponse(value, label) {
  if (typeof value !== 'string' || !UUID.test(value) || value !== value.toLowerCase()) throw new TypeError(`${label} must be a canonical lowercase UUID`);
  return value;
}

function canonicalLayerRole(value) {
  if (typeof value !== 'string') throw new TypeError('layerRole must be a string');
  const normalized = value.normalize('NFKC').trim().toUpperCase();
  if (!LAYER_ROLES.has(normalized)) throw new TypeError('layerRole is outside the accepted Outfit role set');
  return normalized;
}

function canonicalName(value) {
  if (typeof value !== 'string') throw new TypeError('name must be a string');
  const normalized = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (!normalized || Array.from(normalized).length > 200 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new TypeError('name must contain 1 to 200 printable characters');
  }
  return normalized;
}

function canonicalResponseName(value) {
  if (typeof value !== 'string' || canonicalName(value) !== value) throw new TypeError('Managed Outfit response name is not canonical');
  return value;
}

function canonicalLowerEnum(value, allowed, label) {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string`);
  const normalized = value.normalize('NFKC').trim().toLowerCase();
  if (!allowed.has(normalized)) throw new TypeError(`${label} is outside the accepted Outfit taxonomy`);
  return normalized;
}

function exactLowerEnum(value, allowed, label) {
  if (typeof value !== 'string' || value !== value.toLowerCase() || !allowed.has(value)) throw new TypeError(`${label} is not a canonical Outfit enum`);
  return value;
}

function exactEnum(value, allowed, label) {
  if (typeof value !== 'string' || !allowed.has(value)) throw new TypeError(`${label} is outside the accepted enum`);
  return value;
}

function booleanValue(value, label) {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be boolean`);
  return value;
}

function positiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${label} must be a positive safe integer`);
  return value;
}

function nonNegativeSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative safe integer`);
  return value;
}

function canonicalTimestamp(value, label) {
  if (typeof value !== 'string') throw new TypeError(`${label} must be an ISO timestamp`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new TypeError(`${label} must be a canonical ISO timestamp`);
  return value;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(`${label} must be a plain object`);
}

function assertOnlyKeys(value, allowed, label) {
  const allow = new Set(allowed);
  const keys = Object.keys(value);
  if (keys.some(key => !allow.has(key))) throw new TypeError(`${label} contains forbidden fields`);
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || wanted.some((key, index) => actual[index] !== key)) throw new TypeError(`${label} has unexpected fields`);
}
