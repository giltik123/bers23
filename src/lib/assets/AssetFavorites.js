import { assetManager } from '@/lib/assets/AssetManager';
import { assetAnalytics } from '@/lib/assets/AssetAnalytics';
export const assetFavorites = { async toggle(asset) { const updated = await assetManager.setFavorite(asset, !asset.favorite); assetAnalytics.track('favorite_toggled', { type: asset.type }); return updated; } };