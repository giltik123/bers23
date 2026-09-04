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
    selectionRef.current = selection;
    const host = currentHost();
    setBusy(true);
    try {
      // Host admission and controller construction happen synchronously before
      // the returned Promise yields. Publish that snapshot immediately so the
      // Outfit builder cannot remain interactive while readiness is pending.
      const operation = host[name](context);
      if (mountedRef.current) {
        setState((previous) => Object.freeze({ ...previous, selection, host: host.snapshot() }));
      }
      const result = await operation;
      publish(host, result);
      return result;
    } finally {
      if (mountedRef.current) {
        setBusy(false);
        setState((previous) => Object.freeze({ ...previous, selection: selectionRef.current, host: host.snapshot() }));
      }
    }
  }, [currentHost, publish]);

  const retry = useCallback(async () => {
    if (!selectionRef.current) throw new Error('Canonical Try-On Retry requires an active Editor selection');
    const host = currentHost();
    setBusy(true);
    try {
      const result = await host.retry();
      publish(host, result);
      return result;
    } finally {
      if (mountedRef.current) {
        setBusy(false);
        setState((previous) => Object.freeze({ ...previous, selection: selectionRef.current, host: host.snapshot() }));
      }
    }
  }, [currentHost, publish]);

  const abandon = useCallback(() => {
    const host = currentHost();
    host.abandon();
    if (!mountedRef.current) return;
    setState(Object.freeze({ selection: selectionRef.current, result: null, host: host.snapshot() }));
  }, [currentHost]);

  const close = useCallback(() => {
    const host = currentHost();
    host.release();
    selectionRef.current = null;
    if (!mountedRef.current) return;
    setState(Object.freeze({ selection: null, result: null, host: host.snapshot() }));
  }, [currentHost]);

  useEffect(() => {
    mountedRef.current = true;
    const host = currentHost();
    return () => {
      mountedRef.current = false;
      host.requestDispose();
    };
  }, [currentHost]);

  return Object.freeze({ state, busy, dispatch, retry, abandon, close });
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
