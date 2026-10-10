import React, { lazy, Suspense, useState, useMemo, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Download, Pencil, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadCanonicalImage } from '@/application/editor/downloadCanonicalImage';
import useProject from '@/hooks/useProject';
import { projectService } from '@/lib/projectService';
import { creativeEditApplicationService } from '@/application/creative/CreativeEditApplicationService';
import { createBackgroundIsolation } from '@/application/createBackgroundIsolation';
import { createMaskedExposure } from '@/application/createMaskedExposure';
import { createMaskedWhiteBalance } from '@/application/createMaskedWhiteBalance';
import { createMaskedLevels } from '@/application/createMaskedLevels';
import { normalizeMaskedLevelsParameters } from '@/platform/creative/deterministic/MaskedLevels';
import { createSuperResolution } from '@/application/createSuperResolution';
import { createCrop } from '@/application/createCrop';
import { createResize } from '@/application/createResize';
import { createOrthogonalTransform } from '@/application/createOrthogonalTransform';
import { isOrthogonalTransformStartBlocked } from '@/application/editor/orthogonalTransformStartPolicy';
import { encodeDeterministicRgbaPng } from '@/platform/creative/deterministic/DeterministicPng';
import { RESIZE_MAX_DIMENSION, RESIZE_MAX_OUTPUT_PIXELS } from '@/platform/creative/deterministic/ResizeIdentity';
import { ORTHOGONAL_TRANSFORM_MODES } from '@/platform/creative/deterministic/OrthogonalTransformIdentity';
import { SUPER_RESOLUTION_PRODUCTION_AVAILABLE } from '@/platform/creative/super-resolution/SuperResolutionRelease';
import GenerationProgress from '@/components/editor/GenerationProgress';
import ResultCompare from '@/components/editor/ResultCompare';
const RecipePanel = lazy(() => import('@/components/editor/recipes/RecipePanel'));
const AgentPanel = lazy(() => import('@/components/editor/agent/AgentPanel'));
import useBoundedAgentEditor from '@/components/editor/agent/useBoundedAgentEditor';
import { recipeEngine } from '@/lib/recipes/recipeEngine';
import ImageCanvas from '@/components/editor/ImageCanvas';
import CropToolbar from '@/components/editor/CropToolbar';
import ResizeToolbar from '@/components/editor/ResizeToolbar';
import OrthogonalTransformToolbar, { ORTHOGONAL_TRANSFORM_LABELS } from '@/components/editor/OrthogonalTransformToolbar';
import InstructionBar from '@/components/editor/InstructionBar';
import HistoryControls from '@/components/editor/HistoryControls';
import VersionsPanel from '@/components/editor/VersionsPanel';
import ErrorBanner from '@/components/editor/ErrorBanner';
import PlanPreview from '@/components/editor/PlanPreview';
import { aiPlanner } from '@/lib/planner/aiPlanner';
import ObjectPanel from '@/components/editor/ObjectPanel';
import EditorStatusBar from '@/components/editor/EditorStatusBar';
import SegmentationProgress from '@/components/editor/SegmentationProgress';
import PipelineStatusBar from '@/components/editor/PipelineStatusBar';
import { sceneMemory } from '@/lib/scene/sceneMemory';
import { styleLock } from '@/lib/scene/styleLock';
import { consistencyEngine } from '@/lib/scene/consistencyEngine';
import SceneMemoryPanel from '@/components/editor/scene/SceneMemoryPanel';
import ConsistencyWarning from '@/components/editor/scene/ConsistencyWarning';
import { workspaceManager } from '@/lib/workspace/workspaceManager';
import { workspaceHistory } from '@/lib/workspace/workspaceHistory';
import WorkspaceBar from '@/components/editor/workspace/WorkspaceBar';
import WorkspaceToolbar from '@/components/editor/workspace/WorkspaceToolbar';
import WorkspaceRecommendations from '@/components/editor/workspace/WorkspaceRecommendations';
const FashionPanel = lazy(() => import('@/components/editor/fashion/FashionPanel'));
const OutfitPanel = lazy(() => import('@/components/editor/outfits/OutfitPanel'));
const CanonicalTryOnRunnerPanel = lazy(() => import('@/components/editor/outfits/CanonicalTryOnRunnerPanel'));
const CreativeStudioPanel = lazy(() => import('@/components/editor/creative/CreativeStudioPanel'));
import useCanonicalTryOnEditor from '@/components/editor/outfits/useCanonicalTryOnEditor';
import AdaptiveLayout from '@/components/adaptive/AdaptiveLayout';
import AdaptiveToolbar from '@/components/adaptive/AdaptiveToolbar';
import AdaptivePanel from '@/components/adaptive/AdaptivePanels';
import AdaptiveNavigation from '@/components/adaptive/AdaptiveNavigation';
import { usePlatformProfile } from '@/lib/platform/PlatformManager';
import CreditsBar from '@/components/editor/credits/CreditsBar';
import JobQueuePanel from '@/components/editor/jobs/JobQueuePanel';
import { notificationCenter } from '@/lib/notifications/notificationCenter';
import { sessionRecovery } from '@/lib/performance/sessionRecovery';
import SelectionToolbar from '@/components/editor/SelectionToolbar';
import { SelectionApplicationService } from '@/application/selection';
import { createSelectionSegmentation } from '@/application/createSelectionSegmentation';
import { CoreMaskArtifactPort } from '@/application/selection/CoreMaskArtifactPort';
import { finalizeAcceptedResult } from '@/application/editor/finalizeAcceptedResult';
import { isFinalSourceConflict, recoverFinalSourceConflict } from '@/application/editor/recoverFinalSourceConflict';

const EDITOR_TABS = [{ id: 'prompt', label: 'Prompt' }, { id: 'creative', label: 'Creative Studio' }, { id: 'recipes', label: 'Recipes' }, { id: 'agent', label: 'AI Agent' }, { id: 'fashion', label: 'Fashion' }, { id: 'outfits', label: 'Outfits' }];

function disposePendingPreview(pending) {
  const url = pending?.result?.preview_url;
  if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
}

function exactCropRect(draft, sourceWidth, sourceHeight) {
  if (!draft || !Number.isSafeInteger(sourceWidth) || !Number.isSafeInteger(sourceHeight) || sourceWidth < 1 || sourceHeight < 1) return null;
  const { x, y, width, height } = draft;
  if (![x, y, width, height].every(Number.isSafeInteger)) return null;
  if (x < 0 || y < 0 || width < 1 || height < 1) return null;
  if (x + width > sourceWidth || y + height > sourceHeight) return null;
  return Object.freeze({ x, y, width, height });
}

function defaultCropRect(sourceWidth, sourceHeight) {
  const insetX = sourceWidth > 2 ? Math.floor(sourceWidth * .1) : 0;
  const insetY = sourceHeight > 2 ? Math.floor(sourceHeight * .1) : 0;
  return Object.freeze({ x: insetX, y: insetY, width: Math.max(1, sourceWidth - insetX * 2), height: Math.max(1, sourceHeight - insetY * 2) });
}

function exactResizeTarget(draft) {
  if (!draft) return null;
  const { width, height } = draft;
  if (![width, height].every(Number.isSafeInteger)) return null;
  if (width < 1 || height < 1 || width > RESIZE_MAX_DIMENSION || height > RESIZE_MAX_DIMENSION) return null;
  if (width * height > RESIZE_MAX_OUTPUT_PIXELS) return null;
  return Object.freeze({ width, height });
}

function exactMaskedLevelsParameters(inputBlack, inputMidpoint, inputWhite, outputBlack, outputWhite) {
  try { return normalizeMaskedLevelsParameters(inputBlack, inputMidpoint, inputWhite, outputBlack, outputWhite); }
  catch { return null; }
}

