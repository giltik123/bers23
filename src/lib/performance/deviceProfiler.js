class DeviceProfiler {
  constructor() { this.profile = this.detect(); }
  detect() {
    const ram = navigator.deviceMemory || 4; const cpu = navigator.hardwareConcurrency || 4;
    const pixels = window.screen.width * window.screen.height * (window.devicePixelRatio || 1) ** 2;
    const gpu = this.gpuClass(); const low = ram <= 4 || cpu <= 4 || pixels > 6000000;
    return { ramGb: ram, cpuCores: cpu, gpu, screenPixels: pixels, tier: low ? 'battery-saver' : 'balanced', previewQuality: low ? 'medium' : 'high', parallelJobs: low ? 1 : 2, cacheMb: low ? 96 : 192 };
  }
  gpuClass() { try { const gl = document.createElement('canvas').getContext('webgl'); return gl ? 'supported' : 'basic'; } catch { return 'basic'; } }
  refresh() { this.profile = this.detect(); return this.profile; }
  snapshot() { return { ...this.profile }; }
}
export const deviceProfiler = new DeviceProfiler();