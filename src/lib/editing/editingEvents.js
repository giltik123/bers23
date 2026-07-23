// EditingEvents — UI-observable generation state, decoupled from engine internals.
export const EDITING_STAGES = {
  preparing: { label: 'Preparing image', pct: 10 },
  compiling: { label: 'Compiling prompt', pct: 20 },
  generating: { label: 'Generating', pct: 45 },
  validating: { label: 'Validating result', pct: 75 },
  composing: { label: 'Composing final image', pct: 88 },
  finalizing: { label: 'Finalizing', pct: 96 },
};

class EditingEvents {
  constructor() {
    this.listeners = new Set();
    this.state = { status: 'idle', stage: null, provider: null, etaMs: null, error: null };
  }

  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  emit(partial) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((fn) => fn(this.state));
  }
}

export const editingEvents = new EditingEvents();