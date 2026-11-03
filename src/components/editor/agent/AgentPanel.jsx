import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Loader2, RotateCw, ShieldCheck, SquareArrowOutUpRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import { RESIZE_MAX_DIMENSION, RESIZE_MAX_OUTPUT_PIXELS } from '@/platform/creative/deterministic/ResizeIdentity';
import { routeEditorAgentTask } from '@/application/agent/routeEditorAgentTask';

const MODES = Object.freeze([
  ['ROTATE_90_CW', 'agentUi.modeRotate90'], ['ROTATE_180', 'agentUi.modeRotate180'],
  ['ROTATE_270_CW', 'agentUi.modeRotate270'], ['FLIP_HORIZONTAL', 'agentUi.modeFlipHorizontal'],
  ['FLIP_VERTICAL', 'agentUi.modeFlipVertical'],
]);
const VIEW_STATE_LABELS = Object.freeze({
  READY: 'agentUi.ready', WAITING_FOR_LOCAL_RESULT: 'agentUi.waitingForLocalResult', RUNNING_INTERNAL: 'agentUi.runningInternal',
  SUCCESS: 'agentUi.success', FAILED: 'agentUi.failed', CANCELLED: 'agentUi.cancelled', UNKNOWN: 'agentUi.unknown',
});

export default function AgentPanel({ project, voiceProposal = null, state, busy = false, disabled = false, onStart, onRetry, onCancel, onOpenAIStudio, onOpenFashion, onOpenResize, onPreviewTransform }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState('ROTATE_90_CW');
  const [width, setWidth] = useState(project?.width ?? 1);
  const [height, setHeight] = useState(project?.height ?? 1);
  const [voiceReview,setVoiceReview]=useState(false);
  const [taskText, setTaskText] = useState('');
  const [taskDraft, setTaskDraft] = useState(null);
  const active = Boolean(state?.active);
  useEffect(()=>{setVoiceReview(false);setTaskDraft(null);},[project?.current_image_artifact_id]);
  const view = state?.view;

  useEffect(() => {
    if (active) return;
    setWidth(project?.width ?? 1);
    setHeight(project?.height ?? 1);
  }, [project?.current_image_artifact_id, project?.width, project?.height, active]);

  useEffect(()=>{
    if(!voiceProposal?.revision || active || busy || disabled ||
      voiceProposal.sourceArtifactId!==project?.current_image_artifact_id)return;
    if(voiceProposal.mode && MODES.some(([value])=>value===voiceProposal.mode) &&
      Number.isSafeInteger(voiceProposal.width) &&
      Number.isSafeInteger(voiceProposal.height)){
      setMode(voiceProposal.mode);
      setWidth(voiceProposal.width);setHeight(voiceProposal.height);
    }
    setVoiceReview(true);
  },[voiceProposal?.revision,project?.current_image_artifact_id,active,busy,disabled]);
  const validTarget = useMemo(() => Number.isSafeInteger(width) && Number.isSafeInteger(height)
    && width > 0 && height > 0 && width <= RESIZE_MAX_DIMENSION && height <= RESIZE_MAX_DIMENSION
    && width * height <= RESIZE_MAX_OUTPUT_PIXELS, [width, height]);
  const canPrepare = Boolean(project?.current_image_artifact_id) && !disabled && !busy && !active;
  const canStart = canPrepare && validTarget;
  const attemptLabel = view?.attemptStatus === 'EXPIRED' ? t('agentUi.expired') : t('agentUi.failed');
  const stepLabel = view?.nextAction?.operation === 'ORTHOGONAL_TRANSFORM'
    ? t('agentUi.runningTransform')
    : view?.nextAction?.operation === 'RESIZE'
      ? t('agentUi.runningResize')
      : view?.retryAvailable
        ? t('agentUi.retryAvailable', { attempt: attemptLabel })
        : t(VIEW_STATE_LABELS[view?.state] || 'agentUi.ready');

  const invoke = (operation) => { void Promise.resolve().then(operation).catch(() => undefined); };
  const prepareTask = () => {
    if (!canPrepare) return;
    const proposed = routeEditorAgentTask(taskText);
    setTaskDraft(proposed);
    if (proposed.kind === 'LOCAL_WORKFLOW_DRAFT') {
      setMode(proposed.mode);
      setWidth(proposed.width);
      setHeight(proposed.height);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4" />
          <div>
            <p className="text-sm font-medium">{t('agentUi.title')}</p>
            <p className="text-[11px] text-muted-foreground">{t('agentUi.subtitle')}</p>
          </div>
        </div>
        <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-label={t('agentUi.coreOwned')} />
      </div>

      {!active && <section className="space-y-3 rounded-xl border bg-card p-3" aria-label={t('agentUi.textTask')}>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t('agentUi.taskLabel')}</span>
          <textarea rows={3} maxLength={850} value={taskText}
            disabled={disabled || busy}
            placeholder={t('agentUi.taskPlaceholder')}
            onChange={(event) => { setTaskText(event.target.value); setTaskDraft(null); }}
            className="min-h-24 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm" />
        </label>
        <Button type="button" variant="outline" disabled={!canPrepare || !taskText.trim()}
          onClick={prepareTask}>{t('agentUi.prepareTask')}</Button>
        {taskDraft && <div role="status" className="space-y-2 rounded-lg border p-3 text-sm">
          <p>{t(`agentUi.${taskDraft.messageKey || 'localHint'}`)}</p>
          {taskDraft.kind === 'LOCAL_WORKFLOW_DRAFT' && <p className="text-xs text-muted-foreground">{t(MODES.find(([value]) => value === taskDraft.mode)?.[1] || 'agentUi.transform')} → {taskDraft.width} × {taskDraft.height}. {t('agentUi.localWorkflowHint')}</p>}
          {taskDraft.kind === 'RESIZE_DRAFT' && <Button type="button" disabled={!canPrepare}
            onClick={() => onOpenResize?.({ width: taskDraft.width, height: taskDraft.height })}>
            {t('agentUi.openResize', { width: taskDraft.width, height: taskDraft.height })}</Button>}
          {taskDraft.kind === 'TRANSFORM_DRAFT' && <Button type="button" disabled={!canPrepare}
            onClick={() => onPreviewTransform?.(taskDraft.mode)}>
            {t('agentUi.previewTransform')}</Button>}
          {taskDraft.kind === 'AI_STUDIO_DRAFT' && <Button type="button" disabled={!canPrepare}
            onClick={() => onOpenAIStudio?.(taskDraft.instruction)}>{t('agentUi.openAIStudio')}</Button>}
          {taskDraft.kind === 'FASHION_DRAFT' && <Button type="button" disabled={!canPrepare}
            onClick={() => onOpenFashion?.()}>{t('agentUi.openFashion')}</Button>}
        </div>}
        <p className="text-xs text-muted-foreground">{t('agentUi.textParserNote')}</p>
      </section>}

      {voiceReview&&!active&&(
        <p role="status" className="text-xs rounded-md border p-2">
          {t('agentUi.voiceReview')}
        </p>
      )}
      <div className="rounded-xl bg-secondary/50 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">{t('agentUi.fixedWorkflow')}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label={t('agentUi.workflowSteps')}>
          <span className="rounded-md border bg-background px-2 py-1">1 · {t('agentUi.stepTransform')}</span>
          <SquareArrowOutUpRight className="h-3 w-3" />
          <span className="rounded-md border bg-background px-2 py-1">2 · {t('agentUi.stepResize')}</span>
          <SquareArrowOutUpRight className="h-3 w-3" />
          <span className="rounded-md border bg-background px-2 py-1">3 · {t('agentUi.stepCoreVerify')}</span>
        </div>
        <p className="mt-2">{t('agentUi.noProviderSelection')}</p>
      </div>

      {!active && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs font-medium">{t('agentUi.transform')}</span>
            <select
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              value={mode}
              onChange={(event) => setMode(event.target.value)}
              disabled={disabled || busy}
            >
              {MODES.map(([value, labelKey]) => <option key={value} value={value}>{t(labelKey)}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">{t('agentUi.finalWidth')}</span>
            <input
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              type="number" min="1" max={RESIZE_MAX_DIMENSION} step="1" value={width}
              onChange={(event) => setWidth(Number(event.target.value))}
              disabled={disabled || busy}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">{t('agentUi.finalHeight')}</span>
            <input
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              type="number" min="1" max={RESIZE_MAX_DIMENSION} step="1" value={height}
              onChange={(event) => setHeight(Number(event.target.value))}
              disabled={disabled || busy}
            />
          </label>
          {!validTarget && <p className="text-xs text-destructive sm:col-span-2">{t('agentUi.invalidTarget')}</p>}
          <Button
            className="sm:col-span-2"
            disabled={!canStart}
            onClick={() => invoke(() => onStart?.({ mode, width, height }))}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCw className="mr-2 h-4 w-4" />}
            {t('agentUi.runWorkflow')}
          </Button>
        </div>
      )}

      {(active || busy) && (
        <div className="space-y-3 rounded-xl border bg-card p-3" role="status">
          <div className="flex items-center gap-2 text-sm">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            <span className="font-medium">{stepLabel}</span>
          </div>
          {view?.executionId && <p className="break-all text-[11px] text-muted-foreground">{t('agentUi.workflow', { id: view.executionId })}</p>}
          {view?.retryAvailable ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => invoke(() => onRetry?.())} disabled={busy}>{t('agentUi.retryExactStep')}</Button>
              <Button size="sm" variant="outline" onClick={() => invoke(() => onCancel?.())} disabled={busy}><X className="mr-1 h-3.5 w-3.5" />{t('agentUi.cancel')}</Button>
            </div>
          ) : view?.state && !['SUCCESS','FAILED','CANCELLED','UNKNOWN'].includes(view.state) ? (
            <Button size="sm" variant="outline" onClick={() => invoke(() => onCancel?.())} disabled={busy}><X className="mr-1 h-3.5 w-3.5" />{t('agentUi.cancelWorkflow')}</Button>
          ) : null}
        </div>
      )}

      {state?.error && <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">{state.error}</p>}
    </section>
  );
}