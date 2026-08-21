import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from '../../../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url';
import wasmModuleUrl from '../../../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url';
import type { OnnxSession, OnnxSessionFactory, TensorValue } from '../types';

// Never fall back to ORT's CDN. Vite fingerprints and emits this runtime asset.
ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: wasmModuleUrl };

export const ONNX_RUNTIME_WEB_VERSION = '1.27.0';

export class BrowserOnnxSessionFactory implements OnnxSessionFactory {
  async create(bytes: Uint8Array, options: Readonly<{ executionProviders: readonly ('wasm' | 'webgpu' | 'cuda' | 'dml' | 'coreml' | 'cpu' | 'nnapi')[] }>): Promise<OnnxSession> {
    if (options.executionProviders.some(provider => provider !== 'wasm')) throw new Error('Browser acceptance runtime only permits the WASM execution provider');
    const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
    const disposeOnnxSession = session.release.bind(session);
    return {
      async run(inputs: Readonly<Record<string, TensorValue>>, outputNames?: readonly string[]) {
        const feeds: Record<string, ort.Tensor> = {};
        for (const [name, value] of Object.entries(inputs)) feeds[name] = new ort.Tensor((value.type ?? 'float32') as ort.Tensor.Type, value.data as ort.Tensor.DataType, [...value.dims]);
        const results = await session.run(feeds, outputNames ? [...outputNames] : undefined);
        return Object.fromEntries(Object.entries(results).map(([name, value]) => { if (value.type === 'string') throw new Error('String tensors are not supported by the local inference contract'); return [name, { data: value.data as ArrayLike<number>, dims: value.dims, type: value.type }]; }));
      },
      release: disposeOnnxSession,
    };
  }
}
