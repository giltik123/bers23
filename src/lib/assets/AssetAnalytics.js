import { coreClient } from '@/api/coreClient';
const KEY = 'asset_library_analytics_v1';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { events: [] }; } catch { return { events: [] }; } };
export const assetAnalytics = { track(eventName, properties = {}) { const state = read(); state.events = [{ eventName, properties, at: Date.now() }, ...state.events].slice(0, 300); localStorage.setItem(KEY, JSON.stringify(state)); coreClient.analytics.track({ eventName: `asset_${eventName}`, properties }); }, summary() { return read().events; } };