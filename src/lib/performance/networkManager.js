class NetworkManager {
  constructor() { this.listeners = new Set(); this.state = this.read(); window.addEventListener('online', () => this.update()); window.addEventListener('offline', () => this.update()); }
  read() { const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection; return { online: navigator.onLine, slow: ['slow-2g', '2g'].includes(connection?.effectiveType), metered: Boolean(connection?.saveData), effectiveType: connection?.effectiveType || 'unknown' }; }
  update() { this.state = this.read(); this.listeners.forEach((listener) => listener(this.snapshot())); }
  subscribe(listener) { this.listeners.add(listener); listener(this.snapshot()); return () => this.listeners.delete(listener); }
  snapshot() { return { ...this.state }; }
}
export const networkManager = new NetworkManager();