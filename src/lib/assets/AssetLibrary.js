import { assetManager } from '@/lib/assets/AssetManager';
import { assetIndexer } from '@/lib/assets/AssetIndexer';
import { assetSearch } from '@/lib/assets/AssetSearch';
import { recipeManager } from '@/lib/recipes/recipeManager';
import { creativeHistory } from '@/lib/creative/CreativeHistory';

export const assetLibrary = {
  list() { return assetManager.list(); },
  search(assets, filters) { return assetSearch.query(assets, filters); },
  async index({ projects = [], garments = [], outfits = [] }) { await Promise.all([...projects.map((project) => assetIndexer.project(project)), ...garments.map((garment) => assetIndexer.garment(garment)), ...outfits.map((outfit) => assetIndexer.outfit(outfit)), ...recipeManager.all().map((recipe) => assetIndexer.recipe(recipe)), ...creativeHistory.list().map((strategy) => assetManager.upsert({ asset_key: `strategy:${strategy.id}`, type: 'creative_strategy', name: strategy.name, tags: [strategy.goalId, 'creative strategy'], metadata: { estimatedCredits: strategy.estimatedCredits, executionOrder: strategy.executionOrder } }))]); return this.list(); },
};