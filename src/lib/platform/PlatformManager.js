import { useEffect, useState } from 'react';
import { createDeviceProfile } from '@/lib/platform/DeviceProfile';

class PlatformManager {
  constructor() { this.profile = createDeviceProfile(); this.listeners = new Set(); this.update = this.update.bind(this); window.addEventListener('resize', this.update, { passive: true }); window.addEventListener('orientationchange', this.update, { passive: true }); }
  update() { const next = createDeviceProfile(); if (JSON.stringify(next) === JSON.stringify(this.profile)) return; this.profile = next; this.listeners.forEach((listener) => listener(next)); }
  subscribe(listener) { this.listeners.add(listener); listener(this.profile); return () => this.listeners.delete(listener); }
  snapshot() { return this.profile; }
}
export const platformManager = new PlatformManager();
export function usePlatformProfile() { const [profile, setProfile] = useState(platformManager.snapshot()); useEffect(() => platformManager.subscribe(setProfile), []); return profile; }