import { pipelineClamp, pipelineDeepFreeze } from './PipelineImmutable';
import type { ImageState, PipelineDependencies, PipelineScope } from './ImagePipelineTypes';

export interface LocalOperationInput {
  readonly width?: number;
  readonly height?: number;
  readonly format?: ImageState['format'];
  readonly alpha?: boolean;
  readonly qualityDelta?: number;
  readonly sizeFactor?: number;
}

export class LocalOperationLibrary {
  private readonly operations = pipelineDeepFreeze([
    'resize', 'crop', 'rotate', 'flip', 'color balance', 'brightness', 'contrast',
    'saturation', 'sharpen', 'blur', 'mask merge', 'layer blend', 'alpha merge',
    'jpeg encode', 'png encode', 'webp encode',
  ]);

  constructor(private readonly dependencies: PipelineDependencies) {}

  names(): readonly string[] { return this.operations; }
  supports(operation: string): boolean { return this.operations.includes(operation.trim().toLowerCase()); }

  create(scope: PipelineScope, input: Omit<ImageState, 'id' | 'scope' | 'generation' | 'createdAt'>): ImageState {
    return pipelineDeepFreeze({ ...input, id: this.dependencies.id(), scope: { ...scope }, metadata: { ...input.metadata }, generation: 1, createdAt: this.dependencies.now() });
  }

  apply(operation: string, state: ImageState, input: LocalOperationInput = {}): ImageState {
    if (!this.supports(operation)) throw new Error(`Unsupported local operation: ${operation}`);
    const normalized = operation.trim().toLowerCase();
    const format = input.format ?? (normalized === 'jpeg encode' ? 'jpeg' : normalized === 'png encode' ? 'png' : normalized === 'webp encode' ? 'webp' : state.format);
    const alpha = input.alpha ?? (format === 'jpeg' ? false : normalized === 'alpha merge' || state.alpha);
    const channels: ImageState['channels'] = alpha ? 4 : state.channels === 1 ? 1 : 3;
    const qualityDelta = input.qualityDelta ?? (normalized === 'sharpen' || normalized === 'color balance' ? 0.02 : normalized === 'blur' ? -0.01 : 0);
    return pipelineDeepFreeze({
      ...state,
      id: this.dependencies.id(),
      width: Math.max(1, Math.floor(input.width ?? state.width)),
      height: Math.max(1, Math.floor(input.height ?? state.height)),
      format,
      alpha,
      channels,
      metadata: { ...state.metadata, lastOperation: normalized },
      estimatedQuality: pipelineClamp(state.estimatedQuality + qualityDelta),
      estimatedFileSize: Math.max(1, Math.round(state.estimatedFileSize * (input.sizeFactor ?? this.formatFactor(format)))),
      generation: state.generation + 1,
      parentId: state.id,
      createdAt: this.dependencies.now(),
    });
  }

  private formatFactor(format: ImageState['format']): number {
    return format === 'jpeg' ? 0.65 : format === 'webp' ? 0.55 : format === 'png' ? 0.9 : 1;
  }
}
