import { base44 } from '@/api/base44Client';
import { assetTags } from '@/lib/assets/AssetTags';

export const assetManager = {
  async list() { return base44.entities.Asset.list('-updated_date', 500); },
  async upsert(asset) { const existing = await base44.entities.Asset.filter({ asset_key: asset.asset_key }, '-updated_date', 1); const payload = { ...asset, tags: assetTags.normalize(asset.tags), search_index: [asset.name, asset.type, ...(asset.tags || []), JSON.stringify(asset.metadata || {})].join(' ').toLowerCase(), updated_at: new Date().toISOString() }; return existing[0] ? base44.entities.Asset.update(existing[0].id, payload) : base44.entities.Asset.create({ ...payload, created_at: asset.created_at || new Date().toISOString() }); },
  async setFavorite(asset, favorite) { return base44.entities.Asset.update(asset.id, { favorite }); },
  async setCollections(asset, collection_ids) { return base44.entities.Asset.update(asset.id, { collection_ids }); },
};