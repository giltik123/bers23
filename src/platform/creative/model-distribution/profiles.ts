import type { BundleProfile, DeviceClassLabel } from './types';
import type { DeviceCapabilityProfile } from '../local-ai/types';

export const PROFILE_CAPABILITIES: Readonly<Record<BundleProfile, readonly string[]>> = Object.freeze({
  MINIMAL: Object.freeze(['analysis', 'segmentation', 'upscale']),
  BALANCED: Object.freeze(['analysis', 'segmentation', 'upscale', 'ocr', 'reasoning']),
  CREATOR: Object.freeze(['analysis', 'segmentation', 'upscale', 'ocr', 'reasoning', 'enhancement']),
  PRIVACY_FIRST: Object.freeze(['analysis', 'segmentation', 'upscale', 'ocr', 'reasoning', 'enhancement']),
  OFFLINE: Object.freeze(['analysis', 'segmentation', 'upscale', 'ocr']),
});

export function classifyDevice(device: DeviceCapabilityProfile): DeviceClassLabel {
  const ram = device.ramMb === 'UNKNOWN' ? 0 : device.ramMb; const vram = device.vramMb === 'UNKNOWN' ? 0 : device.vramMb;
  if (device.deviceClass === 'BROWSER') { if (device.webgpu !== true) return 'BROWSER_WASM_ONLY'; if (ram >= 16_000) return 'BROWSER_WEBGPU_HIGH'; if (ram >= 8_000) return 'BROWSER_WEBGPU_MID'; return 'BROWSER_WEBGPU_LOW'; }
  if (device.platform === 'ANDROID') { if (ram >= 12_000 && vram >= 4_000) return 'ANDROID_FLAGSHIP'; if (ram >= 8_000) return 'ANDROID_HIGH'; if (ram >= 4_000) return 'ANDROID_MID'; return 'ANDROID_LOW'; }
  if (vram >= 12_000) return 'DESKTOP_HIGH_GPU'; if (vram >= 6_000) return 'DESKTOP_MID_GPU'; if (vram > 0 || device.metal === true) return 'DESKTOP_INTEGRATED_GPU'; return 'DESKTOP_CPU';
}

export const DETERMINISTIC_DEVICE_PROFILES = Object.freeze({
  pixelFlagship: { platform: 'ANDROID', deviceClass: 'MOBILE', ramMb: 12_288, vramMb: 4096, webgpu: false, wasm: true, tier: 'EXTREME' },
  androidMid: { platform: 'ANDROID', deviceClass: 'MOBILE', ramMb: 6144, vramMb: 1024, webgpu: false, wasm: true, tier: 'MEDIUM' },
  rtxDesktop: { platform: 'WINDOWS', deviceClass: 'DESKTOP', ramMb: 32_768, vramMb: 12_288, cuda: true, tier: 'EXTREME' },
  macGpu: { platform: 'MACOS', deviceClass: 'DESKTOP', ramMb: 16_384, vramMb: 8192, metal: true, tier: 'HIGH' },
  browserWebGpuHigh: { platform: 'BROWSER', deviceClass: 'BROWSER', ramMb: 16_384, vramMb: 4096, webgpu: true, wasm: true, tier: 'HIGH' },
  browserWasmOnly: { platform: 'BROWSER', deviceClass: 'BROWSER', ramMb: 4096, vramMb: 0, webgpu: false, wasm: true, tier: 'LOW' },
} as const);
