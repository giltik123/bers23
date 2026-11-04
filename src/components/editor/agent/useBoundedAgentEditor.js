import { useCallback, useEffect, useRef, useState } from 'react';
import { CONFIGURED_CORE_API_ROOT, resolveCoreResourceUrl } from '@/api/coreResourceUrl';
import { createBoundedAgentRunner } from '@/application/agent/createBoundedAgentRunner';
import { encodeDeterministicRgbaPng } from '@/platform/creative/deterministic/DeterministicPng';
import { createBoundedAgentContextGate } from './boundedAgentContextGate';
import { clearHintForSource, readHint, writeHint } from './sessionHintStorage.js';

const EMPTY_STATE = Object.freeze({ active: false, busy: false, view: null, error: null });
const TERMINAL = new Set(['SUCCESS', 'FAILED', 'CANCELLED', 'UNKNOWN']);
const TERMINAL_DELIVERY_PREFIX = '/api/core/artifacts/results/';

export default function useBoundedAgentEditor({ project, onFinalCandidate }) {
  const mountedRef = useRef(false);
  // Locks are scoped to the canonical Project/source, so an old workflow
  // cannot block recovery or a new operation in a different Project.
  const operationRef = useRef(new Map());
  const contextGateRef = useRef(null);
  if (!contextGateRef.current) contextGateRef.current = createBoundedAgentContextGate(project?.id, project?.current_image_artifact_id);
  // Invalidate stale callbacks during render, before route-change effects run.
  contextGateRef.current.sync(project?.id, project?.current_image_artifact_id);
  const contextKey = JSON.stringify([project?.id ?? null, project?.current_image_artifact_id ?? null]);
  const finalCallbackRef = useRef(onFinalCandidate);
  finalCallbackRef.current = onFinalCandidate;
  const [state, setState] = useState(EMPTY_STATE);
  const stateOwnerRef = useRef(contextKey);
  // Do not render the previous Project's workflow even for the first paint
  // before the route-change cleanup effect can reset React state.
  const visibleState = stateOwnerRef.current === contextKey ? state : EMPTY_STATE;

  // Recheck inside React's queued state updater as well as at dispatch time.
  // A route change can occur between enqueue and commit.
  const publishScopedState = useCallback((ticket, update) => {
    if (!mountedRef.current || !contextGateRef.current.isCurrent(ticket)) return;
    setState((previous) => contextGateRef.current.isCurrent(ticket)
      ? (typeof update === 'function' ? update(previous) : update)
      : previous);
  }, []);

  const publishView = useCallback((view, ticket) => {
    publishScopedState(ticket, (previous) => Object.freeze({
      ...previous, active: !TERMINAL.has(view.state), view, error: null,
    }));
  }, [publishScopedState]);

  const runOperation = useCallback(async (name, operation, context) => {
    const ticket = contextGateRef.current.capture(project?.id, context.sourceArtifactId);
    if (!ticket) throw new Error('Bounded Agent Project or source changed before execution');
    const lockKey = JSON.stringify([ticket.projectId, ticket.sourceArtifactId]);
    const activeOperation = operationRef.current.get(lockKey);
    if (activeOperation) throw new Error(`Bounded Agent ${name} cannot start while ${activeOperation} is in progress`);
    operationRef.current.set(lockKey, name);
    publishScopedState(ticket, (previous) => Object.freeze({ ...previous, active: true, busy: true, error: null }));
    try {
      const outcome = await operation((view) => publishView(view, ticket), ticket);
      // The old Core workflow may finish, but it must never replace the new
      // Project's Agent state or publish a FINAL candidate in its Editor.
      if (!contextGateRef.current.isCurrent(ticket)) return outcome;
      const view = outcome.view;
      if (view.state === 'SUCCESS') {
        if (!view.terminalArtifactId) throw new Error('Bounded Agent SUCCESS is missing the canonical terminal Artifact');
        const previewUrl = await terminalPreviewUrl(view, outcome.preview);
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
        if (!mountedRef.current || !contextGateRef.current.isCurrent(ticket)) {
          revokeBlob(previewUrl);
          return outcome;
        }
        publishScopedState(ticket, Object.freeze({ active: false, busy: false, view, error: null }));
        writeHint(project?.id, { executionId: view.executionId, sourceArtifactId: context.sourceArtifactId, mode: context.mode, width: context.width, height: context.height });
        try { finalCallbackRef.current?.(pending); }
        catch (error) { revokeBlob(previewUrl); throw error; }
        return outcome;
      }
      if (view.retryAvailable) {
        writeHint(project?.id, { executionId: view.executionId, sourceArtifactId: context.sourceArtifactId, mode: context.mode, width: context.width, height: context.height });
        publishScopedState(ticket, Object.freeze({ active: true, busy: false, view, error: null }));
        return outcome;
      }
      if (TERMINAL.has(view.state)) {
        clearHintForSource(project?.id, ticket.sourceArtifactId, view.executionId);
        publishScopedState(ticket, Object.freeze({ active: false, busy: false, view, error: terminalMessage(view) }));
        return outcome;
      }
      writeHint(project?.id, { executionId: view.executionId, sourceArtifactId: context.sourceArtifactId, mode: context.mode, width: context.width, height: context.height });
      publishScopedState(ticket, Object.freeze({ active: true, busy: false, view, error: null }));
      return outcome;
    } catch (error) {
      publishScopedState(ticket, (previous) => Object.freeze({ ...previous, busy: false, error: error?.message || 'Bounded Agent failed' }));
      throw error;
    } finally {
      operationRef.current.delete(lockKey);
    }
  }, [project?.id, publishView, publishScopedState]);

  const start = useCallback(async ({ mode, width, height }) => {
    const sourceArtifactId = project?.current_image_artifact_id;
    const beforeUrl = project?.current_image_url;
    if (!project?.id || !sourceArtifactId || !beforeUrl) throw new Error('Bounded Agent requires the current canonical Project IMAGE');
    const context = Object.freeze({ sourceArtifactId, beforeUrl, mode, width, height });
    const runner = createBoundedAgentRunner({ projectId: project.id });
    const clientRequestId = globalThis.crypto.randomUUID();
    // Only touch the recovery hint after the per-source operation lock is
    // acquired. A duplicate start must not erase the first run's hint.
    return runOperation('start', async (onView, ticket) => {
      if (contextGateRef.current.isCurrent(ticket)) {
        writeHint(project.id, { executionId: null, sourceArtifactId, mode, width, height });
      }
      try {
        return await runner.start({ clientRequestId, sourceArtifactId, mode, width, height }, (view) => {
          if (contextGateRef.current.isCurrent(ticket)) {
            writeHint(project.id, { executionId: view.executionId, sourceArtifactId, mode, width, height });
          }
          onView(view);
        });
      } catch (error) {
        const hint = readHint(project.id);
        if (contextGateRef.current.isCurrent(ticket) && !hint?.executionId) {
          clearHintForSource(project.id, sourceArtifactId);
        }
        throw error;
      }
    }, context);
  }, [project?.id, project?.current_image_artifact_id, project?.current_image_url, runOperation]);

  const retry = useCallback(async () => {
    const view = visibleState.view;
    const hint = readHint(project?.id);
    if (!project?.id || !view?.executionId || !view.retryAvailable || !hint?.sourceArtifactId) throw new Error('Bounded Agent retry is not available');
    if (hint.sourceArtifactId !== project.current_image_artifact_id) throw new Error('Bounded Agent retry source is no longer the current canonical Project IMAGE');
    const context = Object.freeze({ sourceArtifactId: hint.sourceArtifactId, beforeUrl: project.current_image_url, mode: hint.mode, width: hint.width, height: hint.height });
    const runner = createBoundedAgentRunner({ projectId: project.id });
    return runOperation('retry', (onView) => runner.retry(view.executionId, onView), context);
  }, [project, runOperation, visibleState.view]);

  const cancel = useCallback(async () => {
    const executionId = visibleState.view?.executionId ?? readHint(project?.id)?.executionId;
    if (!project?.id || !executionId) return;
    const ticket = contextGateRef.current.capture(project?.id, project?.current_image_artifact_id);
    if (!ticket) throw new Error('Bounded Agent Project or source changed before cancellation');
    const lockKey = JSON.stringify([ticket.projectId, ticket.sourceArtifactId]);
    const activeOperation = operationRef.current.get(lockKey);
    if (activeOperation) throw new Error(`Bounded Agent cancel cannot run while ${activeOperation} is in progress`);
    operationRef.current.set(lockKey, 'cancel');
    publishScopedState(ticket, (previous) => Object.freeze({ ...previous, busy: true, error: null }));
    try {
      const view = await createBoundedAgentRunner({ projectId: project.id }).cancel(executionId);
      clearHintForSource(project.id, ticket.sourceArtifactId, executionId);
      publishScopedState(ticket, Object.freeze({ active: false, busy: false, view, error: null }));
      return view;
    } catch (error) {
      // A failed cancellation is not a cancellation: keep the durable hint and
      // leave the workflow recoverable while releasing the UI busy state.
      publishScopedState(ticket, (previous) => Object.freeze({
        ...previous,
        busy: false,
        error: error?.message || 'Bounded Agent cancellation failed',
      }));
      throw error;
    } finally {
      operationRef.current.delete(lockKey);
    }
  }, [project?.id, project?.current_image_artifact_id, visibleState.view?.executionId, publishScopedState]);

  const dismiss = useCallback(() => {
    const ticket = contextGateRef.current.capture(project?.id, project?.current_image_artifact_id);
    if (ticket) {
      clearHintForSource(ticket.projectId, ticket.sourceArtifactId, visibleState.view?.executionId ?? null);
    }
    if (mountedRef.current && (!ticket || contextGateRef.current.isCurrent(ticket))) setState(EMPTY_STATE);
  }, [project?.id, project?.current_image_artifact_id, visibleState.view?.executionId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // An old Project's progress, retry or error must not remain visible after
  // navigation or after a new canonical source becomes current.
  useEffect(() => {
    stateOwnerRef.current = contextKey;
    setState(EMPTY_STATE);
  }, [contextKey]);

  useEffect(() => {
    if (!project?.id || !project.current_image_artifact_id || operationRef.current.has(contextKey)) return;
    const hint = readHint(project.id);
    if (!hint?.executionId) return;
    if (hint.sourceArtifactId !== project.current_image_artifact_id) { clearHintForSource(project.id, hint.sourceArtifactId, hint.executionId); return; }
    const runner = createBoundedAgentRunner({ projectId: project.id });
    const context = Object.freeze({ sourceArtifactId: hint.sourceArtifactId, beforeUrl: project.current_image_url, mode: hint.mode, width: hint.width, height: hint.height });
    void runOperation('resume', (onView) => runner.resume(hint.executionId, onView), context)
      .catch(() => undefined);
  }, [project?.id, project?.current_image_artifact_id, project?.current_image_url, runOperation]);

  return Object.freeze({ state: visibleState, busy: visibleState.busy, start, retry, cancel, dismiss });
}

async function terminalPreviewUrl(view, localPreview) {
  if (localPreview) {
    const png = await encodeDeterministicRgbaPng(localPreview);
    return URL.createObjectURL(new Blob([png], { type: 'image/png' }));
  }
  const delivery = view?.terminalImageUrl;
  if (typeof delivery !== 'string' || !delivery.startsWith(TERMINAL_DELIVERY_PREFIX)) throw new Error('Bounded Agent terminal preview delivery is unavailable after recovery');
  return resolveCoreResourceUrl(delivery, CONFIGURED_CORE_API_ROOT);
}
function revokeBlob(value) { if (typeof value === 'string' && value.startsWith('blob:')) URL.revokeObjectURL(value); }
function terminalMessage(view) {
  if (view.state === 'CANCELLED') return null;
  if (view.state === 'UNKNOWN') return 'Bounded Agent outcome is UNKNOWN and requires recovery before retry.';
  if (view.state === 'FAILED') return 'Bounded Agent workflow failed.';
  return null;
}
