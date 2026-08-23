import type { Availability, DeviceProvider, DeviceSignals, RuntimeKind, RuntimeProbe } from '../types';

type NavigatorExtensions = Navigator & Readonly<{
  deviceMemory?: number;
  connection?: Readonly<{ effectiveType?: string; saveData?: boolean }>;
  getBattery?: () => Promise<Readonly<{ charging: boolean; level: number }>>;
  gpu?: Readonly<{ requestAdapter: () => Promise<Readonly<{ info?: Readonly<Record<string, unknown>> }> | null> }>;
  ml?: unknown;
  userAgentData?: Readonly<{ getHighEntropyValues?: (hints: readonly string[]) => Promise<Readonly<Record<string, unknown>>> }>;
}>;

/** Browser hardware signals are best-effort only; unobservable values are omitted so DeviceAnalyzer emits UNKNOWN. */
export class BrowserDeviceProvider implements DeviceProvider {
  async signals(): Promise<DeviceSignals> {
    if (typeof navigator === 'undefined') return {};
    const nav = navigator as NavigatorExtensions;
    const [storageFreeBytes, battery, architecture, gpu] = await Promise.all([
      storageFree(nav), batteryState(nav), architectureOf(nav), gpuIdentity(nav),
    ]);
    const cpuCores = Number.isInteger(nav.hardwareConcurrency) && nav.hardwareConcurrency > 0 ? nav.hardwareConcurrency : undefined;
    const ramMb = typeof nav.deviceMemory === 'number' && Number.isFinite(nav.deviceMemory) && nav.deviceMemory > 0 ? nav.deviceMemory * 1024 : undefined;
    return Object.freeze({
      platform: 'BROWSER' as const,
      deviceClass: 'BROWSER' as const,
      cpuCores,
      ramMb,
      gpu,
      architecture,
      browser: typeof nav.userAgent === 'string' && nav.userAgent.length ? nav.userAgent : undefined,
      webgpu: nav.gpu ? true : false,
      wasm: typeof WebAssembly !== 'undefined',
      webnn: 'ml' in nav ? true : false,
      storageFreeBytes,
      batteryPercent: battery?.percent,
      powerState: battery?.power,
      network: networkState(nav),
    });
  }
}

/** Runtime probes report false only for browser capabilities that can actually be tested; native-only runtimes remain UNKNOWN. */
export class BrowserRuntimeProbe implements RuntimeProbe {
  async detect(capability: RuntimeKind): Promise<Availability> {
    if (typeof navigator === 'undefined') return 'UNKNOWN';
    const nav = navigator as NavigatorExtensions;
    if (capability === 'WASM') return typeof WebAssembly !== 'undefined';
    if (capability === 'WEBGPU') {
      if (!nav.gpu) return false;
      try { return Boolean(await nav.gpu.requestAdapter()); } catch { return false; }
    }
    if (capability === 'ONNX_RUNTIME') return typeof WebAssembly !== 'undefined';
    if (capability === 'NNAPI' || capability === 'DIRECTML' || capability === 'CUDA' || capability === 'METAL' || capability === 'VULKAN') return 'UNKNOWN';
    return 'UNKNOWN';
  }
}

async function storageFree(nav: NavigatorExtensions): Promise<number | undefined> {
  try {
    const estimate = await nav.storage?.estimate?.();
    if (typeof estimate?.quota !== 'number') return undefined;
    const usage = typeof estimate.usage === 'number' ? estimate.usage : 0;
    return Math.max(0, estimate.quota - usage);
  } catch { return undefined; }
}
async function batteryState(nav: NavigatorExtensions): Promise<Readonly<{ percent: number; power: 'CHARGING' | 'BATTERY' | 'FULL' }> | undefined> {
  if (!nav.getBattery) return undefined;
  try {
    const battery = await nav.getBattery();
    const percent = Math.max(0, Math.min(100, Math.round(battery.level * 100)));
    return Object.freeze({ percent, power: battery.charging ? (percent >= 99 ? 'FULL' : 'CHARGING') : 'BATTERY' });
  } catch { return undefined; }
}
async function architectureOf(nav: NavigatorExtensions): Promise<string | undefined> {
  try {
    const data = await nav.userAgentData?.getHighEntropyValues?.(['architecture']);
    const architecture = data?.architecture;
    return typeof architecture === 'string' && architecture.length ? architecture : undefined;
  } catch { return undefined; }
}
async function gpuIdentity(nav: NavigatorExtensions): Promise<string | undefined> {
  if (!nav.gpu) return undefined;
  try {
    const adapter = await nav.gpu.requestAdapter();
    const info = adapter?.info;
    if (!info) return undefined;
    const parts = ['vendor', 'architecture', 'device', 'description'].map(key => info[key]).filter(value => typeof value === 'string' && value.length) as string[];
    return parts.length ? parts.join(' / ') : undefined;
  } catch { return undefined; }
}
function networkState(nav: NavigatorExtensions): DeviceSignals['network'] {
  if (nav.onLine === false) return 'OFFLINE';
  if (nav.connection?.saveData) return 'METERED';
  if (nav.connection?.effectiveType === 'slow-2g' || nav.connection?.effectiveType === '2g') return 'SLOW';
  return nav.onLine === true ? 'ONLINE' : undefined;
}
