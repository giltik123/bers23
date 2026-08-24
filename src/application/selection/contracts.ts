import type { CreativeArtifact } from '../../platform/creative/canonical/contracts';
import type { DisplayTransform, OriginalMask } from '../../platform/creative/pipeline/ControlledLocalEdit';
import type { ExecutionProvider, PrivacyMode, RuntimeKind } from '../../platform/creative/local-ai';

export const INTERACTIVE_SEGMENTATION = 'INTERACTIVE_SEGMENTATION' as const;
export type SelectionMode = 'SMART_SELECT' | 'BRUSH_ADD' | 'BRUSH_SUBTRACT';
export type SelectionState = 'NOTHING_SELECTED' | 'DOWNLOADING' | 'LOADING' | 'SELECTING' | 'SELECTED' | 'REFINING' | 'READY' | 'ERROR' | 'LOCAL_UNAVAILABLE';
export type PromptPoint = Readonly<{ x: number; y: number; label: 'POSITIVE' | 'NEGATIVE'; coordinateSpace: 'ORIGINAL' }>;
export type AnalysisTransform = Readonly<{ originalWidth: number; originalHeight: number; analysisWidth: number; analysisHeight: number; scaleX: number; scaleY: number; offsetX: number; offsetY: number }>;
export type MaskQualityResult = Readonly<{ coverage: number; fragmentation: number; edgeComplexity: number; confidence: number; empty: boolean; full: boolean; warning?: 'EMPTY' | 'TINY' | 'SUSPICIOUSLY_FULL' }>;
export type SelectionCandidate = Readonly<{ alpha: Uint8Array; width: number; height: number; coordinateSpace: 'ANALYSIS'; score: number }>;
export type SelectionTelemetry = Readonly<{ selectionMethod: SelectionMode; executionTarget: 'LOCAL' | 'CLOUD' | 'BLOCKED'; modelId?: string; modelVersion?: string; analysisResolution: readonly [number, number]; originalResolution: readonly [number, number]; selectionLatency: number; modelLatency: number; refinementLatency: number; maskCoverage: number; manualCorrections: number; undoCount: number; localFallbackReason?: string; peakEstimatedMemory: number; rawImage?: never }>;
export type InteractiveSegmentationResult = Readonly<{
  target: 'LOCAL' | 'CLOUD';
  modelId: string;
  modelVersion: string;
  runtime?: RuntimeKind;
  accelerator?: ExecutionProvider;
  memoryBytes?: number;
  latencyMs: number;
  canonicalArtifactId?: string;
  candidates: readonly SelectionCandidate[];
}>;
export interface InteractiveSegmentationPort { segment(input: Readonly<{ requestId: string; imageArtifactId: string; analysis: AnalysisTransform; points: readonly PromptPoint[]; privacyMode: PrivacyMode }>): Promise<InteractiveSegmentationResult>; cancel(requestId: string): void }
export interface CanonicalMaskArtifactPort {
  persist(mask: OriginalMask, metadata: Readonly<Record<string, unknown>>): Promise<CreativeArtifact>;
  admitted?(artifactId: string, mask: OriginalMask, metadata: Readonly<Record<string, unknown>>): CreativeArtifact | Promise<CreativeArtifact>;
}
export type SelectionDraftSnapshot = Readonly<{ id: string; imageArtifactId: string; width: number; height: number; alpha: Uint8Array; state: SelectionState; mode: SelectionMode; points: readonly PromptPoint[]; provenance: readonly string[]; requestId?: string; quality?: MaskQualityResult; warning?: string; canUndo: boolean; canRedo: boolean }>;
export type BrushStroke = Readonly<{ points: readonly Readonly<{ x: number; y: number }>[]; radius: number; hardness: number; view: DisplayTransform }>;
