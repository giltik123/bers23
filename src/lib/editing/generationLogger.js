import { hashString } from '@/lib/editing/generationCache';

// GenerationLogger — structured record of every editing run.
class GenerationLogger {
  constructor() { this.entries = []; }

  log({ runId, provider, prompt, objects = [], resolution, credits, durationMs, cached = false, error = null }) {
    const entry = {
      runId, timestamp: new Date().toISOString(),
      provider, prompt_hash: prompt ? hashString(prompt) : null,
      objects: objects.map((o) => o.label),
      resolution: resolution ? `${resolution.width}x${resolution.height}` : null,
      credits, duration_ms: durationMs, cached, error,
    };
    this.entries.unshift(entry);
    if (this.entries.length > 50) this.entries.pop();
    console.log('[EditingEngine]', entry);
    return entry;
  }

  getRecent(limit = 10) { return this.entries.slice(0, limit); }
}

export const generationLogger = new GenerationLogger();