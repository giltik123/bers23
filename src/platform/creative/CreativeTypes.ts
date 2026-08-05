export type CreativeCanvasStatus = 'EMPTY' | 'READY' | 'EDITING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type CreativeLayerType = 'IMAGE' | 'MASK' | 'COLOR' | 'ADJUSTMENT' | 'EFFECT' | 'AI_RESULT' | 'REFERENCE';
export type MaskSource = 'MANUAL' | 'AI_GENERATED' | 'IMPORTED';
export type AdjustmentType = 'BRIGHTNESS' | 'CONTRAST' | 'SATURATION' | 'HUE' | 'TEMPERATURE' | 'SHADOWS' | 'HIGHLIGHTS' | 'SHARPEN' | 'BLUR';
export type CanvasOperationType = 'LAYER_ADDED' | 'LAYER_REMOVED' | 'MASK_CHANGED' | 'ADJUSTMENT_CHANGED' | 'AI_RESULT_ADDED';

export interface CreativeAccessContext {
  readonly userId: string;
  readonly tenantId: string;
  readonly projectId: string;
}

export interface CreativeLayer {
  readonly id: string;
  readonly type: CreativeLayerType;
  readonly name: string;
  readonly visible: boolean;
  readonly opacity: number;
  readonly order: number;
  readonly locked: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface MaskModel {
  readonly id: string;
  readonly assetId: string;
  readonly layerId: string;
  readonly region: unknown;
  readonly source: MaskSource;
  readonly confidence: number;
}

export interface Adjustment {
  readonly id: string;
  readonly type: AdjustmentType;
  readonly value: number;
  readonly targetLayer: string;
  readonly createdAt: number;
}

export interface CanvasOperation {
  readonly id: string;
  readonly type: CanvasOperationType;
  readonly before: CreativeCanvasSnapshot;
  readonly after: CreativeCanvasSnapshot;
  readonly timestamp: number;
}

export interface CreativeCanvasSnapshot {
  readonly layers: readonly CreativeLayer[];
  readonly masks: readonly MaskModel[];
  readonly adjustments: readonly Adjustment[];
  readonly selectedLayerId: string | null;
  readonly status: CreativeCanvasStatus;
}

export interface CreativeCanvas {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly projectId: string;
  readonly assetId: string;
  readonly width: number;
  readonly height: number;
  readonly layers: readonly CreativeLayer[];
  readonly masks: readonly MaskModel[];
  readonly adjustments: readonly Adjustment[];
  readonly selectedLayerId: string | null;
  readonly history: readonly CanvasOperation[];
  readonly status: CreativeCanvasStatus;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface CreativeVariant {
  readonly id: string;
  readonly canvasId: string;
  readonly name: string;
  readonly parentVariantId: string | null;
  readonly changes: readonly CanvasOperation[];
  readonly createdAt: number;
}
