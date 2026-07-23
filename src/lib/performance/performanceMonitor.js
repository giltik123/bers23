class PerformanceMonitor {
  constructor() { this.frames = []; this.renderMarks = []; this.largeDecodes = 0; this.running = false; this.last = 0; this.frameId = null; }
  start() { if (this.running) return; this.running = true; const tick = (time) => { if (this.last && time - this.last > 34) this.frames.push(time - this.last); this.last = time; if (this.frames.length > 120) this.frames.shift(); if (this.running) this.frameId = requestAnimationFrame(tick); }; this.frameId = requestAnimationFrame(tick); }
  stop() { this.running = false; if (this.frameId) cancelAnimationFrame(this.frameId); this.frameId = null; }
  markRender(duration) { this.renderMarks.push(duration); if (this.renderMarks.length > 30) this.renderMarks.shift(); }
  markLargeDecode() { this.largeDecodes += 1; }
  snapshot() { return { averageRenderMs: this.renderMarks.length ? Math.round(this.renderMarks.reduce((sum, value) => sum + value, 0) / this.renderMarks.length) : 0, frameDrops: this.frames.length, largeImageDecodes: this.largeDecodes }; }
}
export const performanceMonitor = new PerformanceMonitor();