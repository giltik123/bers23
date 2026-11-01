const ASSET_TYPE_KEYS = Object.freeze({
  project: 'project',
  original: 'original',
  final: 'final',
  mask: 'mask',
  image: 'image',
  garment: 'garment',
  outfit: 'outfit',
  collection: 'collection',
});

const SYSTEM_TAG_KEYS = Object.freeze({
  project: 'project',
  'canonical artifact': 'canonicalArtifact',
  original: 'original',
  final: 'final',
  mask: 'mask',
});

export function assetTypeLabel(type, t) {
  const value = typeof type === 'string' ? type : '';
  const key = ASSET_TYPE_KEYS[value.toLowerCase()];
  return key ? t(`assets.types.${key}`) : value.replaceAll('_', ' ');
}

export function assetTagLabel(tag, t) {
  if (typeof tag !== 'string') return tag;
  const key = SYSTEM_TAG_KEYS[tag.trim().toLowerCase()];
  return key ? t(`assets.tags.${key}`) : tag;
}
