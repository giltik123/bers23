// TryOnEvents — progress event bus for the Virtual Try-On chain.
class TryOnEvents {
  constructor() { this.listeners = new Set(); this.state = { status: 'idle', stage: null, step: 0, totalSteps: 0, label: '', error: null }; }
  subscribe(fn) { this.listeners.add(fn); fn({ ...this.state }); return () => this.listeners.delete(fn); }
  emit(patch) { this.state = { ...this.state, ...patch }; const s = { ...this.state }; this.listeners.forEach((fn) => fn(s)); }
}

export const tryonEvents = new TryOnEvents();