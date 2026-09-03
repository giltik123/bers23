const PREFIX = '/wardrobe/collections';
const EXPECTED_REVISION_HEADER = 'X-Expected-Collection-Revision';
const EXPECTED_SOURCE_REVISION_HEADER = 'X-Expected-Source-Collection-Revision';
const EXPECTED_TARGET_REVISION_HEADER = 'X-Expected-Target-Collection-Revision';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Canonical browser adapter for server-owned Garment Collection membership. */
export function createManagedGarmentCollectionClient(request) {
  if (typeof request !== 'function') throw new TypeError('Managed Garment Collection client requires the canonical Core request transport');
  return Object.freeze({
    list: async () => normalizeList(await request(PREFIX)),
    get: async (collectionId) => normalizeCollection(await request(collectionPath(collectionId))),
    create: async (input) => normalizeCollection(await request(PREFIX, json('POST', createBody(input)))),
    updateMetadata: async (collectionId, expectedRevision, patch) => normalizeCollection(await request(
      collectionPath(collectionId),
      jsonWithRevision('PATCH', metadataPatch(patch), expectedRevision),
    )),
    remove: async (collectionId, expectedRevision) => request(
      collectionPath(collectionId),
      mutationWithRevision('DELETE', expectedRevision),
    ),
    addGarment: async (collectionId, expectedRevision, garmentId) => normalizeCollection(await request(
      membershipPath(collectionId, garmentId),
      mutationWithRevision('POST', expectedRevision),
    )),
    removeGarment: async (collectionId, expectedRevision, garmentId) => normalizeCollection(await request(
      membershipPath(collectionId, garmentId),
      mutationWithRevision('DELETE', expectedRevision),
    )),
    moveGarment: async ({ sourceCollectionId, targetCollectionId, garmentId, expectedSourceRevision, expectedTargetRevision }) => {
      const sourceId = canonicalUuidIntent(sourceCollectionId, 'sourceCollectionId');
      const targetId = canonicalUuidIntent(targetCollectionId, 'targetCollectionId');
      if (sourceId === targetId) throw new TypeError('sourceCollectionId and targetCollectionId must be different');
      const response = await request(
        `${PREFIX}/${encodeURIComponent(sourceId)}/move/${encodeURIComponent(targetId)}/garments/${encodeURIComponent(canonicalUuidIntent(garmentId, 'garmentId'))}`,
        Object.freeze({
          method: 'POST',
          headers: Object.freeze({
            [EXPECTED_SOURCE_REVISION_HEADER]: String(positiveSafeInteger(expectedSourceRevision, 'expectedSourceRevision')),
            [EXPECTED_TARGET_REVISION_HEADER]: String(positiveSafeInteger(expectedTargetRevision, 'expectedTargetRevision')),
          }),
        }),
      );
      return normalizeMove(response);
    },
  });
}

export function normalizeManagedGarmentCollectionDto(value) {
  return normalizeCollection(value);
}

function collectionPath(collectionId) {
  return `${PREFIX}/${encodeURIComponent(canonicalUuidIntent(collectionId, 'collectionId'))}`;
}

function membershipPath(collectionId, garmentId) {
  return `${collectionPath(collectionId)}/garments/${encodeURIComponent(canonicalUuidIntent(garmentId, 'garmentId'))}`;
}

function createBody(input) {
  assertPlainObject(input, 'Collection create');
  assertOnlyKeys(input, ['name','description'], 'Collection create');
  if (!Object.hasOwn(input, 'name')) throw new TypeError('Collection create requires name');
  return Object.freeze({
    name: canonicalName(input.name),
    ...(Object.hasOwn(input, 'description') ? { description: canonicalDescription(input.description) } : {}),
  });
}

function metadataPatch(input) {
  assertPlainObject(input, 'Collection metadata patch');
  assertOnlyKeys(input, ['name','description'], 'Collection metadata patch');
  const patch = {
    ...(Object.hasOwn(input, 'name') ? { name: canonicalName(input.name) } : {}),
    ...(Object.hasOwn(input, 'description') ? { description: canonicalDescription(input.description) } : {}),
  };
  if (Object.keys(patch).length === 0) throw new TypeError('Collection metadata patch must change at least one field');
  return Object.freeze(patch);
}

function normalizeList(value) {
  if (!Array.isArray(value)) throw new TypeError('Managed Garment Collection list response must be an array');
  return Object.freeze(value.map(normalizeCollection));
}

function normalizeCollection(value) {
  assertPlainObject(value, 'Managed Garment Collection response');
  assertExactKeys(value, ['id','name','description','revision','garment_ids','created_at','updated_at'], 'Managed Garment Collection response');
  if (!Array.isArray(value.garment_ids)) throw new TypeError('garment_ids must be an array');
  const garmentIds = value.garment_ids.map((id, index) => canonicalUuidResponse(id, `garment_ids[${index}]`));
  if (new Set(garmentIds).size !== garmentIds.length) throw new TypeError('garment_ids must not contain duplicates');
  return Object.freeze({
    id: canonicalUuidResponse(value.id, 'id'),
    name: canonicalResponseName(value.name),
    description: canonicalResponseDescription(value.description),
    revision: positiveSafeInteger(value.revision, 'revision'),
    garmentIds: Object.freeze(garmentIds),
    createdAt: canonicalTimestamp(value.created_at, 'created_at'),
    updatedAt: canonicalTimestamp(value.updated_at, 'updated_at'),
  });
}

function normalizeMove(value) {
  assertPlainObject(value, 'Managed Garment Collection move response');
  assertExactKeys(value, ['source','target','target_changed'], 'Managed Garment Collection move response');
  return Object.freeze({
    source: normalizeCollection(value.source),
    target: normalizeCollection(value.target),
    targetChanged: booleanValue(value.target_changed, 'target_changed'),
  });
}

function canonicalName(value) {
  if (typeof value !== 'string') throw new TypeError('name must be a string');
  const normalized = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (!normalized || Array.from(normalized).length > 100 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new TypeError('name must contain 1 to 100 printable characters');
  }
  return normalized;
}

function canonicalDescription(value) {
  if (typeof value !== 'string') throw new TypeError('description must be a string');
  const normalized = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (Array.from(normalized).length > 500 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new TypeError('description must contain at most 500 printable characters');
  }
  return normalized;
}

function canonicalResponseName(value) {
  if (typeof value !== 'string' || canonicalName(value) !== value) throw new TypeError('Managed Garment Collection response name is not canonical');
  return value;
}

function canonicalResponseDescription(value) {
  if (typeof value !== 'string' || canonicalDescription(value) !== value) throw new TypeError('Managed Garment Collection response description is not canonical');
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

function positiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${label} must be a positive safe integer`);
  return value;
}

function booleanValue(value, label) {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be boolean`);
  return value;
}

function canonicalTimestamp(value, label) {
  if (typeof value !== 'string') throw new TypeError(`${label} must be an ISO timestamp`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) throw new TypeError(`${label} must be a canonical ISO timestamp`);
  return value;
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
