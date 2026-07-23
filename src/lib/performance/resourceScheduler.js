import { memoryManager } from '@/lib/performance/memoryManager';

class ResourceScheduler {
  constructor() { this.listeners = new Set(); this.state = { paused: false, reason: null }; window.setInterval(() => this.evaluate(), 5000); navigator.getBattery?.().then((battery) => { const update = () => this.evaluate(battery); battery.addEventListener('levelchange', update); battery.addEventListener('chargingchange', update); update(); }); }
  evaluate(battery = null) { const lowBattery = battery && !battery.charging && battery.level <= 0.15; const memory = memoryManager.usageMb(); const pressure = memory && memory > memoryManager.limitMb * 2; this.state = { paused: Boolean(lowBattery || pressure), reason: lowBattery ? 'battery' : pressure ? 'memory' : null }; this.listeners.forEach((listener) => listener(this.snapshot())); }
  subscribe(listener) { this.listeners.add(listener); listener(this.snapshot()); return () => this.listeners.delete(listener); }
  snapshot() { return { ...this.state }; }
}
export const resourceScheduler = new ResourceScheduler();