import { coreClient } from '@/api/coreClient';
import { assetTags } from '@/lib/assets/AssetTags';

export const assetManager = {
  async list() { return coreClient.entities.Asset.list('-updated_date', 500); },
  async upsert(asset) { const existing = await coreClient.entities.Asset.filter({ asset_key: asset.asset_key }, '-updated_date', 1); const payload = { ...asset, tags: assetTags.normalize(asset.tags), search_index: [asset.name, asset.type, ...(asset.tags || []), JSON.stringify(asset.metadata || {})].join(' ').toLowerCase(), updated_at: new Date().toISOString() }; return existing[0] ? coreClient.entities.Asset.update(existing[0].id, payload) : coreClient.entities.Asset.create({ ...payload, created_at: asset.created_at || new Date().toISOString() }); },
  async setFavorite(asset, favorite) { return coreClient.entities.Asset.update(asset.id, { favorite }); },
  async setCollections(asset, collection_ids) { return coreClient.entities.Asset.update(asset.id, { collection_ids }); },
};