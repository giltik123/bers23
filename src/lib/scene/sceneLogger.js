// SceneLogger — structured logging for scene memory operations (analysis, drift, cache).
class SceneLogger {
  constructor() { this.entries = []; }

  log(event, data = {}) {
    const entry = { event, ...data, at: new Date().toISOString() };
    this.entries.push(entry);
    if (this.entries.length > 200) this.entries.shift();
    console.debug('[SceneMemory]', event, data);
  }

  list() { return [...this.entries]; }
}

export const sceneLogger = new SceneLogger();