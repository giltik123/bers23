import React, { lazy, Suspense, useState, useMemo, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ScanSearch, Loader2, Download, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import useProject from '@/hooks/useProject';
import { creativeEditApplicationService } from '@/application/creative/CreativeEditApplicationService';
import GenerationProgress from '@/components/editor/GenerationProgress';
import ResultCompare from '@/components/editor/ResultCompare';
const RecipePanel = lazy(() => import('@/components/editor/recipes/RecipePanel'));
const AgentPanel = lazy(() => import('@/components/editor/agent/AgentPanel'));
import { recipeEngine } from '@/lib/recipes/recipeEngine';
import { legacyRecipeExecutionAdapter } from '@/application/creative/LegacyRecipeExecutionAdapter';
import ChainProgress from '@/components/editor/recipes/ChainProgress';
import ImageCanvas from '@/components/editor/ImageCanvas';
import InstructionBar from '@/components/editor/InstructionBar';
import HistoryControls from '@/components/editor/HistoryControls';
import VersionsPanel from '@/components/editor/VersionsPanel';
import ErrorBanner from '@/components/editor/ErrorBanner';
import PlanPreview from '@/components/editor/PlanPreview';
import { aiPlanner } from '@/lib/planner/aiPlanner';
import { segmentationService } from '@/lib/segmentation/segmentationService';
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
const CreativeStudioPanel = lazy(() => import('@/components/editor/creative/CreativeStudioPanel'));
import AdaptiveLayout from '@/components/adaptive/AdaptiveLayout';
import AdaptiveToolbar from '@/components/adaptive/AdaptiveToolbar';
import AdaptivePanel from '@/components/adaptive/AdaptivePanels';
import AdaptiveNavigation from '@/components/adaptive/AdaptiveNavigation';
import { usePlatformProfile } from '@/lib/platform/PlatformManager';
import CreditsBar from '@/components/editor/credits/CreditsBar';
import { jobManager } from '@/lib/jobs/jobManager';
import JobQueuePanel from '@/components/editor/jobs/JobQueuePanel';
import { notificationCenter } from '@/lib/notifications/notificationCenter';
import { sessionRecovery } from '@/lib/performance/sessionRecovery';
import SelectionToolbar from '@/components/editor/SelectionToolbar';
import { SelectionApplicationService } from '@/application/selection';
import { createSelectionSegmentation } from '@/application/createSelectionSegmentation';
import { CoreMaskArtifactPort } from '@/application/selection/CoreMaskArtifactPort';

const EDITOR_TABS = [{ id: 'prompt', label: 'Prompt' }, { id: 'creative', label: 'Creative Studio' }, { id: 'recipes', label: 'Recipes' }, { id: 'agent', label: 'AI Agent' }, { id: 'fashion', label: 'Fashion' }, { id: 'outfits', label: 'Outfits' }];

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
  const [detecting, setDetecting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [pendingResult, setPendingResult] = useState(null);
  const [committing, setCommitting] = useState(false);
  const [editTab, setEditTab] = useState('prompt');
  const [activeRecipe, setActiveRecipe] = useState(null);
  const [chainState, setChainState] = useState(null); // { chain, steps, running }
  const [lastAction, setLastAction] = useState(null);
  // Always-fresh pushEdit for multi-step agent runs (avoids stale closures across commits).
  const pushEditRef = useRef();
  pushEditRef.current = pushEdit;
  const [segMeta, setSegMeta] = useState(null);
  const [driftWarning, setDriftWarning] = useState(null);
  const [selection, setSelection] = useState(null);
  const [brushSize, setBrushSize] = useState(24);
  const selectionServiceRef = useRef(null);
  const strokeRef = useRef([]);
  const platform = usePlatformProfile();

  const startSelection = () => {
    const imageArtifactId = project.current_image_artifact_id || project.current_image_url;
    const segmentation = createSelectionSegmentation({ imageArtifactId, source: project.current_image_url });
    const artifacts = new CoreMaskArtifactPort(project.id);
    const service = new SelectionApplicationService(segmentation, artifacts);
    selectionServiceRef.current = service;
    setSelection(service.start({ imageArtifactId, width: project.width, height: project.height }));
  };
  const updateSelection = (action) => { const value = action(selectionServiceRef.current); if (value) setSelection(value); };
  const selectionPointer = async (phase, point, view) => {
    const service = selectionServiceRef.current;
    if (!service) return;
    if (selection.mode === 'SMART_SELECT' && phase === 'down') {
      setSelection({ ...service.snapshot(), state: 'SELECTING' });
      setSelection(await service.smartPoint({ displayPoint: point, view, privacyMode: 'LOCAL_ONLY' }));
      return;
    }
    if (selection.mode === 'SMART_SELECT') return;
    if (phase === 'down') strokeRef.current = [point];
    else if (phase === 'move') strokeRef.current.push(point);
    else if (phase === 'up' && strokeRef.current.length) {
      strokeRef.current.push(point);
      setSelection(service.brush({ points: strokeRef.current, radius: brushSize, hardness: .75, view }));
      strokeRef.current = [];
    } else if (phase === 'cancel') strokeRef.current = [];
  };
  const finishSelection = async () => {
    const artifact = await selectionServiceRef.current.done();
    const object = { id: `selection-${artifact.id}`, label: 'Smart selection', selected: true, mask_artifact_id: artifact.id, box: { x: 0, y: 0, w: 1, h: 1 } };
    await saveObjects([...(objects || []).map((item) => ({ ...item, selected: false })), object]);
    selectionServiceRef.current.cancel(); selectionServiceRef.current = null; setSelection(null);
  };

  // Scene Memory: auto-analyze when the project loads or the original image changes.
  // Once memory is ready, workspace auto-detection re-evaluates with full context.
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
  useEffect(() => { if (platform.formFactor !== 'desktop') return; const shortcut = (event) => { if (event.target.matches('input, textarea')) return; if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return; event.preventDefault(); if (event.shiftKey) redo(); else undo(); }; window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut); }, [platform.formFactor, undo, redo]);

  // Every edit request goes through the AI Planner before anything executes.
  const plan = useMemo(() => {
    if (!project || !instruction.trim()) return null;
    return aiPlanner.plan({ project, instruction, objects, selectedObject: selected });
  }, [project, instruction, objects, selected]);

  const detect = async () => {
    setDetecting(true);
    setAiError(null);
    setLastAction(() => detect);
    try {
      // All object detection goes through the Segmentation Layer — never a provider directly.
      const result = await jobManager.submit({
        type: 'segmentation', label: 'Detect objects', priority: 'high', projectId: project.id,
        provider: 'sam3', estimatedTime: 12000,
        run: () => segmentationService.start({ projectId, imageUrl: project.current_image_url }),
      });
      setSegMeta({ status: result.status, fromCache: result.fromCache });
      await saveObjects(result.objects);
    } catch (e) {
      setAiError(e.message || 'Object detection failed');
    } finally {
      setDetecting(false);
    }
  };

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
        inputArtifactId: project.current_image_artifact_id || project.current_image_url,
        maskArtifactIds: objects.filter((object) => object.selected && object.mask_artifact_id).map((object) => object.mask_artifact_id),
        preserveMode: styleLock.isEnabled(project.id) ? 'locked' : 'standard',
        clientRequestId: globalThis.crypto.randomUUID(),
      });
      if (result.status === 'pending') throw Object.assign(new Error('Provider result is pending reconciliation'), { code: 'PROVIDER_OUTCOME_PENDING', retryable: false });
      if (result.status !== 'completed' || !result.imageUrl) throw Object.assign(new Error('Edit failed'), { code: 'provider_failure' });
      const editorResult = { ...result, image_url: result.imageUrl, generation_time_ms: result.timing?.durationMs, credits_used: result.creditsUsed };
      setPendingResult({ result: editorResult, instruction: usedInstruction, beforeUrl: project.current_image_url });
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
    setCommitting(true);
    try {
      const { result, instruction: used } = pendingResult;
      await pushEdit(result.image_url, used, result.historyEntry);
      await notificationCenter.push({ title: 'Edit saved', message: 'Your accepted result has been added to project history.', type: 'success', projectId: project.id });
      sceneMemory.recordAcceptedEdit(project).catch((error) => console.error('[Editor] Failed to update scene memory', error)); // fingerprint bumps on accepted edits only
      workspaceHistory.recordEdit(workspaceManager.activeId(), { success: true, durationMs: result.generation_time_ms || 0 });
      setPendingResult(null);
      setInstruction('');
      setActiveRecipe(null);
    } finally {
      setCommitting(false);
    }
  };

  // Runs a recipe chain: each step flows through Planner → Editing Engine and is committed to history.
  const runChain = async (chain) => {
    setApplying(true);
    setAiError(null);
    setChainState({ chain, steps: chain.steps.map((s) => ({ label: s.label, status: 'pending' })), running: true });
    try {
      await jobManager.submit({
        type: 'chain',
        label: chain.name,
        priority: 'normal',
        projectId: project.id,
        provider: 'reve',
        estimatedTime: 60000,
        creditsReserved: legacyRecipeExecutionAdapter.estimate(chain),
        onCancel: () => legacyRecipeExecutionAdapter.cancel(),
        notifyOnComplete: true,
        run: () => legacyRecipeExecutionAdapter.execute({
            chain, project, objects,
            onProgress: (steps) => setChainState((cs) => ({ ...cs, steps })),
            onStepCommitted: async (result, step) => {
              await pushEdit(result.image_url, `${chain.name}: ${step.label}`, result.historyEntry);
              sceneMemory.recordAcceptedEdit(project).catch((error) => console.error('[Editor] Failed to update scene memory', error));
            },
        }),
      });
      setChainState((cs) => ({ ...cs, running: false }));
    } catch (e) {
      setChainState((cs) => (cs ? { ...cs, running: false } : cs));
      if (e.code !== 'cancelled') setAiError(e.message || 'Chain failed');
      else setChainState(null);
    } finally {
      setApplying(false);
    }
  };

  const retryResult = () => {
    setPendingResult(null);
    applyEdit(true, { skipDriftCheck: true }); // bypass cache so a retry produces a fresh generation
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
            canUndo={canUndo} canRedo={canRedo} disabled={applying || detecting}
            onUndo={undo} onRedo={redo} onRestore={restoreOriginal}
          />
          <VersionsPanel
            versions={project.versions || []}
            onCreate={handleCreateVersion}
            onRestore={restoreVersion}
            disabled={applying || detecting}
          />
          <a href={project.current_image_url} target="_blank" rel="noreferrer" className="p-2 rounded-lg hover:bg-accent transition-colors" aria-label="Download">
            <Download className="w-5 h-5" />
          </a>
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

      {chainState && (
        <ChainProgress
          chain={chainState.chain}
          steps={chainState.steps}
          running={chainState.running}
          onCancel={() => chainRunner.cancel()}
          onDismiss={() => setChainState(null)}
        />
      )}

      <SegmentationProgress />

      <ImageCanvas
        imageUrl={project.current_image_url}
        objects={objects}
        selectedId={selected?.id}
        onSelect={(obj) => selectObject(obj.id)}
        busy={applying}
        onUndo={undo}
        onRedo={redo}
        selection={selection}
        onSelectionPointer={selectionPointer}
      />

      <SelectionToolbar
        selection={selection} brushSize={brushSize} onBrushSize={setBrushSize} onStart={startSelection}
        onMode={(mode) => updateSelection((service) => service.setMode(mode))}
        onUndo={() => updateSelection((service) => service.undo())}
        onRedo={() => updateSelection((service) => service.redo())}
        onClear={() => updateSelection((service) => service.clear())}
        onCancel={() => { selectionServiceRef.current.cancel(); selectionServiceRef.current = null; setSelection(null); }}
        onDone={finishSelection}
      />

      <PipelineStatusBar width={project.width} height={project.height} />

      <CreditsBar estimate={!pendingResult && plan?.status === 'ready' ? creditsCalculator.estimateEdit({ plan, recipe: activeRecipe }).credits : 0} />

      <AdaptivePanel title="Scene Memory"><SceneMemoryPanel project={project} /></AdaptivePanel>

      <EditorStatusBar
        objectCount={objects.length}
        selectionCount={objects.filter((o) => o.selected).length}
        selectionMode="single"
        maskedCount={objects.filter((o) => o.mask_url).length}
        segmentationStatus={segMeta?.status || (objects.length ? 'completed' : 'idle')}
        cacheStatus={segMeta ? (segMeta.fromCache ? 'hit' : 'miss') : 'empty'}
      />

      {objects.length > 0 && <AdaptivePanel title="Objects"><ObjectPanel objects={objects} onSelect={(obj) => selectObject(obj.id)} /></AdaptivePanel>}

      {objects.length === 0 ? (
        <Button onClick={detect} disabled={detecting} className="w-full h-12 rounded-2xl text-base">
          {detecting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <ScanSearch className="w-5 h-5 mr-2" />}
          {detecting ? 'Detecting objects…' : 'Detect objects'}
        </Button>
      ) : pendingResult ? (
        <ResultCompare
          beforeUrl={pendingResult.beforeUrl}
          result={pendingResult.result}
          onAccept={acceptResult}
          onDiscard={() => setPendingResult(null)}
          onRetry={retryResult}
          busy={committing}
        />
      ) : (
        <>
          <WorkspaceToolbar
            disabled={applying}
            onUse={(prompt) => { setInstruction(prompt); setActiveRecipe(null); setEditTab('prompt'); }}
          />
          <WorkspaceRecommendations
            disabled={applying}
            onUse={(prompt, recipe) => { setInstruction(prompt); setActiveRecipe(recipe); setEditTab('prompt'); }}
          />
          <AdaptiveNavigation items={EDITOR_TABS} active={editTab} onChange={setEditTab} />
          <Suspense fallback={<div className="py-8 text-center text-sm text-muted-foreground">Loading panel…</div>}>
          {editTab === 'creative' ? (
            <CreativeStudioPanel project={project} objects={objects} onApply={runChain} disabled={applying} />
          ) : editTab === 'outfits' ? (
            <OutfitPanel
              project={project}
              objects={objects}
              onCommit={async (result, outfit) => {
                await pushEditRef.current(result.image_url, `Try-On: ${outfit.name}`, result.historyEntry);
                sceneMemory.recordAcceptedEdit(project).catch((error) => console.error('[Editor] Failed to update scene memory', error));
                workspaceHistory.recordEdit(workspaceManager.activeId(), { success: true, durationMs: result.generation_time_ms || 0 });
              }}
            />
          ) : editTab === 'fashion' ? (
            <FashionPanel />
          ) : editTab === 'agent' ? (
            <AgentPanel
              project={project}
              objects={objects}
              disabled={applying}
              onCommit={async (result, task) => {
                await pushEditRef.current(result.image_url, `Agent: ${task.label}`, result.historyEntry);
                sceneMemory.recordAcceptedEdit(project).catch((error) => console.error('[Editor] Failed to update scene memory', error));
              }}
              onRollback={(url, label) => url && pushEditRef.current(url, label, { type: 'rollback', creditsUsed: 0 })}
            />
          ) : editTab === 'recipes' ? (
            <RecipePanel
              objects={objects}
              selectedObjects={objects.filter((o) => o.selected)}
              onRunChain={runChain}
              disabled={applying}
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
                instruction={instruction}
                onInstructionChange={setInstruction}
                onApply={() => applyEdit(false)}
                applying={applying}
              />
            </>
          )}
          </Suspense>
        </>
      )}
    </AdaptiveLayout>
  );
}
