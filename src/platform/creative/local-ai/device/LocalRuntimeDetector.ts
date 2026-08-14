import { immutableClone } from '../immutable';
import type { RuntimeCapabilities, RuntimeKind, RuntimeProbe } from '../types';
export const RUNTIME_KINDS: readonly RuntimeKind[] = ['ONNX_RUNTIME', 'WEBGPU', 'WASM', 'NNAPI', 'DIRECTML', 'CUDA', 'METAL', 'VULKAN'];
export class LocalRuntimeDetector {
  constructor(private readonly probe: RuntimeProbe) {}
  async detect(): Promise<RuntimeCapabilities> {
    const values = await Promise.all(RUNTIME_KINDS.map(async (kind) => [kind, await this.probe.detect(kind)] as const));
    return immutableClone(Object.fromEntries(values)) as RuntimeCapabilities;
  }
}
