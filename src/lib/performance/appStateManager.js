class AppStateManager {
  constructor() { this.listeners = new Set(); this.state = document.visibilityState; document.addEventListener('visibilitychange', () => { this.state = document.visibilityState; this.listeners.forEach((listener) => listener(this.state)); }); }
  subscribe(listener) { this.listeners.add(listener); listener(this.state); return () => this.listeners.delete(listener); }
  snapshot() { return this.state; }
}
export const appStateManager = new AppStateManager();