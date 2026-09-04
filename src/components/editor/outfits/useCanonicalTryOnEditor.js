import { useCallback, useEffect, useRef, useState } from 'react';
import { encodeDeterministicRgbaPng } from '@/platform/creative/deterministic/DeterministicPng';
import { createCanonicalTryOnProductRuntime } from '@/application/fashion/createCanonicalTryOnProductRuntime';
import { createCanonicalTryOnEditorController } from '@/application/fashion/createCanonicalTryOnEditorController';
import { createCanonicalTryOnEditorHost } from '@/application/fashion/createCanonicalTryOnEditorHost';
import { createTryOnEditorFinalHandoff } from '@/application/fashion/createTryOnEditorFinalHandoff';

const IDLE_HOST = Object.freeze({ active: false, busy: false, disposed: false, hasInFlight: false, phase: 'IDLE' });
const EMPTY_STATE = Object.freeze({ selection: null, result: null, host: IDLE_HOST });
const ACTIONS = new Set(['inspect', 'run', 'resume', 'recover']);

export default function useCanonicalTryOnEditor({ onFinalCandidate }) {
  const mountedRef = useRef(false);
  const finalCallbackRef = useRef(onFinalCandidate);
  finalCallbackRef.current = onFinalCandidate;
  const selectionRef = useRef(null);
  const hostRef = useRef(null);
  const operationRef = useRef(null);
  const disposeAfterOperationRef = useRef(false);
  const [state, setState] = useState(EMPTY_STATE);
  const [busy, setBusy] = useState(false);

  const createHost = useCallback(() => {
    const handoff = createTryOnEditorFinalHandoff({
      encodePreviewPng: encodeDeterministicRgbaPng,
      createBlobUrl: async (png) => URL.createObjectURL(new Blob([png], { type: 'image/png' })),
    });
    return createCanonicalTryOnEditorHost({
      createController: ({ selection, beforeUrl }) => createCanonicalTryOnEditorController({
        selection,
        beforeUrl,
        createRuntime: createCanonicalTryOnProductRuntime,
        handoff,
      }),
    });
  }, []);

  const currentHost = useCallback(() => {
    const current = hostRef.current;
    if (current && current.snapshot().disposed !== true) return current;
    const next = createHost();
    hostRef.current = next;
    return next;
  }, [createHost]);

  const beginOperation = useCallback((name) => {
    if (operationRef.current) {
      throw new Error(`Canonical Try-On Editor ${name} cannot start while ${operationRef.current} is in progress`);
    }
    operationRef.current = name;
    if (mountedRef.current) setBusy(true);
  }, []);

  const finishOperation = useCallback((host, { clearResult = false } = {}) => {
    operationRef.current = null;
    if (!mountedRef.current) {
      if (disposeAfterOperationRef.current) {
        disposeAfterOperationRef.current = false;
        host.requestDispose();
      }
      return;
    }
    setBusy(false);
    setState((previous) => Object.freeze({
      ...previous,
      selection: selectionRef.current,
      ...(clearResult ? { result: null } : {}),
      host: host.snapshot(),
    }));
  }, []);

  const publishAdmission = useCallback((host, selection) => {
    if (!mountedRef.current) return;
    setState((previous) => Object.freeze({ ...previous, selection, host: host.snapshot() }));
  }, []);

  const publish = useCallback((host, result) => {
    const snapshot = host.snapshot();
    if (!mountedRef.current) {
      revokeFinalCandidate(result);
      return;
    }
    if (result?.status === 'FINAL_CANDIDATE') {
      setState(Object.freeze({ selection: selectionRef.current, result: null, host: snapshot }));
      try {
        finalCallbackRef.current?.(result.pendingResult);
      } catch (error) {
        revokePending(result.pendingResult);
        throw error;
      }
      return;
    }
    setState(Object.freeze({ selection: selectionRef.current, result, host: snapshot }));
  }, []);

  const dispatch = useCallback(async (name, context) => {
    if (!ACTIONS.has(name)) throw new Error('Unknown canonical Try-On Editor action');
    const selection = projectSelection(context);
    const host = currentHost();
    beginOperation(name);
    selectionRef.current = selection;
    try {
      // Host admission and controller construction happen synchronously before
      // the returned Promise yields. Publish that snapshot immediately so the
      // Outfit builder cannot remain interactive while readiness is pending.
      const operation = host[name](context);
      publishAdmission(host, selection);
      const result = await operation;
      publish(host, result);
      return result;
    } finally {
      finishOperation(host);
    }
  }, [beginOperation, currentHost, finishOperation, publish, publishAdmission]);

  const retry = useCallback(async () => {
    if (!selectionRef.current) throw new Error('Canonical Try-On Retry requires an active Editor selection');
    const host = currentHost();
    beginOperation('retry');
    try {
      const result = await host.retry();
      publish(host, result);
      return result;
    } finally {
      finishOperation(host);
    }
  }, [beginOperation, currentHost, finishOperation, publish]);

  const loadManualGarmentSource = useCallback(async (context, garmentId) => {
    const selection = projectSelection(context);
    const host = currentHost();
    beginOperation('manual-source-load');
    selectionRef.current = selection;
    try {
      const manual = host.manual(context);
      publishAdmission(host, selection);
      return await manual.loadGarmentSource(garmentId);
    } finally {
      finishOperation(host);
    }
  }, [beginOperation, currentHost, finishOperation, publishAdmission]);

  const saveManualContour = useCallback(async (context, value) => {
    const selection = projectSelection(context);
    const host = currentHost();
    beginOperation('manual-contour-save');
    selectionRef.current = selection;
    let invalidateReadiness = false;
    try {
      const manual = host.manual(context);
      publishAdmission(host, selection);
      const result = await manual.saveContour(value);
      invalidateReadiness = true;
      return result;
    } catch (error) {
      if (error?.code === 'TRYON_MANUAL_CONTOUR_SAVED_RELOAD_PENDING') {
        // Core accepted the contour before the minimized source reload failed.
        // The old readiness is invalid even though this error must propagate so
        // the contour editor locks and requires reload/recheck rather than retry.
        invalidateReadiness = true;
      }
      throw error;
    } finally {
      finishOperation(host, { clearResult: invalidateReadiness });
    }
  }, [beginOperation, currentHost, finishOperation, publishAdmission]);

  const saveManualBodyAnchors = useCallback(async (context, value) => {
    const selection = projectSelection(context);
    const host = currentHost();
    beginOperation('manual-body-anchor-save');
    selectionRef.current = selection;
    let invalidateReadiness = false;
    try {
      const manual = host.manual(context);
      publishAdmission(host, selection);
      const result = await manual.saveBodyAnchors(value);
      invalidateReadiness = true;
      return result;
    } finally {
      finishOperation(host, { clearResult: invalidateReadiness });
    }
  }, [beginOperation, currentHost, finishOperation, publishAdmission]);

  const abandon = useCallback(() => {
    if (operationRef.current) throw new Error(`Canonical Try-On Editor abandon cannot run while ${operationRef.current} is in progress`);
    const host = currentHost();
    host.abandon();
    if (!mountedRef.current) return;
    setState(Object.freeze({ selection: selectionRef.current, result: null, host: host.snapshot() }));
  }, [currentHost]);

  const close = useCallback(() => {
    if (operationRef.current) throw new Error(`Canonical Try-On Editor close cannot run while ${operationRef.current} is in progress`);
    const host = currentHost();
    host.release();
    selectionRef.current = null;
    if (!mountedRef.current) return;
    setState(Object.freeze({ selection: null, result: null, host: host.snapshot() }));
  }, [currentHost]);

  useEffect(() => {
    mountedRef.current = true;
    disposeAfterOperationRef.current = false;
    const host = currentHost();
    return () => {
      mountedRef.current = false;
      if (operationRef.current) {
        disposeAfterOperationRef.current = true;
        return;
      }
      host.requestDispose();
    };
  }, [currentHost]);

  return Object.freeze({
    state,
    busy,
    dispatch,
    retry,
    loadManualGarmentSource,
    saveManualContour,
    saveManualBodyAnchors,
    abandon,
    close,
  });
}

function projectSelection(context) {
  const selection = context?.selection;
  const outfit = selection?.outfit;
  if (!selection || !outfit) throw new Error('Canonical Try-On Editor hook requires a product selection');
  return Object.freeze({
    projectId: selection.projectId,
    sourceArtifactId: selection.sourceArtifactId,
    outfitId: outfit.id,
    outfitRevision: outfit.revision,
    outfit,
    entryId: selection.entryId,
    beforeUrl: context.beforeUrl,
  });
}

function revokeFinalCandidate(result) {
  if (result?.status === 'FINAL_CANDIDATE') revokePending(result.pendingResult);
}

function revokePending(pending) {
  const preview = pending?.result?.preview_url;
  if (typeof preview === 'string' && preview.startsWith('blob:')) URL.revokeObjectURL(preview);
}
