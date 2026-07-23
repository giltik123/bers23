const KEY = 'creative_studio_history_v1';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
export const creativeHistory = {
  list() { return read(); },
  save(strategy) { const next = [{ ...strategy, savedAt: new Date().toISOString() }, ...read().filter((item) => item.id !== strategy.id)].slice(0, 30); localStorage.setItem(KEY, JSON.stringify(next)); return next[0]; },
  favorite(strategy) { const next = read().map((item) => item.id === strategy.id ? { ...item, favorite: !item.favorite } : item); localStorage.setItem(KEY, JSON.stringify(next)); return next.find((item) => item.id === strategy.id); },
};