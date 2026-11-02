import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import { Loader2, RefreshCw, ScanLine, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  canonicalTryOnManualRemediationPolicy,
  canonicalTryOnManualSaveTransition,
} from '@/application/fashion/canonicalTryOnManualRemediationPolicy';
import CanonicalTryOnContourEditor from './CanonicalTryOnContourEditor';
import CanonicalTryOnBodyAnchorEditor from './CanonicalTryOnBodyAnchorEditor';
import { manualTryOnSelectionKey, isFreshManualTryOnLoad } from '@/application/fashion/manualTryOnSelectionGuard';

function remediationMessage(remediation, t) {
  if (!remediation) return t('fashion.manualTryOn.checkReadinessFirst');
  if (remediation.mode === 'RECHECK_REQUIRED') return t('fashion.manualTryOn.savedRecheck');
  if (remediation.mode === 'CONTOUR') return t(remediation.ambiguous
    ? 'fashion.manualTryOn.ambiguousContour'
    : 'fashion.manualTryOn.contourRequired');
  if (remediation.mode === 'BODY_ANCHORS') return t(remediation.ambiguous
    ? 'fashion.manualTryOn.ambiguousBodyAnchors'
    : 'fashion.manualTryOn.bodyAnchorsRequired');
  const statusKeys = {
    READY: 'readyNoManual', SOURCE_UNAVAILABLE: 'sourceUnavailable', STALE_SOURCE: 'staleSource',
    GARMENT_UNAVAILABLE: 'garmentUnavailable', GARMENT_UNSUPPORTED: 'garmentUnsupported', EVIDENCE_INVALID: 'evidenceInvalid',
  };
  return t('fashion.manualTryOn.' + (statusKeys[remediation.readiness?.status] || 'cannotRemediate'));
}

