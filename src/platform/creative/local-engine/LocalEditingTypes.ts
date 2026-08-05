import type { CreativeAccessContext, CreativeCanvas, CreativeLayer } from '../CreativeTypes';

export type LocalAdjustmentType =
  | 'BRIGHTNESS'
  | 'CONTRAST'
  | 'SATURATION'
  | 'HUE'
  | 'TEMPERATURE'
  | 'SHADOWS'
  | 'HIGHLIGHTS'
  | 'EXPOSURE'
  | 'SHARPEN'
  | 'BLUR'
  | 'NOISE_REDUCTION'
  | 'CROP'
  | 'ROTATE'
  | 'RESIZE'
  | 'FLIP';

export type LocalEditMode = 'LOCAL' | 'AI';
export type LocalOperationEventType = 'operation.started' | 'operation.completed' | 'operation.reverted';

export interface LocalAdjustment {
  readonly id?: string;
  readonly type: LocalAdjustmentType;
  readonly value: number | string | Readonly<Record<string, unknown>>;
  readonly targetLayer?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface LocalOperation {
  readonly id: string;
  readonly canvasId: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly userId: string;
  readonly adjustment: LocalAdjustment;
  readonly status: 'APPLIED' | 'REVERTED';
  readonly before: PreviewState | null;
  readonly after: PreviewState;
  readonly timestamp: number;
}

export interface PreviewState {
  readonly id: string;
  readonly canvasId: string;
  readonly layers: readonly string[];
  readonly adjustments: readonly LocalAdjustment[];
  readonly renderHash: string;
  readonly generatedAt: number;
  readonly assetCreated: false;
}

export interface LocalEditingResult {
  readonly success: boolean;
  readonly operationId: string;
  readonly updatedLayer: CreativeLayer | null;
  readonly previewAvailable: boolean;
  readonly preview: PreviewState;
  readonly credits: 0;
}

export interface RenderDecision {
  readonly canvasId: string;
  readonly layers: readonly string[];
  readonly masks: readonly string[];
  readonly adjustments: readonly LocalAdjustment[];
  readonly effects: readonly string[];
  readonly output: 'PREVIEW';
}

export interface EditCapabilityDecision {
  readonly mode: LocalEditMode;
  readonly credits: number;
  readonly creditsRequired: boolean;
  readonly provider?: 'REVE' | 'SAM3' | 'FASHN';
  readonly reason: string;
}

export interface HistoryPort {
  record(event: { readonly type: LocalOperationEventType; readonly canvasId: string; readonly operationId: string; readonly snapshot: unknown; readonly timestamp: number }): void;
}

export interface CanvasPort {
  getCanvas(context: CreativeAccessContext, canvasId: string): CreativeCanvas;
}
