// PipelineEvents — lets the UI observe pipeline progress without coupling to the pipeline internals.
class PipelineEvents {
  constructor() { this.listeners = new Set(); this.state = { status: 'idle', stage: null, run: null }; }

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

export const pipelineEvents = new PipelineEvents();