function proportionalResizeDimension(value, sourceSame, sourceOther) {
  if (![value, sourceSame, sourceOther].every(Number.isSafeInteger) || value < 1 || sourceSame < 1 || sourceOther < 1) return null;
  const same = BigInt(sourceSame);
  const numerator = BigInt(value) * BigInt(sourceOther);
  const rounded = (numerator * 2n + same) / (same * 2n);
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Math.max(1, Number(rounded));
}

export default function Editor() {
  const projectId = new URLSearchParams(window.location.search).get('id')?.trim() || null;
  const {
    project, loading, error, reload,
    rename, saveObjects, selectObject,
    pushEdit, undo, redo, restoreOriginal,
    createVersion, restoreVersion,
    canUndo, canRedo,
  } = useProject(projectId);

  const [instruction, setInstruction] = useState('');
  const [applying, setApplying] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [pendingResult, setPendingResult] = useState(null);
  const [committing, setCommitting] = useState(false);
  const [editTab, setEditTab] = useState('prompt');
  const [activeRecipe, setActiveRecipe] = useState(null);
  const [lastAction, setLastAction] = useState(null);
  const pendingResultRef = useRef(null);
  pendingResultRef.current = pendingResult;
  const tryOn = useCanonicalTryOnEditor({
    onFinalCandidate: (candidate) => {
      setPendingResult((current) => {
        disposePendingPreview(current);
        return candidate;
      });
    },
  });
  const boundedAgent = useBoundedAgentEditor({
    project,
    onFinalCandidate: (candidate) => {
      setPendingResult((current) => {
        disposePendingPreview(current);
        return candidate;
      });
    },
  });
  const [driftWarning, setDriftWarning] = useState(null);
  const [selection, setSelection] = useState(null);
  const [brushSize, setBrushSize] = useState(24);
  const [brushHardness, setBrushHardness] = useState(75);
  const [selectionMorphologyRadius, setSelectionMorphologyRadius] = useState(2);
  const [polygonComposition, setPolygonComposition] = useState('REPLACE');
  const [isolatingBackground, setIsolatingBackground] = useState(false);
  const [exposureEighthStops, setExposureEighthStops] = useState(8);
  const [applyingMaskedExposure, setApplyingMaskedExposure] = useState(false);
  const [whiteBalanceTemperatureQ8, setWhiteBalanceTemperatureQ8] = useState(64);
  const [whiteBalanceTintQ8, setWhiteBalanceTintQ8] = useState(0);
  const [applyingMaskedWhiteBalance, setApplyingMaskedWhiteBalance] = useState(false);
  const [levelsInputBlack, setLevelsInputBlack] = useState(0);
  const [levelsInputMidpoint, setLevelsInputMidpoint] = useState(128);
  const [levelsInputWhite, setLevelsInputWhite] = useState(255);
  const [levelsOutputBlack, setLevelsOutputBlack] = useState(0);
  const [levelsOutputWhite, setLevelsOutputWhite] = useState(255);
  const [applyingMaskedLevels, setApplyingMaskedLevels] = useState(false);
  const [upscaling, setUpscaling] = useState(false);
  const [cropDraft, setCropDraft] = useState(null);
  const [cropping, setCropping] = useState(false);
  const [resizeDraft, setResizeDraft] = useState(null);
  const [resizeAspectLocked, setResizeAspectLocked] = useState(true);
  const [resizing, setResizing] = useState(false);
  const [orthogonalTransformingMode, setOrthogonalTransformingMode] = useState(null);
  const selectionServiceRef = useRef(null);
  const strokeRef = useRef([]);
  const cropAnchorRef = useRef(null);
  const maskedExposureInFlightRef = useRef(false);
  const maskedWhiteBalanceInFlightRef = useRef(false);
  const maskedLevelsInFlightRef = useRef(false);
  const orthogonalTransformInFlightRef = useRef(false);
  const platform = usePlatformProfile();
  const localEditorBusy = applying || isolatingBackground || applyingMaskedExposure || applyingMaskedWhiteBalance || applyingMaskedLevels || upscaling || cropping || resizing || Boolean(orthogonalTransformingMode);
  const cropRect = exactCropRect(cropDraft, project?.width, project?.height);
  const cropInteractionActive = Boolean(cropDraft);
  const resizeTarget = exactResizeTarget(resizeDraft);
  const resizeInteractionActive = Boolean(resizeDraft);
  const tryOnActive = tryOn.state.host.active || tryOn.busy || pendingResult?.kind === 'FASHION_TRYON';
  const agentActive = boundedAgent.state.active || boundedAgent.busy;
  const editorBusy = localEditorBusy || tryOnActive || agentActive;
  const tryOnBlockedByEditor = localEditorBusy
    || agentActive
    || committing
    || Boolean(selection)
    || cropInteractionActive
    || resizeInteractionActive
    || Boolean(driftWarning)
    || (Boolean(pendingResult) && pendingResult?.kind !== 'FASHION_TRYON');
  const agentBlockedByEditor = localEditorBusy
    || tryOnActive
    || committing
    || Boolean(selection)
    || cropInteractionActive
    || resizeInteractionActive
    || Boolean(driftWarning)
    || Boolean(pendingResult);

  useEffect(() => () => disposePendingPreview(pendingResultRef.current), []);
  useEffect(() => { setCropDraft(null); cropAnchorRef.current = null; setResizeDraft(null); setResizeAspectLocked(true); }, [project?.current_image_artifact_id]);
  useEffect(() => {
    if (!selection) return undefined;
    const handleSelectionHistoryShortcut = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const target = event.target;
      const tag = target?.tagName;
      if (target?.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (selection.state === 'DOWNLOADING' || selection.state === 'LOADING' || selection.state === 'SELECTING') return;
      const service = selectionServiceRef.current;
      if (!service) return;
      const key = event.key.toLowerCase();
      const snapshot = service.snapshot();
      let next = null;
      if (key === 'z' && event.shiftKey) {
        if (!snapshot.canRedo) return;
        next = service.redo();
      } else if (key === 'z') {
        if (!snapshot.canUndo) return;
        next = service.undo();
      } else if (key === 'y' && !event.shiftKey) {
        if (!snapshot.canRedo) return;
        next = service.redo();
      } else {
        return;
      }
      event.preventDefault();
      setSelection(next);
    };
    window.addEventListener('keydown', handleSelectionHistoryShortcut);
    return () => window.removeEventListener('keydown', handleSelectionHistoryShortcut);
  }, [selection]);

  const runTryOnAction = async (name, context) => {
    if (tryOnBlockedByEditor || pendingResult) return;
    setAiError(null);
    setLastAction(null);
    try {
      await tryOn.dispatch(name, context);
    } catch (cause) {
      setAiError(cause?.message || 'Canonical deterministic Try-On failed.');
    }
  };

  const abandonTryOn = () => {
    try {
      tryOn.abandon();
      setAiError(null);
    } catch (cause) {
      setAiError(cause?.message || 'Try-On could not be abandoned.');
    }
  };

  const closeTryOn = () => {
    try {
      tryOn.close();
      setAiError(null);
    } catch (cause) {
      setAiError(cause?.message || 'Try-On selection could not be closed.');
    }
  };

  const startSelection = () => {
    if (orthogonalTransformInFlightRef.current || editorBusy || committing || pendingResult || cropInteractionActive || resizeInteractionActive) return;
    const imageArtifactId = project.current_image_artifact_id;
    if (!imageArtifactId) throw new Error('Canonical project image identity is unavailable');
    const segmentation = createSelectionSegmentation({ projectId: project.id, imageArtifactId, source: project.current_image_url });
    const artifacts = new CoreMaskArtifactPort(project.id);
    const service = new SelectionApplicationService(segmentation, artifacts);
    selectionServiceRef.current = service;
    setSelection(service.start({ imageArtifactId, width: project.width, height: project.height }));
  };
  const updateSelection = (action) => { const value = action(selectionServiceRef.current); if (value) setSelection(value); };
  const selectionShapeHandlePointer = (handle, phase, point, view) => {
    const service = selectionServiceRef.current;
    if (!service || (selection?.mode !== 'RECTANGLE' && selection?.mode !== 'ELLIPSE')) return;
    if (phase === 'down' || phase === 'move' || phase === 'up') {
      setSelection(service.shapeHandle({ handle, displayPoint: point, view }));
    }
  };
  const selectionPointer = async (phase, point, view) => {
    const service = selectionServiceRef.current;
    if (!service) return;
    if (selection.mode === 'SMART_SELECT' && phase === 'down') {
      setSelection({ ...service.snapshot(), state: 'SELECTING' });
      const next = await service.smartPoint({ displayPoint: point, view, privacyMode: 'LOCAL_ONLY' });
      if (next && selectionServiceRef.current === service) setSelection(next);
      return;
    }
    if (selection.mode === 'SMART_SELECT') return;
    if (selection.mode === 'POLYGON') {
      if (phase === 'down') setSelection(service.polygonVertex({ displayPoint: point, view }));
      return;
    }
    if (selection.mode === 'LASSO') {
      if (phase === 'down') setSelection(service.lassoStart({ displayPoint: point, view }));
      else if (phase === 'move') setSelection(service.lassoVertex({ displayPoint: point, view }));
      else if (phase === 'up') setSelection(service.lassoVertex({ displayPoint: point, view }, true));
      else if (phase === 'cancel') setSelection(service.clearLasso());
      return;
    }
    if (selection.mode === 'RECTANGLE' || selection.mode === 'ELLIPSE') {
      if (phase === 'down') setSelection(service.shapeStart({ displayPoint: point, view }));
      else if (phase === 'move' || phase === 'up') setSelection(service.shapeVertex({ displayPoint: point, view }));
      else if (phase === 'cancel') setSelection(service.clearShape());
      return;
    }
    if (phase === 'down') strokeRef.current = [point];
    else if (phase === 'move') strokeRef.current.push(point);
    else if (phase === 'up' && strokeRef.current.length) {
      strokeRef.current.push(point);
      setSelection(service.brush({ points: strokeRef.current, radius: brushSize, hardness: brushHardness / 100, view }));
      strokeRef.current = [];
    } else if (phase === 'cancel') strokeRef.current = [];
  };
  const finishSelection = async () => {
    const artifact = await selectionServiceRef.current.done();
    const object = { id: `selection-${artifact.id}`, label: 'Smart selection', selected: true, mask_artifact_id: artifact.id, box: { x: 0, y: 0, w: 1, h: 1 } };
    await saveObjects([...(objects || []).map((item) => ({ ...item, selected: false })), object]);
    selectionServiceRef.current.cancel(); selectionServiceRef.current = null; setSelection(null);
  };

  const startCrop = () => {
    if (orthogonalTransformInFlightRef.current || maskedExposureInFlightRef.current || maskedWhiteBalanceInFlightRef.current || maskedLevelsInFlightRef.current) return;
    if (selection || pendingResult || editorBusy || resizeInteractionActive || !project?.current_image_artifact_id) return;
    const rect = defaultCropRect(project.width, project.height);
    setAiError(null);
    cropAnchorRef.current = null;
    setCropDraft(rect);
  };
  const cropPointer = (phase, point) => {
    if (!cropDraft) return;
    if (phase === 'cancel') { cropAnchorRef.current = null; return; }
    if (phase === 'down') {
      cropAnchorRef.current = point;
      setCropDraft({ x: point.x, y: point.y, width: 1, height: 1 });
      return;
    }
    const anchor = cropAnchorRef.current;
    if (!anchor) return;
    const x = Math.min(anchor.x, point.x); const y = Math.min(anchor.y, point.y);
    const width = Math.abs(point.x - anchor.x) + 1; const height = Math.abs(point.y - anchor.y) + 1;
    setCropDraft({ x, y, width, height });
    if (phase === 'up') cropAnchorRef.current = null;
  };
  const applyCrop = async (retryContext = null) => {
    const sourceArtifactId = retryContext?.sourceArtifactId || project?.current_image_artifact_id;
    const requestedRect = retryContext?.rect || cropRect;
    const rect = exactCropRect(requestedRect, project?.width, project?.height);
    if (!project?.id || !sourceArtifactId || !rect) {
      setAiError('Crop requires an integer rectangle fully inside the current canonical image.');
      return;
    }
    setCropping(true);
    setAiError(null);
    setLastAction(() => () => applyCrop({ sourceArtifactId, rect }));
    try {
      const local = createCrop({ projectId: project.id });
      const result = await local.run({ requestId: globalThis.crypto.randomUUID(), sourceArtifactId, rect });
      const previewBytes = await encodeDeterministicRgbaPng(result.preview);
      const previewUrl = URL.createObjectURL(new Blob([previewBytes], { type: 'image/png' }));
      const editorResult = {
        finalArtifactId: result.canonicalArtifactId,
        preview_url: previewUrl,
        image_url: previewUrl,
        provider: 'Local deterministic',
        credits_used: 0,
        generation_time_ms: result.latencyMs,
      };
      setPendingResult((current) => {
        disposePendingPreview(current);
        return { kind: 'CROP', result: editorResult, instruction: `Crop ${rect.width}×${rect.height}`, beforeUrl: project.current_image_url, context: { sourceArtifactId, rect } };
      });
      cropAnchorRef.current = null;
      setCropDraft(null);
    } catch (e) {
      setAiError(e.message || 'Crop failed');
      workspaceHistory.recordEdit(workspaceManager.activeId(), { success: false, durationMs: 0 });
    } finally {
      setCropping(false);
    }
  };

  const startResize = () => {
    if (orthogonalTransformInFlightRef.current) return;
    if (selection || pendingResult || editorBusy || cropInteractionActive || !project?.current_image_artifact_id) return;
    if (!Number.isSafeInteger(project.width) || !Number.isSafeInteger(project.height) || project.width < 1 || project.height < 1) {
      setAiError('Resize requires valid canonical image dimensions.');
      return;
    }
    setAiError(null);
    setResizeAspectLocked(true);
    setResizeDraft({ width: project.width, height: project.height });
  };
  const updateResizeField = (key, value) => {
    setResizeDraft((current) => {
      if (!current) return current;
      const next = { ...current, [key]: value };
      if (!resizeAspectLocked || !Number.isSafeInteger(value) || value < 1) return next;
      const otherKey = key === 'width' ? 'height' : 'width';
      const sourceSame = key === 'width' ? project?.width : project?.height;
      const sourceOther = key === 'width' ? project?.height : project?.width;
      const proportional = proportionalResizeDimension(value, sourceSame, sourceOther);
      return proportional === null ? next : { ...next, [otherKey]: proportional };
    });
  };
  const applyResize = async (retryContext = null) => {
    const sourceArtifactId = retryContext?.sourceArtifactId || project?.current_image_artifact_id;
    const target = exactResizeTarget(retryContext?.target || resizeTarget);
    if (!project?.id || !sourceArtifactId || !target) {
      setAiError(`Resize requires integer dimensions within ${RESIZE_MAX_DIMENSION}px and ${RESIZE_MAX_OUTPUT_PIXELS.toLocaleString()} output pixels.`);
      return;
    }
    setResizing(true);
    setAiError(null);
    setLastAction(() => () => applyResize({ sourceArtifactId, target }));
    try {
      const local = createResize({ projectId: project.id });
      const result = await local.run({ requestId: globalThis.crypto.randomUUID(), sourceArtifactId, target });
      const previewBytes = await encodeDeterministicRgbaPng(result.preview);
      const previewUrl = URL.createObjectURL(new Blob([previewBytes], { type: 'image/png' }));
      const editorResult = {
        finalArtifactId: result.canonicalArtifactId,
        preview_url: previewUrl,
        image_url: previewUrl,
        provider: 'Local deterministic',
        credits_used: 0,
        generation_time_ms: result.latencyMs,
      };
      setPendingResult((current) => {
        disposePendingPreview(current);
        return { kind: 'RESIZE', result: editorResult, instruction: `Resize ${target.width}×${target.height}`, beforeUrl: project.current_image_url, context: { sourceArtifactId, target } };
      });
      setResizeDraft(null);
      setResizeAspectLocked(true);
    } catch (e) {
      setAiError(e.message || 'Resize failed');
      workspaceHistory.recordEdit(workspaceManager.activeId(), { success: false, durationMs: 0 });
    } finally {
      setResizing(false);
    }
  };

  const applyOrthogonalTransform = async (mode, retryContext = null, { allowPendingResult = false } = {}) => {
    const normalizedMode = typeof mode === 'string' && ORTHOGONAL_TRANSFORM_MODES.includes(mode) ? mode : null;
    const sourceArtifactId = retryContext?.sourceArtifactId || project?.current_image_artifact_id;
    const beforeUrl = retryContext?.beforeUrl || project?.current_image_url;
    const label = normalizedMode ? ORTHOGONAL_TRANSFORM_LABELS[normalizedMode] : null;
    if (!project?.id || !sourceArtifactId || !beforeUrl || !normalizedMode || !label) {
      setAiError('Rotate/Flip requires the current canonical image and one supported orthogonal transform mode.');
      return;
    }
    if (orthogonalTransformInFlightRef.current) return;
    if (isOrthogonalTransformStartBlocked({
      editorBusy,
      detecting: false,
      committing,
      pendingResult,
      selection,
      cropInteractionActive,
      resizeInteractionActive,
    }, { allowPendingResult })) return;
    orthogonalTransformInFlightRef.current = true;
    setOrthogonalTransformingMode(normalizedMode);
    setAiError(null);
    setLastAction(() => () => applyOrthogonalTransform(normalizedMode, { sourceArtifactId, beforeUrl }));
    try {
      const local = createOrthogonalTransform({ projectId: project.id });
      const result = await local.run({ requestId: globalThis.crypto.randomUUID(), sourceArtifactId, mode: normalizedMode });
      const previewBytes = await encodeDeterministicRgbaPng(result.preview);
      const previewUrl = URL.createObjectURL(new Blob([previewBytes], { type: 'image/png' }));
      const editorResult = {
        finalArtifactId: result.canonicalArtifactId,
        preview_url: previewUrl,
        image_url: previewUrl,
        provider: 'Local deterministic',
        credits_used: 0,
        generation_time_ms: result.latencyMs,
      };
      setPendingResult((current) => {
        disposePendingPreview(current);
        return { kind: 'ORTHOGONAL_TRANSFORM', result: editorResult, instruction: label, beforeUrl, context: { sourceArtifactId, mode: normalizedMode, beforeUrl } };
      });
    } catch (e) {
      setAiError(e.message || 'Rotate/Flip failed');
      workspaceHistory.recordEdit(workspaceManager.activeId(), { success: false, durationMs: 0 });
    } finally {
      orthogonalTransformInFlightRef.current = false;
      setOrthogonalTransformingMode(null);
    }
  };

  // Scene Memory: restores browser-local advisory state only.
  // Server-owned scene analysis is not enabled, so opening a Project never initiates analysis.
  useEffect(() => {
    if (!project) return;
    sceneMemory.ensure(project)
      .then((memory) => workspaceManager.autoDetect({ projectId: project.id, objects: project.objects || [], memory }))
      .catch((error) => console.error('[Editor] Scene analysis failed', error));
  }, [project?.id, project?.original_image_url]); // eslint-disable-line react-hooks/exhaustive-deps

  // Workspace re-detection when the detected object list changes.
  useEffect(() => {
    if (project) workspaceManager.autoDetect({ projectId: project.id, objects: project.objects || [], memory: sceneMemory.getActive() });
  }, [project?.objects]); // eslint-disable-line react-hooks/exhaustive-deps

  // Object list and selection live ON the project (auto-saved).
  const objects = project?.objects || [];
  const selected = objects.find((o) => o.selected) || null;

  useEffect(() => { if (project) sessionRecovery.saveEditor({ projectId: project.id, selectionId: selected?.id || null, historyIndex: project.history_index }); }, [project?.id, project?.history_index, selected?.id]);
  useEffect(() => {
    if (platform.formFactor !== 'desktop') return;
    const shortcut = (event) => {
      if (editorBusy || cropInteractionActive || resizeInteractionActive || pendingResult) return;
      if (event.target.matches('input, textarea')) return;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [platform.formFactor, undo, redo, editorBusy, cropInteractionActive, resizeInteractionActive, pendingResult]);

  const applyMaskedExposure = async (retryContext = null) => {
    const sourceArtifactId = retryContext?.sourceArtifactId || project?.current_image_artifact_id;
    const maskArtifactId = retryContext?.maskArtifactId || selected?.mask_artifact_id;
    const eighthStops = Number.isSafeInteger(retryContext?.eighthStops) ? retryContext.eighthStops : exposureEighthStops;
    if (!project?.id || !sourceArtifactId || !maskArtifactId || !Number.isSafeInteger(eighthStops) || eighthStops < -32 || eighthStops > 32 || eighthStops === 0) return;
    if (maskedExposureInFlightRef.current || maskedWhiteBalanceInFlightRef.current || maskedLevelsInFlightRef.current || orthogonalTransformInFlightRef.current) return;
    maskedExposureInFlightRef.current = true;
    setApplyingMaskedExposure(true);
    setAiError(null);
    setLastAction(() => () => applyMaskedExposure({ sourceArtifactId, maskArtifactId, eighthStops }));
    try {
      const local = createMaskedExposure({ projectId: project.id });
      const result = await local.run({ requestId: globalThis.crypto.randomUUID(), sourceArtifactId, maskArtifactId, eighthStops });
      const previewBytes = await encodeDeterministicRgbaPng(result.preview);
      const previewUrl = URL.createObjectURL(new Blob([previewBytes], { type: 'image/png' }));
      const ev = eighthStops / 8;
      const label = `Exposure ${ev > 0 ? '+' : ''}${Number.isInteger(ev) ? ev.toFixed(0) : ev.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')} EV`;
      const editorResult = {
        finalArtifactId: result.canonicalArtifactId,
        preview_url: previewUrl,
        image_url: previewUrl,
        provider: 'Local deterministic',
        credits_used: 0,
        generation_time_ms: result.latencyMs,
      };
      setPendingResult((current) => {
        disposePendingPreview(current);
        return { kind: 'MASKED_EXPOSURE', result: editorResult, instruction: label, beforeUrl: project.current_image_url, context: { sourceArtifactId, maskArtifactId, eighthStops } };
      });
    } catch (e) {
      setAiError(e.message || 'Masked Exposure failed');
      workspaceHistory.recordEdit(workspaceManager.activeId(), { success: false, durationMs: 0 });
    } finally {
      maskedExposureInFlightRef.current = false;
      setApplyingMaskedExposure(false);
    }
  };

  const applyMaskedWhiteBalance = async (retryContext = null) => {
    const sourceArtifactId = retryContext?.sourceArtifactId || project?.current_image_artifact_id;
    const maskArtifactId = retryContext?.maskArtifactId || selected?.mask_artifact_id;
    const temperatureQ8 = Number.isSafeInteger(retryContext?.temperatureQ8) ? retryContext.temperatureQ8 : whiteBalanceTemperatureQ8;
    const tintQ8 = Number.isSafeInteger(retryContext?.tintQ8) ? retryContext.tintQ8 : whiteBalanceTintQ8;
    if (!project?.id || !sourceArtifactId || !maskArtifactId
      || !Number.isSafeInteger(temperatureQ8) || temperatureQ8 < -128 || temperatureQ8 > 128
      || !Number.isSafeInteger(tintQ8) || tintQ8 < -64 || tintQ8 > 64
      || (temperatureQ8 === 0 && tintQ8 === 0)) return;
    if (maskedExposureInFlightRef.current || maskedWhiteBalanceInFlightRef.current || maskedLevelsInFlightRef.current || orthogonalTransformInFlightRef.current) return;
    maskedWhiteBalanceInFlightRef.current = true;
    setApplyingMaskedWhiteBalance(true);
    setAiError(null);
    setLastAction(() => () => applyMaskedWhiteBalance({ sourceArtifactId, maskArtifactId, temperatureQ8, tintQ8 }));
    try {
      const local = createMaskedWhiteBalance({ projectId: project.id });
      const result = await local.run({ requestId: globalThis.crypto.randomUUID(), sourceArtifactId, maskArtifactId, temperatureQ8, tintQ8 });
      const previewBytes = await encodeDeterministicRgbaPng(result.preview);
      const previewUrl = URL.createObjectURL(new Blob([previewBytes], { type: 'image/png' }));
      const signed = (value) => `${value > 0 ? '+' : ''}${value}`;
      const label = `White Balance T ${signed(temperatureQ8)} Q8 / Tint ${signed(tintQ8)} Q8`;
      const editorResult = {
        finalArtifactId: result.canonicalArtifactId,
        preview_url: previewUrl,
        image_url: previewUrl,
        provider: 'Local deterministic',
        credits_used: 0,
        generation_time_ms: result.latencyMs,
      };
      setPendingResult((current) => {
        disposePendingPreview(current);
        return { kind: 'MASKED_WHITE_BALANCE', result: editorResult, instruction: label, beforeUrl: project.current_image_url, context: { sourceArtifactId, maskArtifactId, temperatureQ8, tintQ8 } };
      });
    } catch (e) {
      setAiError(e.message || 'Masked White Balance failed');
      workspaceHistory.recordEdit(workspaceManager.activeId(), { success: false, durationMs: 0 });
    } finally {
      maskedWhiteBalanceInFlightRef.current = false;
      setApplyingMaskedWhiteBalance(false);
    }
  };

  const applyMaskedLevels = async (retryContext = null) => {
    const sourceArtifactId = retryContext?.sourceArtifactId || project?.current_image_artifact_id;
    const maskArtifactId = retryContext?.maskArtifactId || selected?.mask_artifact_id;
    const values = {
      inputBlack: Number.isSafeInteger(retryContext?.inputBlack) ? retryContext.inputBlack : levelsInputBlack,
      inputMidpoint: Number.isSafeInteger(retryContext?.inputMidpoint) ? retryContext.inputMidpoint : levelsInputMidpoint,
      inputWhite: Number.isSafeInteger(retryContext?.inputWhite) ? retryContext.inputWhite : levelsInputWhite,
      outputBlack: Number.isSafeInteger(retryContext?.outputBlack) ? retryContext.outputBlack : levelsOutputBlack,
      outputWhite: Number.isSafeInteger(retryContext?.outputWhite) ? retryContext.outputWhite : levelsOutputWhite,
    };
    const parameters = exactMaskedLevelsParameters(values.inputBlack, values.inputMidpoint, values.inputWhite, values.outputBlack, values.outputWhite);
    if (!project?.id || !sourceArtifactId || !maskArtifactId || !parameters) return;
    if (parameters.inputBlack === 0 && parameters.inputMidpoint === 128 && parameters.inputWhite === 255 && parameters.outputBlack === 0 && parameters.outputWhite === 255) return;
    if (maskedExposureInFlightRef.current || maskedWhiteBalanceInFlightRef.current || maskedLevelsInFlightRef.current || orthogonalTransformInFlightRef.current) return;
    maskedLevelsInFlightRef.current = true;
    setApplyingMaskedLevels(true);
    setAiError(null);
    setLastAction(() => () => applyMaskedLevels({ sourceArtifactId, maskArtifactId, ...parameters }));
    try {
      const local = createMaskedLevels({ projectId: project.id });
      const result = await local.run({ requestId: globalThis.crypto.randomUUID(), sourceArtifactId, maskArtifactId, ...parameters });
      const previewBytes = await encodeDeterministicRgbaPng(result.preview);
      const previewUrl = URL.createObjectURL(new Blob([previewBytes], { type: 'image/png' }));
      const label = `Levels in ${parameters.inputBlack}/${parameters.inputMidpoint}/${parameters.inputWhite} → out ${parameters.outputBlack}/${parameters.outputWhite}`;
      const editorResult = {
        finalArtifactId: result.canonicalArtifactId,
        preview_url: previewUrl,
        image_url: previewUrl,
        provider: 'Local deterministic',
        credits_used: 0,
        generation_time_ms: result.latencyMs,
      };
      setPendingResult((current) => {
        disposePendingPreview(current);
        return { kind: 'MASKED_LEVELS', result: editorResult, instruction: label, beforeUrl: project.current_image_url, context: { sourceArtifactId, maskArtifactId, ...parameters } };
      });
    } catch (e) {
      setAiError(e.message || 'Masked Levels failed');
      workspaceHistory.recordEdit(workspaceManager.activeId(), { success: false, durationMs: 0 });
    } finally {
      maskedLevelsInFlightRef.current = false;
      setApplyingMaskedLevels(false);
    }
  };

  const isolateBackground = async (retryContext = null) => {
    const sourceArtifactId = retryContext?.sourceArtifactId || project?.current_image_artifact_id;
    const maskArtifactId = retryContext?.maskArtifactId || selected?.mask_artifact_id;
    if (!project?.id || !sourceArtifactId || !maskArtifactId) return;
    setIsolatingBackground(true);
    setAiError(null);
    setLastAction(() => () => isolateBackground());
    try {
      const local = createBackgroundIsolation({ projectId: project.id });
      const result = await local.run({ requestId: globalThis.crypto.randomUUID(), sourceArtifactId, maskArtifactId });
      const previewBytes = await encodeDeterministicRgbaPng(result.preview);
      const previewUrl = URL.createObjectURL(new Blob([previewBytes], { type: 'image/png' }));
      const editorResult = {
        finalArtifactId: result.canonicalArtifactId,
        preview_url: previewUrl,
        image_url: previewUrl,
        provider: 'Local deterministic',
        credits_used: 0,
        generation_time_ms: result.latencyMs,
      };
      setPendingResult((current) => {
        disposePendingPreview(current);
        return { kind: 'BACKGROUND_ISOLATION', result: editorResult, instruction: 'Remove background', beforeUrl: project.current_image_url, context: { sourceArtifactId, maskArtifactId } };
      });
    } catch (e) {
      setAiError(e.message || 'Background isolation failed');
      workspaceHistory.recordEdit(workspaceManager.activeId(), { success: false, durationMs: 0 });
    } finally {
      setIsolatingBackground(false);
    }
  };

  const upscaleImage = async (retryContext = null) => {
    const sourceArtifactId = retryContext?.sourceArtifactId || project?.current_image_artifact_id;
    if (!project?.id || !sourceArtifactId) return;
    if (!SUPER_RESOLUTION_PRODUCTION_AVAILABLE) {
      setAiError('Local Real-ESRGAN x4 is still a candidate and is not production-approved.');
      return;
    }
    setUpscaling(true);
    setAiError(null);
    setLastAction(() => () => upscaleImage());
    try {
      const local = createSuperResolution({ projectId: project.id });
      const result = await local.run({ requestId: globalThis.crypto.randomUUID(), sourceArtifactId });
      const previewBytes = await encodeDeterministicRgbaPng(result.preview);
      const previewUrl = URL.createObjectURL(new Blob([previewBytes], { type: 'image/png' }));
      const editorResult = {
        finalArtifactId: result.canonicalArtifactId,
        preview_url: previewUrl,
        image_url: previewUrl,
        provider: `Local ${result.model.modelId}`,
        credits_used: 0,
        generation_time_ms: result.latencyMs,
      };
      setPendingResult((current) => {
        disposePendingPreview(current);
        return { kind: 'SUPER_RESOLUTION', result: editorResult, instruction: 'Upscale x4', beforeUrl: project.current_image_url, context: { sourceArtifactId } };
      });
    } catch (e) {
      setAiError(e.message || 'Local super-resolution failed');
      workspaceHistory.recordEdit(workspaceManager.activeId(), { success: false, durationMs: 0 });
    } finally {
      setUpscaling(false);
    }
  };

  // Every edit request goes through the AI Planner before anything executes.
  const plan = useMemo(() => {
    if (!project || !instruction.trim()) return null;
    return aiPlanner.plan({ project, instruction, objects, selectedObject: selected });
  }, [project, instruction, objects, selected]);

  // Single AI edits cross the application boundary; the Core canonical platform is execution authority.
  const applyEdit = async (bypassCache = false, { skipDriftCheck = false, instructionOverride = null } = {}) => {
    const usedInstruction = instructionOverride || instruction;
    const usedPlan = instructionOverride
      ? aiPlanner.plan({ project, instruction: usedInstruction, objects, selectedObject: selected })
      : plan;
    if (!usedPlan || usedPlan.status !== 'ready') return;

    // Consistency Engine: compare the requested edit against Scene Memory before generating.
    const memory = sceneMemory.getActive();
    if (!skipDriftCheck && memory && styleLock.isEnabled(project.id)) {
      const report = consistencyEngine.assess({ instruction: usedInstruction, memory });
      if (report.exceedsThreshold) {
        setDriftWarning(report);
        return;
      }
    }

    setApplying(true);
    setAiError(null);
    setLastAction(() => applyEdit);
    try {
      const result = await creativeEditApplicationService.execute({
        projectId: project.id,
        instruction: usedInstruction,
        selectedObjectIds: objects.filter((object) => object.selected).map((object) => object.id),
        inputArtifactId: project.current_image_artifact_id,
        maskArtifactIds: objects.filter((object) => object.selected && object.mask_artifact_id).map((object) => object.mask_artifact_id),
        preserveMode: styleLock.isEnabled(project.id) ? 'locked' : 'standard',
        clientRequestId: globalThis.crypto.randomUUID(),
      });
      if (result.status === 'UNKNOWN') throw Object.assign(new Error('Provider result is pending reconciliation'), { code: 'PROVIDER_OUTCOME_PENDING', retryable: false });
      if (result.status !== 'SUCCESS' || !result.imageUrl) throw Object.assign(new Error('Edit failed'), { code: 'provider_failure' });
      const editorResult = { ...result, image_url: result.imageUrl, generation_time_ms: result.timing?.durationMs, credits_used: result.creditsUsed };
      setPendingResult((current) => { disposePendingPreview(current); return { result: editorResult, instruction: usedInstruction, beforeUrl: project.current_image_url }; });
      recipeEngine.recordOutcome(activeRecipe?.id, { success: true, durationMs: editorResult.generation_time_ms, credits: editorResult.credits_used });
    } catch (e) {
      if (e.code !== 'cancelled') {
        setAiError(e.message || 'Edit failed');
        recipeEngine.recordOutcome(activeRecipe?.id, { success: false, durationMs: 0, credits: 0 });
        workspaceHistory.recordEdit(workspaceManager.activeId(), { success: false, durationMs: 0 });
      }
    } finally {
      setApplying(false);
    }
  };

  const acceptResult = async () => {
    const pending = pendingResult;
    setCommitting(true);
    try {
      const { result, instruction: used } = pending;
      if (!result.finalArtifactId) throw new Error('Canonical FINAL artifact identity is unavailable');
      await pushEdit(result.finalArtifactId, used);
      finalizeAcceptedResult({
        cleanupAcceptedResult: () => {
          setPendingResult(null);
          disposePendingPreview(pending);
          if (pending?.kind === 'FASHION_TRYON') {
            try { tryOn.close(); } catch (cleanupError) { console.error('[Editor] Try-On host cleanup failed', cleanupError); }
          }
          if (pending?.kind === 'BOUNDED_AGENT') boundedAgent.dismiss();
          setInstruction('');
          setActiveRecipe(null);
        },
        sideEffects: [
          {
            label: 'Failed to create accepted-edit notification',
            run: () => notificationCenter.push({ title: 'Edit saved', message: 'Your accepted result has been added to project history.', type: 'success', projectId: project.id }),
          },
          {
            label: 'Failed to update scene memory',
            run: () => sceneMemory.recordAcceptedEdit(project),
          },
          {
            label: 'Failed to record workspace history',
            run: () => workspaceHistory.recordEdit(workspaceManager.activeId(), { success: true, durationMs: result.generation_time_ms || 0 }),
          },
        ],
      });
    } catch (e) {
      if (!isFinalSourceConflict(e)) throw e;
      await recoverFinalSourceConflict({
        reloadCanonicalProject: reload,
        disarmRetry: () => setLastAction(null),
        clearPendingResult: () => {
          if (pending?.kind === 'FASHION_TRYON') {
            try { tryOn.close(); } catch (cleanupError) { console.error('[Editor] Try-On source-conflict cleanup failed', cleanupError); }
          }
          if (pending?.kind === 'BOUNDED_AGENT') boundedAgent.dismiss();
          setPendingResult(null);
        },
        disposePendingPreview: () => disposePendingPreview(pending),
        showMessage: setAiError,
      });
    } finally {
      setCommitting(false);
    }
  };

  const retryResult = () => {
    const pending = pendingResult;
    disposePendingPreview(pending);
    setPendingResult(null);
    if (pending?.kind === 'FASHION_TRYON') {
      void tryOn.retry().catch((cause) => setAiError(cause?.message || 'Canonical deterministic Try-On retry failed.'));
      return;
    }
    if (pending?.kind === 'BOUNDED_AGENT') {
      void boundedAgent.start(pending.context).catch((cause) => setAiError(cause?.message || 'Bounded Agent retry failed.'));
      return;
    }
    if (pending?.kind === 'BACKGROUND_ISOLATION') {
      void isolateBackground(pending.context);
      return;
    }
    if (pending?.kind === 'MASKED_EXPOSURE') {
      void applyMaskedExposure(pending.context);
      return;
    }
    if (pending?.kind === 'MASKED_WHITE_BALANCE') {
      void applyMaskedWhiteBalance(pending.context);
      return;
    }
    if (pending?.kind === 'MASKED_LEVELS') {
      void applyMaskedLevels(pending.context);
      return;
    }
    if (pending?.kind === 'SUPER_RESOLUTION') {
      void upscaleImage(pending.context);
      return;
    }
    if (pending?.kind === 'CROP') {
      void applyCrop(pending.context);
      return;
    }
    if (pending?.kind === 'RESIZE') {
      void applyResize(pending.context);
      return;
    }
    if (pending?.kind === 'ORTHOGONAL_TRANSFORM') {
      void applyOrthogonalTransform(pending.context?.mode, pending.context, { allowPendingResult: true });
      return;
    }
    applyEdit(true, { skipDriftCheck: true }); // bypass cache so a retry produces a fresh generation
  };

  const discardResult = () => {
    const pending = pendingResult;
    disposePendingPreview(pending);
    setPendingResult(null);
    if (pending?.kind === 'FASHION_TRYON') closeTryOn();
    if (pending?.kind === 'BOUNDED_AGENT') boundedAgent.dismiss();
  };

  const handleDownload = async () => {
    if(!project?.current_image_url || downloading)return;
    setDownloading(true);
    setAiError(null);
    try{
      // Core delivery URLs expire after five minutes; refresh the signed
      // URL without silently exporting a photo changed by another session.
      const fresh=await projectService.get(project.id);
      if(!fresh?.current_image_url ||
         fresh.current_image_artifact_id!==project.current_image_artifact_id)
        throw new Error('The photo changed in another session. Reload before exporting.');
      await downloadCanonicalImage({
        imageUrl:fresh.current_image_url,projectName:fresh.name,
        origin:window.location.origin,
      });
    }catch(error){
      setAiError(error?.message || 'Core export failed');
    }finally{setDownloading(false);}
  };

  const handleRename = async () => {
    const name = window.prompt('Rename project', project.name);
    if (name && name !== project.name) await rename(name);
  };

  const handleCreateVersion = async () => {
    const name = window.prompt('Version name', `Version ${(project.versions?.length || 0) + 1}`);
    if (name) await createVersion(name);
  };

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (error || !project) {
    return <div className="max-w-xl mx-auto px-4 py-16"><ErrorBanner message={error || 'Project not found'} onRetry={projectId ? reload : null} /></div>;
  }

  return (
    <AdaptiveLayout className="max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 min-w-0">
          <Link to="/" className="p-2 -ml-2 rounded-lg hover:bg-accent transition-colors"><ArrowLeft className="w-5 h-5" /></Link>
          <h1 className="font-medium truncate">{project.name}</h1>
          <button onClick={handleRename} className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground" aria-label="Rename project">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>
        <AdaptiveToolbar>
          <HistoryControls
            canUndo={canUndo} canRedo={canRedo} disabled={editorBusy || cropInteractionActive || resizeInteractionActive || Boolean(pendingResult)}
            onUndo={undo} onRedo={redo} onRestore={restoreOriginal}
          />
          <VersionsPanel
            versions={project.versions || []}
            onCreate={handleCreateVersion}
            onRestore={restoreVersion}
            disabled={editorBusy || cropInteractionActive || resizeInteractionActive || Boolean(pendingResult)}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => upscaleImage()}
            disabled={!SUPER_RESOLUTION_PRODUCTION_AVAILABLE || !project.current_image_artifact_id || editorBusy || committing || Boolean(pendingResult) || cropInteractionActive || resizeInteractionActive}
            title={SUPER_RESOLUTION_PRODUCTION_AVAILABLE ? 'Upscale the current image 4× on device' : 'Local Real-ESRGAN x4 is a candidate and is not production-approved yet'}
            aria-label={SUPER_RESOLUTION_PRODUCTION_AVAILABLE ? 'Upscale x4 locally' : 'Upscale x4 local candidate unavailable'}
          >
            {upscaling ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Maximize2 className="w-4 h-4 mr-1.5" />}
            {SUPER_RESOLUTION_PRODUCTION_AVAILABLE ? 'Upscale x4' : 'Upscale x4 · Candidate'}
          </Button>
          <button type="button" onClick={handleDownload}
            disabled={downloading || committing || Boolean(pendingResult)}
            className="p-2 rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
            aria-label="Download">
            {downloading ? <Loader2 className="w-5 h-5 animate-spin" /> :
              <Download className="w-5 h-5" />}
          </button>
        </AdaptiveToolbar>
      </div>

      <AdaptivePanel title="Workspace"><WorkspaceBar projectId={project.id} /></AdaptivePanel>

      <ErrorBanner message={aiError} onRetry={lastAction} />

      {driftWarning && !pendingResult && (
        <ConsistencyWarning
          warnings={driftWarning.warnings}
          onCancel={() => setDriftWarning(null)}
          onContinue={() => { setDriftWarning(null); applyEdit(false, { skipDriftCheck: true }); }}
          onAutoCorrect={() => {
            const corrected = `${instruction}. ${driftWarning.warnings.map((w) => w.correction).join(' ')}`;
            setDriftWarning(null);
            setInstruction(corrected);
            applyEdit(false, { skipDriftCheck: true, instructionOverride: corrected });
          }}
        />
      )}

      <AdaptivePanel title="Job Center"><JobQueuePanel /></AdaptivePanel>

      <GenerationProgress />

      <SegmentationProgress />

      <ImageCanvas
        imageUrl={project.current_image_url}
        objects={objects}
        selectedId={selected?.id}
        onSelect={(obj) => selectObject(obj.id)}
        busy={editorBusy}
        onUndo={undo}
        onRedo={redo}
        selection={selection}
        onSelectionPointer={selectionPointer}
        onShapeHandlePointer={selectionShapeHandlePointer}
        crop={cropRect ? { ...cropRect, sourceWidth: project.width, sourceHeight: project.height } : null}
        cropSource={cropInteractionActive ? { sourceWidth: project.width, sourceHeight: project.height } : null}
        onCropPointer={cropPointer}
      />

      <CropToolbar
        active={cropInteractionActive}
        draft={cropDraft}
        valid={Boolean(cropRect)}
        sourceWidth={project.width}
        sourceHeight={project.height}
        busy={editorBusy || Boolean(selection) || Boolean(pendingResult) || resizeInteractionActive}
        onStart={startCrop}
        onChange={setCropDraft}
        onApply={() => applyCrop()}
        onCancel={() => { cropAnchorRef.current = null; setCropDraft(null); }}
      />

      <ResizeToolbar
        active={resizeInteractionActive}
        draft={resizeDraft}
        valid={Boolean(resizeTarget)}
        sourceWidth={project.width}
        sourceHeight={project.height}
        busy={editorBusy || Boolean(selection) || Boolean(pendingResult) || cropInteractionActive}
        aspectLocked={resizeAspectLocked}
        onAspectLockedChange={setResizeAspectLocked}
        onStart={startResize}
        onFieldChange={updateResizeField}
        onApply={() => applyResize()}
        onCancel={() => { setResizeDraft(null); setResizeAspectLocked(true); }}
      />

      <OrthogonalTransformToolbar
        busy={Boolean(orthogonalTransformingMode)}
        activeMode={orthogonalTransformingMode}
        disabled={!project.current_image_artifact_id || editorBusy || committing || Boolean(selection) || Boolean(pendingResult) || cropInteractionActive || resizeInteractionActive}
        onApply={(mode) => applyOrthogonalTransform(mode)}
      />

      <SelectionToolbar
        selection={selection} brushSize={brushSize} onBrushSize={setBrushSize} brushHardness={brushHardness} onBrushHardness={setBrushHardness} onStart={startSelection}
        morphologyRadius={selectionMorphologyRadius} onMorphologyRadius={setSelectionMorphologyRadius}
        polygonComposition={polygonComposition} onPolygonComposition={setPolygonComposition}
        onApplyPolygon={() => updateSelection((service) => selection.mode === 'LASSO' ? service.applyLasso(polygonComposition) : service.applyPolygon(polygonComposition))}
        onClearPolygon={() => updateSelection((service) => selection.mode === 'LASSO' ? service.clearLasso() : service.clearPolygon())}
        onApplyShape={() => updateSelection((service) => service.applyShape(polygonComposition))}
        onClearShape={() => updateSelection((service) => service.clearShape())}
        onNudgeShape={(deltaX, deltaY) => updateSelection((service) => service.nudgeShape(deltaX, deltaY))}
        startDisabled={cropInteractionActive || resizeInteractionActive || editorBusy || Boolean(pendingResult)}
        onMode={(mode) => updateSelection((service) => service.setMode(mode))}
        onUndo={() => updateSelection((service) => service.undo())}
        onRedo={() => updateSelection((service) => service.redo())}
        onClear={() => updateSelection((service) => service.clear())}
        onInvert={() => updateSelection((service) => service.invert())}
        onGrow={() => updateSelection((service) => service.grow(selectionMorphologyRadius))}
        onShrink={() => updateSelection((service) => service.shrink(selectionMorphologyRadius))}
        onOpen={() => updateSelection((service) => service.open(selectionMorphologyRadius))}
        onClose={() => updateSelection((service) => service.close(selectionMorphologyRadius))}
        onFeather={() => updateSelection((service) => service.feather(selectionMorphologyRadius))}
        onCancel={() => { selectionServiceRef.current.cancel(); selectionServiceRef.current = null; setSelection(null); }}
        onDone={finishSelection}
        canIsolateBackground={Boolean(selected?.mask_artifact_id && project.current_image_artifact_id) && !pendingResult && !tryOnActive && !agentActive && !applying && !committing && !upscaling && !cropping && !resizing && !orthogonalTransformingMode && !cropInteractionActive && !resizeInteractionActive}
        isolatingBackground={isolatingBackground}
        onIsolateBackground={() => isolateBackground()}
        exposureEighthStops={exposureEighthStops}
        onExposureEighthStops={setExposureEighthStops}
        canApplyExposure={Boolean(selected?.mask_artifact_id && project.current_image_artifact_id) && !pendingResult && !tryOnActive && !agentActive && !applying && !committing && !isolatingBackground && !upscaling && !cropping && !resizing && !orthogonalTransformingMode && !cropInteractionActive && !resizeInteractionActive}
        applyingExposure={applyingMaskedExposure}
        onApplyExposure={() => applyMaskedExposure()}
        whiteBalanceTemperatureQ8={whiteBalanceTemperatureQ8}
        onWhiteBalanceTemperatureQ8={setWhiteBalanceTemperatureQ8}
        whiteBalanceTintQ8={whiteBalanceTintQ8}
        onWhiteBalanceTintQ8={setWhiteBalanceTintQ8}
        canApplyWhiteBalance={Boolean(selected?.mask_artifact_id && project.current_image_artifact_id) && !pendingResult && !tryOnActive && !agentActive && !applying && !committing && !isolatingBackground && !upscaling && !cropping && !resizing && !orthogonalTransformingMode && !cropInteractionActive && !resizeInteractionActive}
        applyingWhiteBalance={applyingMaskedWhiteBalance}
        onApplyWhiteBalance={() => applyMaskedWhiteBalance()}
        levelsInputBlack={levelsInputBlack}
        onLevelsInputBlack={setLevelsInputBlack}
        levelsInputMidpoint={levelsInputMidpoint}
        onLevelsInputMidpoint={setLevelsInputMidpoint}
        levelsInputWhite={levelsInputWhite}
        onLevelsInputWhite={setLevelsInputWhite}
        levelsOutputBlack={levelsOutputBlack}
        onLevelsOutputBlack={setLevelsOutputBlack}
        levelsOutputWhite={levelsOutputWhite}
        onLevelsOutputWhite={setLevelsOutputWhite}
        canApplyLevels={Boolean(selected?.mask_artifact_id && project.current_image_artifact_id)
          && Boolean(exactMaskedLevelsParameters(levelsInputBlack, levelsInputMidpoint, levelsInputWhite, levelsOutputBlack, levelsOutputWhite))
          && !pendingResult && !tryOnActive && !agentActive && !applying && !committing && !isolatingBackground && !upscaling && !cropping && !resizing && !orthogonalTransformingMode && !cropInteractionActive && !resizeInteractionActive}
        applyingLevels={applyingMaskedLevels}
        onApplyLevels={() => applyMaskedLevels()}
      />

      <PipelineStatusBar width={project.width} height={project.height} />

      <CreditsBar estimate={!pendingResult && plan?.status === 'ready' ? (plan.credits?.credits ?? 0) : 0} />

      <AdaptivePanel title="Scene Memory"><SceneMemoryPanel project={project} /></AdaptivePanel>

      <EditorStatusBar
        objectCount={objects.length}
        selectionCount={objects.filter((o) => o.selected).length}
        selectionMode="single"
        maskedCount={objects.filter((o) => o.mask_url).length}
        segmentationStatus={objects.length ? 'completed' : 'idle'}
        cacheStatus="empty"
      />

      {objects.length > 0 && !orthogonalTransformingMode && !cropInteractionActive && !resizeInteractionActive && !pendingResult && <AdaptivePanel title="Objects"><ObjectPanel objects={objects} onSelect={(obj) => selectObject(obj.id)} /></AdaptivePanel>}

      {objects.length === 0 && !pendingResult && !cropInteractionActive && !resizeInteractionActive && (
        <p className="text-[11px] text-muted-foreground text-center">Edit the whole image or use the selection tool to mark a region. Automatic object detection is not available in this version.</p>
      )}

      {pendingResult ? (
        <ResultCompare
          beforeUrl={pendingResult.beforeUrl}
          result={pendingResult.result}
          onAccept={acceptResult}
          onDiscard={discardResult}
          onRetry={retryResult}
          busy={committing || tryOn.busy || boundedAgent.busy || isolatingBackground || applyingMaskedExposure || applyingMaskedWhiteBalance || applyingMaskedLevels || upscaling || cropping || resizing || Boolean(orthogonalTransformingMode)}
        />
      ) : cropInteractionActive ? (
        <p className="rounded-xl border bg-card px-3 py-2 text-sm text-muted-foreground" role="status">Adjust the crop rectangle above, then apply or cancel it before starting another edit.</p>
      ) : resizeInteractionActive ? (
        <p className="rounded-xl border bg-card px-3 py-2 text-sm text-muted-foreground" role="status">Set the exact resize dimensions above, then apply or cancel them before starting another edit.</p>
      ) : (
        <>
          {objects.length > 0 && (
            <>
              <WorkspaceToolbar
                disabled={editorBusy}
                onUse={(prompt) => { setInstruction(prompt); setActiveRecipe(null); setEditTab('prompt'); }}
              />
              <WorkspaceRecommendations
                disabled={editorBusy}
                onUse={(prompt, recipe) => { setInstruction(prompt); setActiveRecipe(recipe); setEditTab('prompt'); }}
              />
            </>
          )}
          <AdaptiveNavigation items={EDITOR_TABS} active={editTab} onChange={(next) => { if (!tryOnActive && !agentActive) setEditTab(next); }} />
          <Suspense fallback={<div className="py-8 text-center text-sm text-muted-foreground">Loading panel…</div>}>
          {editTab === 'creative' ? (
            <CreativeStudioPanel project={project} objects={objects} disabled={editorBusy} />
          ) : editTab === 'outfits' ? (
            <div className="space-y-3">
              <CanonicalTryOnRunnerPanel
                project={project}
                state={tryOn.state}
                busy={tryOn.busy}
                disabled={tryOnBlockedByEditor}
                onAction={runTryOnAction}
                onLoadManualGarmentSource={tryOn.loadManualGarmentSource}
                onSaveManualContour={tryOn.saveManualContour}
                onSaveManualBodyAnchors={tryOn.saveManualBodyAnchors}
                onAbandon={abandonTryOn}
                onClose={closeTryOn}
              />
              {!tryOn.state.host.active && <OutfitPanel />}
            </div>
          ) : editTab === 'fashion' ? (
            <FashionPanel />
          ) : editTab === 'agent' ? (
            <AgentPanel
              project={project}
              state={boundedAgent.state}
              busy={boundedAgent.busy}
              disabled={agentBlockedByEditor}
              onStart={boundedAgent.start}
              onRetry={boundedAgent.retry}
              onCancel={boundedAgent.cancel}
            />
          ) : editTab === 'recipes' ? (
            <RecipePanel
              objects={objects}
              selectedObjects={objects.filter((o) => o.selected)}
              disabled={editorBusy}
              onUse={(prompt, recipe) => {
                // Recipe Engine output enters the normal flow: instruction → AI Planner → Editing Engine.
                setInstruction(prompt);
                setActiveRecipe(recipe);
                setEditTab('prompt');
              }}
            />
          ) : (
            <>
              {activeRecipe && (
                <p className="text-[11px] text-muted-foreground">Recipe: <span className="font-medium text-foreground">{activeRecipe.name}</span> — edit the prompt below if needed.</p>
              )}
              {plan && <PlanPreview plan={plan} />}
              <InstructionBar
                selectedObject={selected}
                allowWholeImage={objects.length === 0}
                instruction={instruction}
                onInstructionChange={setInstruction}
                onApply={() => applyEdit(false)}
                applying={editorBusy || committing}
              />
            </>
          )}
          </Suspense>
        </>
      )}
    </AdaptiveLayout>
  );
}
