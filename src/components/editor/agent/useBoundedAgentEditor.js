import { useCallback, useEffect, useRef, useState } from 'react';
import { createBoundedAgentRunner } from '@/application/agent/createBoundedAgentRunner';
import { encodeDeterministicRgbaPng } from '@/platform/creative/deterministic/DeterministicPng';

const HINT_PREFIX = 'bers:bounded-agent:v1:';
const EMPTY_STATE = Object.freeze({ active: false, busy: false, view: null, error: null });
const TERMINAL = new Set(['SUCCESS', 'FAILED', 'CANCELLED', 'UNKNOWN']);

export default function useBoundedAgentEditor({ project, onFinalCandidate }) {
  const mountedRef = useRef(false);
  const operationRef = useRef(null);
  const finalCallbackRef = useRef(onFinalCandidate);
  finalCallbackRef.current = onFinalCandidate;
  const [state, setState] = useState(EMPTY_STATE);

  const publishView = useCallback((view) => {
    if (!mountedRef.current) return;
    setState((previous) => Object.freeze({ ...previous, active: !TERMINAL.has(view.state), view, error: null }));
  }, []);

  const runOperation = useCallback(async (name, operation, context) => {
    if (operationRef.current) throw new Error(`Bounded Agent ${name} cannot start while ${operationRef.current} is in progress`);
    operationRef.current = name;
    if (mountedRef.current) setState((previous) => Object.freeze({ ...previous, active: true, busy: true, error: null }));
    try {
      const outcome = await operation(publishView);
      const view = outcome.view;
      if (view.state === 'SUCCESS') {
        if (!view.terminalArtifactId) throw new Error('Bounded Agent SUCCESS is missing the canonical terminal Artifact');
        if (!outcome.preview) throw new Error('Bounded Agent terminal preview is unavailable after recovery');
        const png = await encodeDeterministicRgbaPng(outcome.preview);
        const previewUrl = URL.createObjectURL(new Blob([png], { type: 'image/png' }));
        const pending = Object.freeze({
          kind: 'BOUNDED_AGENT',
          result: Object.freeze({
            finalArtifactId: view.terminalArtifactId,
            preview_url: previewUrl,
            image_url: previewUrl,
            provider: 'Bounded Agent · Local deterministic',
            credits_used: 0,
            generation_time_ms: outcome.localLatencyMs,
          }),
          instruction: `Bounded Agent · ${context.mode} → Resize ${context.width}×${context.height}`,
          beforeUrl: context.beforeUrl,
          context: Object.freeze({ mode: context.mode, width: context.width, height: context.height }),
        });
        if (!mountedRef.current) { URL.revokeObjectURL(previewUrl); return outcome; }
        setState(Object.freeze({ active: false, busy: false, view, error: null }));
        try {
          finalCallbackRef.current?.(pending);
          clearHint(project?.id);
        } catch (error) { URL.revokeObjectURL(previewUrl); throw error; }
        return outcome;
      }
      if (view.retryAvailable) {
        writeHint(project?.id, { executionId: view.executionId, sourceArtifactId: context.sourceArtifactId, mode: context.mode, width: context.width, height: context.height });
        if (mountedRef.current) setState(Object.freeze({ active: true, busy: false, view, error: null }));
        return outcome;
      }
      if (TERMINAL.has(view.state)) {
        clearHint(project?.id);
        if (mountedRef.current) setState(Object.freeze({ active: false, busy: false, view, error: terminalMessage(view) }));
        return outcome;
      }
      writeHint(project?.id, { executionId: view.executionId, sourceArtifactId: context.sourceArtifactId, mode: context.mode, width: context.width, height: context.height });
      if (mountedRef.current) setState(Object.freeze({ active: true, busy: false, view, error: null }));
      return outcome;
    } catch (error) {
      if (mountedRef.current) setState((previous) => Object.freeze({ ...previous, busy: false, error: error?.message || 'Bounded Agent failed' }));
      throw error;
    } finally {
      operationRef.current = null;
    }
  }, [project?.id, publishView]);

  const start = useCallback(async ({ mode, width, height }) => {
    const sourceArtifactId = project?.current_image_artifact_id;
    const beforeUrl = project?.current_image_url;
    if (!project?.id || !sourceArtifactId || !beforeUrl) throw new Error('Bounded Agent requires the current canonical Project IMAGE');
    const context = Object.freeze({ sourceArtifactId, beforeUrl, mode, width, height });
    const runner = createBoundedAgentRunner({ projectId: project.id });
    const clientRequestId = globalThis.crypto.randomUUID();
    writeHint(project.id, { executionId: null, sourceArtifactId, mode, width, height });
    try {
      return await runOperation('start', async (onView) => runner.start({ clientRequestId, sourceArtifactId, mode, width, height }, (view) => {
        writeHint(project.id, { executionId: view.executionId, sourceArtifactId, mode, width, height });
        onView(view);
      }), context);
    } catch (error) {
      const hint = readHint(project.id);
      if (!hint?.executionId) clearHint(project.id);
      throw error;
    }
  }, [project?.id, project?.current_image_artifact_id, project?.current_image_url, runOperation]);

  const retry = useCallback(async () => {
    const view = state.view;
    const hint = readHint(project?.id);
    if (!project?.id || !view?.executionId || !view.retryAvailable || !hint?.sourceArtifactId) throw new Error('Bounded Agent retry is not available');
    if (hint.sourceArtifactId !== project.current_image_artifact_id) throw new Error('Bounded Agent retry source is no longer the current canonical Project IMAGE');
    const context = Object.freeze({ sourceArtifactId: hint.sourceArtifactId, beforeUrl: project.current_image_url, mode: hint.mode, width: hint.width, height: hint.height });
    const runner = createBoundedAgentRunner({ projectId: project.id });
    return runOperation('retry', (onView) => runner.retry(view.executionId, onView), context);
  }, [project, runOperation, state.view]);

  const cancel = useCallback(async () => {
    const executionId = state.view?.executionId ?? readHint(project?.id)?.executionId;
    if (!project?.id || !executionId) return;
    if (operationRef.current) throw new Error(`Bounded Agent cancel cannot run while ${operationRef.current} is in progress`);
    operationRef.current = 'cancel';
    if (mountedRef.current) setState((previous) => Object.freeze({ ...previous, busy: true, error: null }));
    try {
      const view = await createBoundedAgentRunner({ projectId: project.id }).cancel(executionId);
      clearHint(project.id);
      if (mountedRef.current) setState(Object.freeze({ active: false, busy: false, view, error: null }));
      return view;
    } finally {
      operationRef.current = null;
    }
  }, [project?.id, state.view?.executionId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!project?.id || !project.current_image_artifact_id || operationRef.current) return;
    const hint = readHint(project.id);
    if (!hint?.executionId) return;
    if (hint.sourceArtifactId !== project.current_image_artifact_id) { clearHint(project.id); return; }
    const runner = createBoundedAgentRunner({ projectId: project.id });
    const context = Object.freeze({ sourceArtifactId: hint.sourceArtifactId, beforeUrl: project.current_image_url, mode: hint.mode, width: hint.width, height: hint.height });
    void runOperation('resume', (onView) => runner.resume(hint.executionId, onView), context)
      .catch(() => undefined);
  }, [project?.id, project?.current_image_artifact_id, project?.current_image_url, runOperation]);

  return Object.freeze({ state, busy: state.busy, start, retry, cancel });
}

