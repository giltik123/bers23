import { base44 } from '@/api/base44Client';
const KEY = 'creative_studio_analytics_v1';
const read = () => { try { const saved = JSON.parse(localStorage.getItem(KEY)); return saved?.events ? saved : { events: [] }; } catch { return { events: [] }; } };
export const creativeAnalytics = {
  track(eventName, properties = {}) { const state = read(); state.events = [{ eventName, properties, at: Date.now() }, ...state.events].slice(0, 300); localStorage.setItem(KEY, JSON.stringify(state)); base44.analytics.track({ eventName: `creative_${eventName}`, properties }); },
  summary() { const events = read().events; const count = (name) => events.filter((event) => event.eventName === name); const goals = count('strategy_applied').reduce((all, event) => ({ ...all, [event.properties.goal]: (all[event.properties.goal] || 0) + 1 }), {}); return { mostSelectedIdeas: count('idea_selected'), acceptanceRate: count('idea_selected').length ? count('strategy_applied').length / count('idea_selected').length : 0, favoriteStyles: count('style_favorited'), mostSuccessfulGoals: goals }; },
};