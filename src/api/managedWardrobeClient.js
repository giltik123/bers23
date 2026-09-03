const PREFIX = '/wardrobe/garments';
const EXPECTED_REVISION_HEADER = 'X-Expected-Garment-Revision';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TAGS = 20;
const CATEGORIES = new Set([
  'tshirts','shirts','jackets','hoodies','sweaters',
  'pants','shorts','jeans','skirts','dresses',
  'shoes','boots','sneakers','sandals',
  'hats','glasses','scarves','bags','belts','jewelry','gloves','socks','other',
]);
const SEASONS = new Set(['all_season','spring','summer','autumn','winter']);
const CATEGORY_GROUP = Object.freeze({
  tshirts: 'tops', shirts: 'tops', jackets: 'tops', hoodies: 'tops', sweaters: 'tops',
  pants: 'bottoms', shorts: 'bottoms', jeans: 'bottoms', skirts: 'bottoms',
  dresses: 'dresses',
  shoes: 'footwear', boots: 'footwear', sneakers: 'footwear', sandals: 'footwear',
  hats: 'accessories', glasses: 'accessories', scarves: 'accessories', bags: 'accessories', belts: 'accessories',
  jewelry: 'accessories', gloves: 'accessories', socks: 'accessories',
  other: 'other',
});
const STATUS = new Set(['ACTIVE','ARCHIVED']);

/** Canonical browser adapter for server-owned Wardrobe metadata. */
export function createManagedWardrobeClient(request) {
  if (typeof request !== 'function') throw new TypeError('Managed Wardrobe client requires the canonical Core request transport');
  return Object.freeze({
    list: async () => normalizeList(await request(PREFIX)),
    get: async (garmentId) => normalizeGarment(await request(garmentPath(garmentId))),
    updateMetadata: async (garmentId, expectedRevision, patch) => normalizeGarment(await request(
      garmentPath(garmentId),
      jsonWithRevision('PATCH', metadataPatch(patch), expectedRevision),
    )),
    archive: async (garmentId, expectedRevision) => normalizeGarment(await request(
      `${garmentPath(garmentId)}/archive`,
      mutationWithRevision('POST', expectedRevision),
    )),
    restore: async (garmentId, expectedRevision) => normalizeGarment(await request(
      `${garmentPath(garmentId)}/restore`,
      mutationWithRevision('POST', expectedRevision),
    )),
    remove: async (garmentId, expectedRevision) => request(
      garmentPath(garmentId),
      mutationWithRevision('DELETE', expectedRevision),
    ),
  });
}

export function normalizeManagedWardrobeDto(value) {
  return normalizeGarment(value);
}

function garmentPath(garmentId) {
  return `${PREFIX}/${encodeURIComponent(canonicalUuidIntent(garmentId, 'garmentId'))}`;
}

function metadataPatch(input) {
  assertPlainObject(input, 'Wardrobe metadata patch');
  const allowed = ['name','category','season','material','tags','favorite'];
  assertOnlyKeys(input, allowed, 'Wardrobe metadata patch');
  const patch = {
    ...(Object.hasOwn(input, 'name') ? { name: canonicalName(input.name) } : {}),
    ...(Object.hasOwn(input, 'category') ? { category: canonicalLowerEnum(input.category, CATEGORIES, 'category') } : {}),
    ...(Object.hasOwn(input, 'season') ? { season: canonicalLowerEnum(input.season, SEASONS, 'season') } : {}),
    ...(Object.hasOwn(input, 'material') ? { material: canonicalMaterial(input.material) } : {}),
    ...(Object.hasOwn(input, 'tags') ? { tags: canonicalTags(input.tags) } : {}),
    ...(Object.hasOwn(input, 'favorite') ? { favorite: booleanValue(input.favorite, 'favorite') } : {}),
  };
  if (Object.keys(patch).length === 0) throw new TypeError('Wardrobe metadata patch must change at least one field');
  return Object.freeze(patch);
}

function normalizeList(value) {
  if (!Array.isArray(value)) throw new TypeError('Managed Wardrobe list response must be an array');
  return Object.freeze(value.map(normalizeGarment));
}