function terminalMessage(view) {
  if (view.state === 'CANCELLED') return null;
  if (view.state === 'UNKNOWN') return 'Bounded Agent outcome is UNKNOWN and requires recovery before retry.';
  if (view.state === 'FAILED') return 'Bounded Agent workflow failed.';
  return null;
}
function hintKey(projectId) { return `${HINT_PREFIX}${String(projectId || '').trim()}`; }
function readHint(projectId) {
  if (typeof sessionStorage === 'undefined' || !projectId) return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(hintKey(projectId)) || 'null');
    if (!value || typeof value !== 'object') return null;
    const width = Number(value.width); const height = Number(value.height);
    return Object.freeze({
      executionId: typeof value.executionId === 'string' && value.executionId ? value.executionId : null,
      sourceArtifactId: typeof value.sourceArtifactId === 'string' ? value.sourceArtifactId : '',
      mode: typeof value.mode === 'string' ? value.mode : '',
      width: Number.isSafeInteger(width) && width > 0 ? width : 0,
      height: Number.isSafeInteger(height) && height > 0 ? height : 0,
    });
  } catch { return null; }
}
function writeHint(projectId, value) {
  if (typeof sessionStorage === 'undefined' || !projectId) return;
  try { sessionStorage.setItem(hintKey(projectId), JSON.stringify(value)); } catch { /* recovery hint is non-authoritative */ }
}
function clearHint(projectId) {
  if (typeof sessionStorage === 'undefined' || !projectId) return;
  try { sessionStorage.removeItem(hintKey(projectId)); } catch { /* recovery hint is non-authoritative */ }
}
