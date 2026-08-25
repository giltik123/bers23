import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from '../../../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url';
import wasmModuleUrl from '../../../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url';
import type { OnnxSession, OnnxSessionFactory, TensorValue } from '../types';

// Never fall back to ORT's CDN. Vite fingerprints and emits these runtime assets.
ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: wasmModuleUrl };

// CSP/Trusted Types compatibility is fail-closed: ORT's pthread/proxy paths create Workers.
// Keep the production browser runtime worker-free unless a separately reviewed worker policy is introduced.
export const BROWSER_WASM_NUM_THREADS = 1;
export const BROWSER_WASM_PROXY = false;
export const BROWSER_WASM_WORKER_POLICY = 'DISABLED_PENDING_SEPARATE_SECURITY_REVIEW' as const;
ort.env.wasm.numThreads = BROWSER_WASM_NUM_THREADS;
ort.env.wasm.proxy = BROWSER_WASM_PROXY;

export const ONNX_RUNTIME_WEB_VERSION = '1.27.0';
export type BrowserOrtFormatMemoryMode = 'DEFAULT' | 'MEMORY_FIRST';
export const BROWSER_ORT_MEMORY_FIRST_SESSION_CONFIG = Object.freeze({
  load_model_format: 'ORT',
  use_ort_model_bytes_for_initializers: '1',
  disable_prepacking: '1',
} as const);

export class BrowserOnnxSessionFactory implements OnnxSessionFactory {
  async create(bytes: Uint8Array, options: Readonly<{ executionProviders: readonly ('wasm' | 'webgpu' | 'cuda' | 'dml' | 'coreml' | 'cpu' | 'nnapi')[] }>): Promise<OnnxSession> {
    if (options.executionProviders.some(provider => provider !== 'wasm')) throw new Error('Browser acceptance runtime only permits the WASM execution provider');
    return this.#create(bytes, { executionProviders: ['wasm'] });
  }

  /** D4 research surface: same local worker-free WASM runtime, explicitly loading ORT-format bytes. */
  async createOrtFormat(bytes: Uint8Array, mode: BrowserOrtFormatMemoryMode): Promise<OnnxSession> {
    const sessionConfig = mode === 'MEMORY_FIRST'
      ? BROWSER_ORT_MEMORY_FIRST_SESSION_CONFIG
      : Object.freeze({ load_model_format: 'ORT' as const });
    return this.#create(bytes, {
      executionProviders: ['wasm'],
      extra: { session: sessionConfig },
    });
  }

  async #create(bytes: Uint8Array, sessionOptions: ort.InferenceSession.SessionOptions): Promise<OnnxSession> {
    const session = await ort.InferenceSession.create(bytes, sessionOptions);
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
