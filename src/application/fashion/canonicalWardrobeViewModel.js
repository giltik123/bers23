export class CanonicalWardrobeSnapshotError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CanonicalWardrobeSnapshotError';
    this.code = 'WARDROBE_SNAPSHOT_MISMATCH';
    this.retryable = true;
  }
}

export class CanonicalWardrobePartialCreateError extends Error {
  constructor(garmentId, cause) {
    super('Garment image was saved, but canonical wardrobe metadata did not finish updating. Reload the wardrobe before retrying metadata.');
    this.name = 'CanonicalWardrobePartialCreateError';
    this.code = 'GARMENT_CREATED_METADATA_PENDING';
    this.garmentId = garmentId;
    this.retryable = true;
    this.cause = cause;
  }
}

export function createCanonicalWardrobeViewModel({ garments, wardrobe }) {
  if (!garments || typeof garments.list !== 'function' || typeof garments.get !== 'function' || typeof garments.create !== 'function') {
    throw new TypeError('Canonical wardrobe view model requires the Managed Garment client');
  }
  if (!wardrobe || typeof wardrobe.list !== 'function' || typeof wardrobe.get !== 'function' || typeof wardrobe.updateMetadata !== 'function') {
    throw new TypeError('Canonical wardrobe view model requires the Managed Wardrobe client');
  }

  const load = async () => {
    let mismatch;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const [imageAggregates, metadataAggregates] = await Promise.all([garments.list(), wardrobe.list()]);
        return reconcileLists(imageAggregates, metadataAggregates);
      } catch (error) {
        if (!(error instanceof CanonicalWardrobeSnapshotError) || attempt === 1) throw error;
        mismatch = error;
      }
    }
    throw mismatch;
  };

  const reloadOne = async (garmentId, expectedMetadata = undefined) => {
    let suppliedMetadata = expectedMetadata;
    let mismatch;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const [imageAggregate, metadataAggregate] = await Promise.all([
          garments.get(garmentId),
          suppliedMetadata ? Promise.resolve(suppliedMetadata) : wardrobe.get(garmentId),
        ]);
        return reconcilePair(imageAggregate, metadataAggregate);
      } catch (error) {
        if (!(error instanceof CanonicalWardrobeSnapshotError) || attempt === 1) throw error;
        mismatch = error;
        suppliedMetadata = undefined;
      }
    }
    throw mismatch;
  };

  return Object.freeze({
    load,
    async create(input) {
      const name = requiredString(input?.name, 'name');
      const image = input?.image;
      const viewKind = input?.viewKind ?? 'UNSPECIFIED';
      const created = await garments.create({ name, image, viewKind });
      const patch = metadataPatch(input);
      if (Object.keys(patch).length === 0) return reloadOne(created.id);
      let metadata;
      try {
        metadata = await wardrobe.updateMetadata(created.id, created.revision, patch);
      } catch (cause) {
        throw new CanonicalWardrobePartialCreateError(created.id, cause);
      }
      return reloadOne(created.id, metadata);
    },
    async appendView(item, input) {
      if (typeof garments.appendView !== 'function') throw new TypeError('Managed Garment client does not expose appendView');
      const current = canonicalItemIntent(item);
      await garments.appendView({
        garmentId: current.id,
        expectedRevision: current.revision,
        viewKind: requiredString(input?.viewKind, 'viewKind'),
        image: input?.image,
      });
      return reloadOne(current.id);
    },
    async setFavorite(item, favorite) {
      const current = canonicalItemIntent(item);
      const metadata = await wardrobe.updateMetadata(current.id, current.revision, { favorite: Boolean(favorite) });
      return reloadOne(current.id, metadata);
    },
    async archive(item) {
      const current = canonicalItemIntent(item);
      if (typeof wardrobe.archive !== 'function') throw new TypeError('Managed Wardrobe client does not expose archive');
      const metadata = await wardrobe.archive(current.id, current.revision);
      return reloadOne(current.id, metadata);
    },
    async restore(item) {
      const current = canonicalItemIntent(item);
      if (typeof wardrobe.restore !== 'function') throw new TypeError('Managed Wardrobe client does not expose restore');
      const metadata = await wardrobe.restore(current.id, current.revision);
      return reloadOne(current.id, metadata);
    },
  });
}

function reconcileLists(images, metadata) {
  if (!Array.isArray(images) || !Array.isArray(metadata)) throw new TypeError('Canonical wardrobe clients must return arrays');
  const imageById = uniqueById(images, 'Managed Garment');
  const metadataById = uniqueById(metadata.map(value => ({ ...value, id: value.garmentId })), 'Managed Wardrobe');
  if (imageById.size !== metadataById.size) throw new CanonicalWardrobeSnapshotError('Managed Garment and Wardrobe snapshots contain different garment sets');
  const items = [];
  for (const [id, image] of imageById) {
    const meta = metadataById.get(id);
    if (!meta) throw new CanonicalWardrobeSnapshotError('Managed Garment and Wardrobe snapshots contain different garment sets');
    items.push(reconcilePair(image, meta));
  }
  items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  return Object.freeze(items);
}

function reconcilePair(image, metadata) {
  if (!image || !metadata || image.id !== metadata.garmentId) throw new CanonicalWardrobeSnapshotError('Managed Garment and Wardrobe identities do not match');
  if (image.revision !== metadata.revision || image.name !== metadata.name || image.status !== metadata.status) {
    throw new CanonicalWardrobeSnapshotError('Managed Garment and Wardrobe revisions do not describe one coherent snapshot');
  }
  const primary = image.views?.find(view => view.id === image.primaryViewId);
  if (!primary) throw new TypeError('Managed Garment primary view is unavailable');
  return Object.freeze({
    id: image.id,
    name: image.name,
    revision: image.revision,
    status: image.status,
    representationTier: image.representationTier,
    category: metadata.category,
    categoryGroup: metadata.categoryGroup,
    season: metadata.season,
    material: metadata.material,
    tags: metadata.tags,
    favorite: metadata.favorite,
    imageUrl: primary.deliveryUrl,
    imageExpiresAt: primary.deliveryExpiresAt,
    primaryViewKind: primary.kind,
    viewCount: image.views.length,
    captureAssessment: image.captureAssessment,
    updatedAt: metadata.updatedAt,
  });
}

function metadataPatch(input) {
  const patch = {};
  if (input && Object.hasOwn(input, 'category')) patch.category = input.category;
  if (input && Object.hasOwn(input, 'season')) patch.season = input.season;
  if (input && Object.hasOwn(input, 'material')) patch.material = input.material;
  if (input && Object.hasOwn(input, 'tags')) patch.tags = input.tags;
  return Object.freeze(patch);
}

function canonicalItemIntent(item) {
  if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !Number.isSafeInteger(item.revision) || item.revision < 1) {
    throw new TypeError('Wardrobe action requires a canonical garment item');
  }
  return Object.freeze({ id: item.id, revision: item.revision });
}

function requiredString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} is required`);
  return value;
}

function uniqueById(values, label) {
  const result = new Map();
  for (const value of values) {
    if (!value || typeof value !== 'object' || typeof value.id !== 'string') throw new TypeError(`${label} response is missing identity`);
    if (result.has(value.id)) throw new TypeError(`${label} response contains duplicate identity`);
    result.set(value.id, value);
  }
  return result;
}