function normalizeGarment(value) {
  assertPlainObject(value, 'Managed Wardrobe response');
  assertExactKeys(value, [
    'garment_id','name','category','category_group','season','material','tags',
    'favorite','status','revision','updated_at',
  ], 'Managed Wardrobe response');
  const category = exactLowerEnum(value.category, CATEGORIES, 'category');
  const categoryGroup = exactEnum(value.category_group, new Set(Object.values(CATEGORY_GROUP)), 'category_group');
  if (categoryGroup !== CATEGORY_GROUP[category]) throw new TypeError('Managed Wardrobe category_group does not match category');
  return Object.freeze({
    garmentId: canonicalUuidResponse(value.garment_id, 'garment_id'),
    name: canonicalResponseName(value.name),
    category,
    categoryGroup,
    season: exactLowerEnum(value.season, SEASONS, 'season'),
    material: canonicalResponseMaterial(value.material),
    tags: canonicalResponseTags(value.tags),
    favorite: booleanValue(value.favorite, 'favorite'),
    status: exactEnum(value.status, STATUS, 'status'),
    revision: positiveSafeInteger(value.revision, 'revision'),
    updatedAt: canonicalTimestamp(value.updated_at, 'updated_at'),
  });
}

function canonicalName(value) {
  if (typeof value !== 'string') throw new TypeError('name must be a string');
  const normalized = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (!normalized || normalized.length > 200 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new TypeError('name must contain 1 to 200 printable characters');
  }
  return normalized;
}

function canonicalResponseName(value) {
  if (typeof value !== 'string' || canonicalName(value) !== value) throw new TypeError('Managed Wardrobe response name is not canonical');
  return value;
}

function canonicalMaterial(value) {
  if (typeof value !== 'string') throw new TypeError('material must be a string');
  const normalized = value.normalize('NFKC').trim().toLowerCase();
  if (normalized.length > 50 || /[\u0000-\u001f\u007f]/u.test(normalized)) throw new TypeError('material must contain at most 50 printable characters');
  return normalized;
}

function canonicalResponseMaterial(value) {
  if (typeof value !== 'string' || canonicalMaterial(value) !== value) throw new TypeError('Managed Wardrobe response material is not canonical');
  return value;
}

function canonicalTags(value) {
  if (!Array.isArray(value) || value.length > MAX_TAGS) throw new TypeError(`tags must contain at most ${MAX_TAGS} values`);
  const set = new Set();
  for (const candidate of value) {
    if (typeof candidate !== 'string') throw new TypeError('every tag must be a string');
    const normalized = candidate.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
    if (!normalized || normalized.length > 40 || /[\u0000-\u001f\u007f]/u.test(normalized)) throw new TypeError('tag values must contain 1 to 40 printable characters');
    set.add(normalized);
  }
  return Object.freeze([...set].sort());
}

function canonicalResponseTags(value) {
  const normalized = canonicalTags(value);
  if (normalized.length !== value.length || normalized.some((tag, index) => tag !== value[index])) {
    throw new TypeError('Managed Wardrobe response tags are not canonical sorted unique values');
  }
  return normalized;
}

function canonicalLowerEnum(value, allowed, label) {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string`);
  const normalized = value.normalize('NFKC').trim().toLowerCase();
  if (!allowed.has(normalized)) throw new TypeError(`${label} is outside the accepted Wardrobe taxonomy`);
  return normalized;
}

function exactLowerEnum(value, allowed, label) {
  if (typeof value !== 'string' || value !== value.toLowerCase() || !allowed.has(value)) throw new TypeError(`${label} is not a canonical Wardrobe enum`);
  return value;
}

function exactEnum(value, allowed, label) {
  if (typeof value !== 'string' || !allowed.has(value)) throw new TypeError(`${label} is outside the accepted enum`);
  return value;
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

function booleanValue(value, label) {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be boolean`);
  return value;
}

function positiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${label} must be a positive safe integer`);
  return value;
}

function canonicalTimestamp(value, label) {
  if (typeof value !== 'string') throw new TypeError(`${label} must be an ISO timestamp`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) throw new TypeError(`${label} must be a canonical ISO timestamp`);
  return value;
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

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(`${label} must be a plain object`);
}

function assertOnlyKeys(value, allowed, label) {
  const set = new Set(allowed);
  if (Object.keys(value).some(key => !set.has(key))) throw new TypeError(`${label} contains forbidden fields`);
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || wanted.some((key, index) => actual[index] !== key)) throw new TypeError(`${label} has unexpected fields`);
}