export default function CanonicalTryOnManualRemediationPanel({
  selection,
  result,
  busy = false,
  disabled = false,
  onLoadContourSource,
  onSaveContour,
  onSaveBodyAnchors,
  onRecheck,
}) {
  const { t } = useTranslation();
  const [editorMode, setEditorMode] = useState(null);
  const [openedPolicy, setOpenedPolicy] = useState(null);
  const [contourSource, setContourSource] = useState(null);
  const [loadingSource, setLoadingSource] = useState(false);
  const [savedState, setSavedState] = useState(null);
  const [error, setError] = useState('');

  // A selected entry is meaningful only with its exact Project image, Outfit
  // revision and managed Garment. Never reuse an old editor after any change.
  const selectionKey = manualTryOnSelectionKey(selection);
  const currentSelectionKeyRef = useRef(selectionKey);
  // Commit the displayed identity before async promise callbacks can resume.
  // Do not mutate mutable refs during React rendering.
  useLayoutEffect(() => {
    currentSelectionKeyRef.current = selectionKey;
  }, [selectionKey]);
  const loadSequenceRef = useRef(0);
  const openedSelectionKeyRef = useRef(null);
  const savedSelectionKeyRef = useRef(null);

  const policyInput = useMemo(() => remediationSelection(selection), [selection]);
  const policyState = useMemo(() => {
    if (!policyInput) return Object.freeze({ policy: null, error: '' });
    try {
      return Object.freeze({
        policy: canonicalTryOnManualRemediationPolicy({ selection: policyInput, result }),
        error: '',
      });
    } catch (cause) {
      return Object.freeze({ policy: null, error: cause?.message || t('fashion.manualTryOn.remediationUnavailable') });
    }
  }, [policyInput, result, t]);

  // A fresh explicit readiness result supersedes the local post-save sentinel.
  // A save clears the stale result in the Editor hook, so result=null must not
  // erase RECHECK_REQUIRED before the user actually performs that recheck.
  useEffect(() => {
    if (result?.status !== 'READINESS' && result?.status !== 'BLOCKED') return;
    loadSequenceRef.current += 1;
    openedSelectionKeyRef.current = null;
    setLoadingSource(false);
    setSavedState(null);
    setEditorMode(null);
    setOpenedPolicy(null);
    setContourSource(null);
    setError('');
  }, [result]);

  useEffect(() => {
    // Invalidate pending garment downloads, open editors and post-save
    // acknowledgements when the current source/outfit/garment changes.
    loadSequenceRef.current += 1;
    openedSelectionKeyRef.current = null;
    savedSelectionKeyRef.current = null;
    setLoadingSource(false);
    setSavedState(null);
    setEditorMode(null);
    setOpenedPolicy(null);
    setContourSource(null);
    setError('');
  }, [selectionKey]);

  useEffect(() => () => { loadSequenceRef.current += 1; }, []);

  const livePolicy = policyState.policy;
  const remediation = savedSelectionKeyRef.current === selectionKey
    ? savedState || livePolicy : livePolicy;
  if (!selection || (!remediation && !policyState.error)) return null;

  const closeEditor = () => {
    loadSequenceRef.current += 1;
    openedSelectionKeyRef.current = null;
    setLoadingSource(false);
    setEditorMode(null);
    setOpenedPolicy(null);
    setContourSource(null);
  };

  const markSaved = () => {
    const sourcePolicy = openedPolicy || livePolicy;
    if (!sourcePolicy?.canOpen ||
      openedSelectionKeyRef.current !== currentSelectionKeyRef.current) return;
    savedSelectionKeyRef.current = currentSelectionKeyRef.current;
    setSavedState(canonicalTryOnManualSaveTransition(sourcePolicy));
    closeEditor();
    setError('');
  };

  const openContour = async () => {
    if (busy || disabled || livePolicy?.mode !== 'CONTOUR' || !livePolicy.canOpen) return;
    if (typeof onLoadContourSource !== 'function') {
      setError(t('fashion.manualTryOn.contourSourceLoadingUnavailable'));
      return;
    }
    // Snapshot the exact policy that authorized this editor before any async
    // source load can cause parent readiness state to change.
    const requestedSelectionKey = selectionKey;
    const sequence = ++loadSequenceRef.current;
    openedSelectionKeyRef.current = requestedSelectionKey;
    setOpenedPolicy(livePolicy);
    setLoadingSource(true);
    setError('');
    try {
      const source = await onLoadContourSource(livePolicy.contourRequest.garmentId);
      if (!isFreshManualTryOnLoad(sequence, loadSequenceRef.current,
        requestedSelectionKey, currentSelectionKeyRef.current)) return;
      if (source?.garmentId !== livePolicy.contourRequest.garmentId) {
        throw new Error(t('fashion.manualTryOn.contourSourceMismatch'));
      }
      setContourSource(source);
      setEditorMode('CONTOUR');
    } catch (cause) {
      if (!isFreshManualTryOnLoad(sequence, loadSequenceRef.current,
        requestedSelectionKey, currentSelectionKeyRef.current)) return;
      openedSelectionKeyRef.current = null;
      setOpenedPolicy(null);
      setError(cause?.message || t('fashion.manualTryOn.contourSourceFailed'));
    } finally {
      if (isFreshManualTryOnLoad(sequence, loadSequenceRef.current,
        requestedSelectionKey, currentSelectionKeyRef.current)) {
        setLoadingSource(false);
      }
    }
  };

  const openBodyAnchors = () => {
    if (busy || disabled || livePolicy?.mode !== 'BODY_ANCHORS' || !livePolicy.canOpen) return;
    openedSelectionKeyRef.current = selectionKey;
    setOpenedPolicy(livePolicy);
    setError('');
    setEditorMode('BODY_ANCHORS');
  };

  const recheck = () => {
    if (busy || disabled || typeof onRecheck !== 'function') return;
    setError('');
    onRecheck();
  };

  const bodySource = openedSelectionKeyRef.current === selectionKey &&
    openedPolicy?.mode === 'BODY_ANCHORS'
    ? openedPolicy.bodyAnchorSource
    : null;

  return (
    <section className="rounded-xl border border-border bg-secondary/10 p-2.5 space-y-2" aria-label={t('fashion.manualTryOn.remediationPanel')}>
      {policyState.error ? (
        <p className="text-xs text-destructive" role="alert">{policyState.error}</p>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground" role="status">{remediationMessage(remediation, t)}</p>

          {remediation?.mode === 'RECHECK_REQUIRED' && (
            <Button type="button" size="sm" variant="secondary" onClick={recheck} disabled={busy || disabled || typeof onRecheck !== 'function'}>
              {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
              {t('fashion.manualTryOn.checkReadinessAgain')}
            </Button>
          )}

          {!savedState && livePolicy?.mode === 'CONTOUR' && !editorMode && (
            <Button type="button" size="sm" variant="secondary" onClick={openContour} disabled={busy || disabled || loadingSource}>
              {loadingSource ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ScanLine className="h-3.5 w-3.5 mr-1" />}
              {t(livePolicy.ambiguous ? 'fashion.manualTryOn.drawNewerContour' : 'fashion.manualTryOn.drawGarmentContour')}
            </Button>
          )}

          {!savedState && livePolicy?.mode === 'BODY_ANCHORS' && !editorMode && (
            <Button type="button" size="sm" variant="secondary" onClick={openBodyAnchors} disabled={busy || disabled}>
              <UserRound className="h-3.5 w-3.5 mr-1" />
              {t(livePolicy.ambiguous ? 'fashion.manualTryOn.placeNewerBodyAnchors' : 'fashion.manualTryOn.placeBodyAnchors')}
            </Button>
          )}

          {openedSelectionKeyRef.current === selectionKey &&
            editorMode === 'CONTOUR' && contourSource && (
            <CanonicalTryOnContourEditor
              source={contourSource}
              onSave={onSaveContour}
              onSaved={markSaved}
              onReloadRequired={markSaved}
              onCancel={closeEditor}
              disabled={busy || disabled}
            />
          )}

          {openedSelectionKeyRef.current === selectionKey &&
            editorMode === 'BODY_ANCHORS' && bodySource && (
            <CanonicalTryOnBodyAnchorEditor
              source={bodySource}
              onSave={onSaveBodyAnchors}
              onSaved={markSaved}
              onCancel={closeEditor}
              disabled={busy || disabled}
            />
          )}
        </>
      )}

      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </section>
  );
}

function remediationSelection(value) {
  if (!value) return null;
  return Object.freeze({
    beforeUrl: value.beforeUrl,
    entryId: value.entryId,
    outfit: value.outfit,
    projectId: value.projectId,
    sourceArtifactId: value.sourceArtifactId,
  });
}
