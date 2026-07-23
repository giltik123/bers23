import { garmentManager } from '@/lib/fashion/garmentManager';
import { garmentCollections } from '@/lib/fashion/garmentCollections';
import { wardrobeLibrary } from '@/lib/fashion/wardrobeLibrary';
import { garmentSearch } from '@/lib/fashion/garmentSearch';

// WardrobeManager — facade over the Fashion Core: loads garments + collections,
// caches them and notifies subscribers. The UI talks to this, not to entities.
class WardrobeManager {
  constructor() {
    this.state = { garments: [], collections: [], loading: false, loaded: false };
    this.listeners = new Set();
  }

  subscribe(fn) { this.listeners.add(fn); fn({ ...this.state }); return () => this.listeners.delete(fn); }
  emit() { const s = { ...this.state }; this.listeners.forEach((fn) => fn(s)); }
  setState(patch) { this.state = { ...this.state, ...patch }; this.emit(); }

  async refresh() {
    this.setState({ loading: true });
    const [garments, collections] = await Promise.all([garmentManager.list(), garmentCollections.list()]);
    this.setState({ garments, collections, loading: false, loaded: true });
  }

  async ensure() {
    if (!this.state.loaded && !this.state.loading) await this.refresh();
  }

  // View + search resolution in one place: library shelf → filters → results.
  resolve({ view = 'personal', filters = {} }) {
    const shelf = wardrobeLibrary.filter(this.state.garments, view);
    return garmentSearch.search(shelf, filters);
  }
}

export const wardrobeManager = new WardrobeManager();