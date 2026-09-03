const PREFIX = '/wardrobe/outfits';
const EXPECTED_REVISION_HEADER = 'X-Expected-Outfit-Revision';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const LAYER_ROLES = new Set(['BASE', 'INNER', 'MID', 'OUTER', 'LOWER', 'FOOTWEAR', 'ACCESSORY']);

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
      json('POST', Object.freeze({ name: requiredText(name, 'name', 120) })),
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
  return Object.freeze({
    name: requiredText(input.name, 'name', 120),
    ...(input.style !== undefined ? { style: optionalText(input.style, 'style', 120) } : {}),
    ...(input.season !== undefined ? { season: optionalText(input.season, 'season', 80) } : {}),
    ...(input.occasion !== undefined ? { occasion: optionalText(input.occasion, 'occasion', 120) } : {}),
    ...(input.favorite !== undefined ? { favorite: booleanValue(input.favorite, 'favorite') } : {}),
  });
}

function metadataPatch(input) {
  assertPlainObject(input, 'Outfit metadata patch');
  const allowed = ['name', 'style', 'season', 'occasion', 'favorite'];
  assertOnlyKeys(input, allowed, 'Outfit metadata patch');
  if (Object.keys(input).length === 0) throw new TypeError('Outfit metadata patch must change at least one field');
  return Object.freeze({
    ...(input.name !== undefined ? { name: requiredText(input.name, 'name', 120) } : {}),
    ...(input.style !== undefined ? { style: optionalText(input.style, 'style', 120) } : {}),
    ...(input.season !== undefined ? { season: optionalText(input.season, 'season', 80) } : {}),
    ...(input.occasion !== undefined ? { occasion: optionalText(input.occasion, 'occasion', 120) } : {}),
    ...(input.favorite !== undefined ? { favorite: booleanValue(input.favorite, 'favorite') } : {}),
  });
}

function entryBody(input) {
  assertPlainObject(input, 'Outfit entry');
  assertOnlyKeys(input, ['garmentId', 'layerRole'], 'Outfit entry');
  const garmentId = canonicalUuid(input.garmentId, 'garmentId');
  return Object.freeze({
    garment_id: garmentId,
    ...(input.layerRole !== undefined ? { layer_role: canonicalLayerRole(input.layerRole) } : {}),
  });
}

function canonicalEntryOrder(value) {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError('entryIds must be a non-empty array');
  const ids = value.map((id, index) => canonicalUuid(id, `entryIds[${index}]`));
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
  const status = enumValue(value.status, ['ACTIVE', 'ARCHIVED'], 'status');
  const readiness = enumValue(value.reference_readiness, ['READY', 'ROLE_REVIEW_REQUIRED', 'GARMENT_REFERENCE_MISSING'], 'reference_readiness');
  if (!Array.isArray(value.entries)) throw new TypeError('Managed Outfit entries must be an array');
  const entries = value.entries.map((entry, index) => normalizeEntry(entry, index));
  const positions = entries.map(entry => entry.position);
  if (positions.some((position, index) => position !== index)) throw new TypeError('Managed Outfit entries must have contiguous canonical positions');
  if (new Set(entries.map(entry => entry.entryId)).size !== entries.length) throw new TypeError('Managed Outfit entry IDs must be unique');
  return Object.freeze({
    id: canonicalUuid(value.id, 'id'),
    name: requiredText(value.name, 'name', 120),
    style: nullableText(value.style, 'style', 120),
    season: nullableText(value.season, 'season', 80),
    occasion: nullableText(value.occasion, 'occasion', 120),
    favorite: booleanValue(value.favorite, 'favorite'),
    status,
    revision: positiveSafeInteger(value.revision, 'revision'),
    referenceReadiness: readiness,
    entries: Object.freeze(entries),
    createdAt: isoTimestamp(value.created_at, 'created_at'),
    updatedAt: isoTimestamp(value.updated_at, 'updated_at'),
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
    entryId: canonicalUuid(value.entry_id, `entries[${index}].entry_id`),
    garmentId: canonicalUuid(value.garment_id, `entries[${index}].garment_id`),
    position: nonNegativeSafeInteger(value.position, `entries[${index}].position`),
    layerRole: canonicalLayerRole(value.layer_role),
    ...(value.garment_category !== undefined ? { garmentCategory: requiredText(value.garment_category, `entries[${index}].garment_category`, 80) } : {}),
    referenceReadiness: enumValue(value.reference_readiness, ['READY', 'ROLE_REVIEW_REQUIRED', 'GARMENT_REFERENCE_MISSING'], `entries[${index}].reference_readiness`),
  });
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
  return encodeURIComponent(canonicalUuid(value, label));
}

function canonicalUuid(value, label) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new TypeError(`${label} must be a canonical lowercase UUID`);
  return value;
}

function canonicalLayerRole(value) {
  if (typeof value !== 'string' || !LAYER_ROLES.has(value)) throw new TypeError('layerRole is outside the accepted Outfit role set');
  return value;
}

function requiredText(value, label, maxLength) {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string`);
  const normalized = value.trim();
  if (!normalized || [...normalized].length > maxLength) throw new TypeError(`${label} is outside the accepted length`);
  return normalized;
}

function optionalText(value, label, maxLength) {
  if (value === null) return null;
  return requiredText(value, label, maxLength);
}

function nullableText(value, label, maxLength) {
  if (value === null) return null;
  return requiredText(value, label, maxLength);
}

function booleanValue(value, label) {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be boolean`);
  return value;
}

function enumValue(value, allowed, label) {
  if (typeof value !== 'string' || !allowed.includes(value)) throw new TypeError(`${label} is outside the accepted enum`);
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

function isoTimestamp(value, label) {
  if (typeof value !== 'string' || !value || !Number.isFinite(Date.parse(value))) throw new TypeError(`${label} must be an ISO timestamp`);
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
