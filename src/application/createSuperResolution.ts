import { coreClient } from '../api/coreClient';
import { browserLocalAIComposition } from './local-ai/BrowserLocalAIComposition';
import {
  CoreAuthorizedSuperResolution,
  type CoreSuperResolutionClient,
  type LocalSuperResolutionInputPort,
  type LocalSuperResolutionModelPort,
} from './local-execution/CoreAuthorizedSuperResolution';
import { REAL_ESRGAN_UPSCALE_CAPABILITY } from '../platform/creative/super-resolution/SuperResolutionContract';
import type { ExecutionProvider, InferenceResult } from '../platform/creative/local-ai/types';

/**
 * Browser composition for C3 model-backed x4 super-resolution.
 *
 * Core owns the exact v2 MODEL binding and canonical source identity. Source bytes are
 * delivered only through that ticket. The default model port is a read-only facade over
 * the trusted durable LocalAI fleet; it cannot install, select or promote a model.
 * With the current CANDIDATE/EXPORT_REQUIRED release, production Core blocks prepare
 * before this model facade can initialize or download anything.
 */
export function createSuperResolution({
  projectId,
  client = coreClient,
  model = trustedBrowserSuperResolutionModel(),
}: Readonly<{
  projectId: string;
  client?: typeof coreClient;
  model?: LocalSuperResolutionModelPort;
}>) {
  if (!projectId?.trim()) throw new Error('Canonical project identity is required for super-resolution');
  let activeTicketId: string | undefined;
  let currentSourceArtifactId = '';
  let delivered: Promise<Awaited<ReturnType<typeof client.localExecution.loadSuperResolutionInput>>> | undefined;

  const loadDelivered = () => {
    if (!activeTicketId) throw new Error('Super-resolution source requires a prepared Core ticket');
    return delivered ??= client.localExecution.loadSuperResolutionInput({ ticketId: activeTicketId, projectId });
  };
  const assertSource = (artifactId: string) => {
    if (!currentSourceArtifactId || artifactId !== currentSourceArtifactId) throw new Error('Super-resolution source identity does not match the active request');
  };

  const core: CoreSuperResolutionClient = Object.freeze({
    prepareSuperResolution: async payload => {
      const prepared = await client.localExecution.prepareSuperResolution(payload);
      activeTicketId = prepared.ticket.ticketId;
      delivered = undefined;
      return prepared;
    },
    uploadImage: ({ ticketId, projectId: scopedProjectId, bytes }) => client.localExecution.uploadSuperResolutionImage({ ticketId, projectId: scopedProjectId, bytes }),
    submitSuperResolution: ({ ticketId, projectId: scopedProjectId, result }) => client.localExecution.submitSuperResolution({ ticketId, projectId: scopedProjectId, result }),
  });

  const inputs: LocalSuperResolutionInputPort = Object.freeze({
    loadImage: async artifactId => {
      assertSource(artifactId);
      const value = await loadDelivered();
      return Object.freeze({
        width: value.width,
        height: value.height,
        data: new Uint8ClampedArray(value.sourceRgba),
        format: 'RGBA8',
        orientation: 1 as const,
        colorSpace: 'srgb',
      });
    },
    sha256: async artifactId => {
      assertSource(artifactId);
      return (await loadDelivered()).sourceSha256;
    },
  });

  const adapter = new CoreAuthorizedSuperResolution(projectId, core, inputs, model);
  return Object.freeze({
    run: async (input: Readonly<{ requestId: string; sourceArtifactId: string }>) => {
      if (!input.requestId?.trim() || !input.sourceArtifactId?.trim()) throw new Error('Super-resolution requires canonical request and source identities');
      if (activeTicketId) throw new Error('Super-resolution composition already has an active request');
      currentSourceArtifactId = input.sourceArtifactId;
      try { return await adapter.run(input); }
      finally { activeTicketId = undefined; delivered = undefined; currentSourceArtifactId = ''; }
    },
  });
}

function trustedBrowserSuperResolutionModel(): LocalSuperResolutionModelPort {
  return Object.freeze({
    async infer(input) {
      const composition = await browserLocalAIComposition.get();
      const inference = await composition.modelExecution.infer({
        model: input.model,
        capability: REAL_ESRGAN_UPSCALE_CAPABILITY,
        request: Object.freeze({
          requestId: input.requestId,
          inputs: Object.freeze({
            input_rgb: Object.freeze({ data: input.rgbNchw, dims: Object.freeze([1, 3, input.height, input.width]), type: 'float32' }),
          }),
          outputNames: Object.freeze(['output_rgb']),
        }),
      });
      return modelRun(inference, input.width, input.height);
    },
  });
}

function modelRun(inference: InferenceResult, inputWidth: number, inputHeight: number) {
  const output = inference.outputs.output_rgb;
  const expectedDims = [1, 3, inputHeight * 4, inputWidth * 4];
  if (!output || output.type && output.type !== 'float32' || output.dims.length !== 4 || output.dims.some((value, index) => Number(value) !== expectedDims[index])) throw new Error('Trusted super-resolution runtime returned an invalid output tensor contract');
  const data = output.data instanceof Float32Array ? output.data : Float32Array.from(output.data);
  if (data.length !== expectedDims[1] * expectedDims[2] * expectedDims[3]) throw new Error('Trusted super-resolution runtime returned an invalid output tensor length');
  return Object.freeze({
    width: expectedDims[3],
    height: expectedDims[2],
    data,
    runtime: browserRuntime(inference.provider),
    accelerator: inference.provider,
    latencyMs: inference.latencyMs,
    memoryBytes: inference.memoryBytes,
    benchmarkEvidence: Object.freeze({ localAIModelId: inference.modelId, executionProvider: inference.provider }),
  });
}

function browserRuntime(provider: ExecutionProvider): 'WASM' | 'WEBGPU' {
  if (provider === 'wasm') return 'WASM';
  if (provider === 'webgpu') return 'WEBGPU';
  throw new Error(`Unsupported browser model execution provider for super-resolution: ${provider}`);
}
