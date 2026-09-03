export function createCanonicalCollectionViewModel({ collections }) {
  if (!collections
    || typeof collections.list !== 'function'
    || typeof collections.create !== 'function'
    || typeof collections.updateMetadata !== 'function'
    || typeof collections.remove !== 'function'
    || typeof collections.addGarment !== 'function'
    || typeof collections.removeGarment !== 'function'
    || typeof collections.moveGarment !== 'function') {
    throw new TypeError('Canonical collection view model requires the Managed Garment Collection client');
  }

  return Object.freeze({
    async load() {
      return sortCollections(await collections.list());
    },
    async create(input) {
      const name = requiredString(input?.name, 'name');
      const description = typeof input?.description === 'string' ? input.description : '';
      return collections.create({ name, description });
    },
    async rename(collection, name) {
      const current = collectionIntent(collection);
      return collections.updateMetadata(current.id, current.revision, { name: requiredString(name, 'name') });
    },
    async setDescription(collection, description) {
      const current = collectionIntent(collection);
      if (typeof description !== 'string') throw new TypeError('description must be a string');
      return collections.updateMetadata(current.id, current.revision, { description });
    },
    async remove(collection) {
      const current = collectionIntent(collection);
      await collections.remove(current.id, current.revision);
      return current.id;
    },
    async addGarment(collection, garmentId) {
      const current = collectionIntent(collection);
      return collections.addGarment(current.id, current.revision, requiredId(garmentId, 'garmentId'));
    },
    async removeGarment(collection, garmentId) {
      const current = collectionIntent(collection);
      return collections.removeGarment(current.id, current.revision, requiredId(garmentId, 'garmentId'));
    },
    async moveGarment(sourceCollection, targetCollection, garmentId) {
      const source = collectionIntent(sourceCollection);
      const target = collectionIntent(targetCollection);
      if (source.id === target.id) throw new TypeError('source and target collections must be different');
      return collections.moveGarment({
        sourceCollectionId: source.id,
        targetCollectionId: target.id,
        garmentId: requiredId(garmentId, 'garmentId'),
        expectedSourceRevision: source.revision,
        expectedTargetRevision: target.revision,
      });
    },
  });
}

export function sortCollections(values) {
  if (!Array.isArray(values)) throw new TypeError('Managed Garment Collection client must return an array');
  return Object.freeze([...values].sort(
    (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)) || String(a.id).localeCompare(String(b.id)),
  ));
}

function collectionIntent(value) {
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !Number.isSafeInteger(value.revision) || value.revision < 1) {
    throw new TypeError('Collection action requires a canonical collection snapshot');
  }
  return Object.freeze({ id: value.id, revision: value.revision });
}

function requiredString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} is required`);
  return value;
}

function requiredId(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} is required`);
  return value;
}
