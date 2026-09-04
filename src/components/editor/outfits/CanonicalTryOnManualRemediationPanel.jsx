import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, ScanLine, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  canonicalTryOnManualRemediationPolicy,
  canonicalTryOnManualSaveTransition,
} from '@/application/fashion/canonicalTryOnManualRemediationPolicy';
import CanonicalTryOnContourEditor from './CanonicalTryOnContourEditor';
import CanonicalTryOnBodyAnchorEditor from './CanonicalTryOnBodyAnchorEditor';

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
  const [editorMode, setEditorMode] = useState(null);
  const [openedPolicy, setOpenedPolicy] = useState(null);
  const [contourSource, setContourSource] = useState(null);
  const [loadingSource, setLoadingSource] = useState(false);
  const [savedState, setSavedState] = useState(null);
  const [error, setError] = useState('');

  const policyInput = useMemo(() => remediationSelection(selection), [selection]);
  const policyState = useMemo(() => {
    if (!policyInput) return Object.freeze({ policy: null, error: '' });
    try {
      return Object.freeze({
        policy: canonicalTryOnManualRemediationPolicy({ selection: policyInput, result }),
        error: '',
      });
    } catch (cause) {
      return Object.freeze({ policy: null, error: cause?.message || 'Manual Try-On remediation is unavailable.' });
    }
  }, [policyInput, result]);

  // A fresh explicit readiness result supersedes the local post-save sentinel.
  // A save clears the stale result in the Editor hook, so result=null must not
  // erase RECHECK_REQUIRED before the user actually performs that recheck.
  useEffect(() => {
    if (result?.status !== 'READINESS' && result?.status !== 'BLOCKED') return;
    setSavedState(null);
    setEditorMode(null);
    setOpenedPolicy(null);
    setContourSource(null);
    setError('');
  }, [result]);

  const livePolicy = policyState.policy;
  const remediation = savedState || livePolicy;
  if (!selection || (!remediation && !policyState.error)) return null;

  const closeEditor = () => {
    setEditorMode(null);
    setOpenedPolicy(null);
    setContourSource(null);
  };

  const markSaved = () => {
    const sourcePolicy = openedPolicy || livePolicy;
    if (!sourcePolicy?.canOpen) return;
    setSavedState(canonicalTryOnManualSaveTransition(sourcePolicy));
    closeEditor();
    setError('');
  };

  const openContour = async () => {
    if (busy || disabled || livePolicy?.mode !== 'CONTOUR' || !livePolicy.canOpen) return;
    if (typeof onLoadContourSource !== 'function') {
      setError('Manual contour source loading is unavailable.');
      return;
    }
    // Snapshot the exact policy that authorized this editor before any async
    // source load can cause parent readiness state to change.
    setOpenedPolicy(livePolicy);
    setLoadingSource(true);
    setError('');
    try {
      const source = await onLoadContourSource(livePolicy.contourRequest.garmentId);
      setContourSource(source);
      setEditorMode('CONTOUR');
    } catch (cause) {
      setOpenedPolicy(null);
      setError(cause?.message || 'Managed garment source could not be loaded for contour editing.');
    } finally {
      setLoadingSource(false);
    }
  };

  const openBodyAnchors = () => {
    if (busy || disabled || livePolicy?.mode !== 'BODY_ANCHORS' || !livePolicy.canOpen) return;
    setOpenedPolicy(livePolicy);
    setError('');
    setEditorMode('BODY_ANCHORS');
  };

  const recheck = () => {
    if (busy || disabled || typeof onRecheck !== 'function') return;
    setError('');
    onRecheck();
  };

  const bodySource = openedPolicy?.mode === 'BODY_ANCHORS'
    ? openedPolicy.bodyAnchorSource
    : null;

  return (
    <section className="rounded-xl border border-border bg-secondary/10 p-2.5 space-y-2" aria-label="Canonical Try-On manual remediation">
      {policyState.error ? (
        <p className="text-xs text-destructive" role="alert">{policyState.error}</p>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground" role="status">{remediation?.message}</p>

          {remediation?.mode === 'RECHECK_REQUIRED' && (
            <Button type="button" size="sm" variant="secondary" onClick={recheck} disabled={busy || disabled || typeof onRecheck !== 'function'}>
              {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
              Check readiness again
            </Button>
          )}

          {!savedState && livePolicy?.mode === 'CONTOUR' && !editorMode && (
            <Button type="button" size="sm" variant="secondary" onClick={openContour} disabled={busy || disabled || loadingSource}>
              {loadingSource ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ScanLine className="h-3.5 w-3.5 mr-1" />}
              {livePolicy.ambiguous ? 'Draw newer contour' : 'Draw garment contour'}
            </Button>
          )}

          {!savedState && livePolicy?.mode === 'BODY_ANCHORS' && !editorMode && (
            <Button type="button" size="sm" variant="secondary" onClick={openBodyAnchors} disabled={busy || disabled}>
              <UserRound className="h-3.5 w-3.5 mr-1" />
              {livePolicy.ambiguous ? 'Place newer body anchors' : 'Place body anchors'}
            </Button>
          )}

          {editorMode === 'CONTOUR' && contourSource && (
            <CanonicalTryOnContourEditor
              source={contourSource}
              onSave={onSaveContour}
              onSaved={markSaved}
              onReloadRequired={markSaved}
              onCancel={closeEditor}
              disabled={busy || disabled}
            />
          )}

          {editorMode === 'BODY_ANCHORS' && bodySource && (
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
