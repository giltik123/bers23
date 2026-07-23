// OutfitAnalytics — learning layer: most used outfits, favorite styles, colors,
// occasions and recommendation acceptance rate. Stored locally.
const KEY = 'outfit_analytics_v1';
const EMPTY = { outfits: {}, styles: {}, colors: {}, occasions: {}, recsShown: 0, recsAccepted: 0 };

class OutfitAnalytics {
  read() {
    try { return { ...EMPTY, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch { return { ...EMPTY }; }
  }

  write(store) {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* best-effort */ }
  }

  track(event, data = {}) {
    const store = this.read();
    const bump = (map, key) => { if (key) map[key] = (map[key] || 0) + 1; };
    if (event === 'outfit_used') {
      bump(store.outfits, data.outfitId);
      bump(store.styles, data.style);
      bump(store.occasions, data.occasion);
      (data.colors || []).forEach((c) => bump(store.colors, c));
    } else if (event === 'favorite' || event === 'outfit_created') {
      bump(store.styles, data.style);
      bump(store.occasions, data.occasion);
      (data.colors || []).forEach((c) => bump(store.colors, c));
    } else if (event === 'recommendation_shown') {
      store.recsShown += data.count || 1;
    } else if (event === 'recommendation_accepted') {
      store.recsAccepted += 1;
    }
    this.write(store);
  }

  summary() {
    const store = this.read();
    const top = (obj, n = 3) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([id, count]) => ({ id, count }));
    return {
      mostUsedOutfitIds: top(store.outfits),
      favoriteStyles: top(store.styles),
      favoriteColors: top(store.colors),
      favoriteOccasions: top(store.occasions),
      recommendationAcceptance: store.recsShown ? Math.round((store.recsAccepted / store.recsShown) * 100) : 0,
    };
  }
}

export const outfitAnalytics = new OutfitAnalytics();