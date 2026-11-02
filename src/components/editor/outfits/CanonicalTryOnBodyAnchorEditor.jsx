import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import { Loader2, MapPin, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  BODY_ANCHOR_NAMES,
  manualAcquisitionErrorMessage,
} from '@/application/fashion/canonicalTryOnManualAcquisition';
import {
  normalizeManualBodyAnchorEditorSource,
  validateManualBodyAnchorDraft,
} from '@/application/fashion/canonicalTryOnManualBodyAnchorDraft';

function explicitCoordinate(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function emptyCoordinateDrafts() {
  return Object.fromEntries(BODY_ANCHOR_NAMES.map((name) => [name, { x: '', y: '' }]));
}

function anchorLabel(name, t) {
  return t('fashion.manualTryOn.anchors.' + name);
}

function bodyAnchorFeedbackMessage(feedback, t) {
  const keys = {
    unsupported_category: 'unsupported', invalid: 'unavailable', invalid_name: 'unknownName',
    invalid_point: 'invalidPoint', too_few_anchors: 'tooFew', required_anchor_missing: 'required', ready: 'ready',
  };
  return t('fashion.manualTryOn.bodyFeedback.' + (keys[feedback.code] || 'unavailable'), {
    anchors: (feedback.missing || []).map((name) => anchorLabel(name, t)).join(', '),
  });
}

export default function CanonicalTryOnBodyAnchorEditor({
  source,
  onSave,
  onSaved,
  onCancel,
  disabled = false,
}) {
  const { t } = useTranslation();
  const sourceState = useMemo(() => {
    try {
      return Object.freeze({ source: normalizeManualBodyAnchorEditorSource(source), error: '' });
    } catch {
      return Object.freeze({ source: null, error: t('fashion.manualTryOn.bodySourceUnavailable') });
    }
  }, [source, t]);
  const safeSource = sourceState.source;
  const sourceKey = safeSource
    ? `${safeSource.projectId}:${safeSource.sourceArtifactId}:${safeSource.imageUrl}:${safeSource.category}`
    : 'unavailable';

  const imageRef = useRef(null);
  const [anchors, setAnchors] = useState({});
  const [drafts, setDrafts] = useState(() => emptyCoordinateDrafts());
  const [selectedName, setSelectedName] = useState(BODY_ANCHOR_NAMES[0]);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    setAnchors({});
    setDrafts(emptyCoordinateDrafts());
    setSelectedName(safeSource?.requiredAnchors?.[0] || BODY_ANCHOR_NAMES[0]);
    setBusy(false);
    setLocked(false);
    setError('');
    setStatus('');
  }, [sourceKey]);

  const feedback = useMemo(
    () => validateManualBodyAnchorDraft(safeSource?.category, anchors),
    [safeSource?.category, anchors],
  );
  const blocked = disabled || busy || locked || !safeSource || !safeSource.supported;
  const required = new Set(safeSource?.requiredAnchors || []);

  const placeAnchor = (name, point) => {
    if (blocked || !BODY_ANCHOR_NAMES.includes(name)) return;
    setError('');
    setStatus('');
    setAnchors((current) => ({ ...current, [name]: point }));
    setDrafts((current) => ({
      ...current,
      [name]: { x: String(point[0]), y: String(point[1]) },
    }));
  };

  const placeSelectedFromImage = (event) => {
    if (blocked) return;
    const rect = imageRef.current?.getBoundingClientRect();
    if (!rect || !(rect.width > 0) || !(rect.height > 0)) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return;
    placeAnchor(selectedName, [x, y]);
  };

  const updateDraft = (name, axis, raw) => {
    if (blocked) return;
    setDrafts((current) => ({
      ...current,
      [name]: { ...current[name], [axis]: raw },
    }));
    setError('');
    setStatus('');
  };

  const applyTypedAnchor = (name) => {
    if (blocked) return;
    const x = explicitCoordinate(drafts[name]?.x);
    const y = explicitCoordinate(drafts[name]?.y);
    if (x === null || y === null) {
      setError(t('fashion.manualTryOn.explicitCoordinates', { anchor: anchorLabel(name, t) }));
      return;
    }
    placeAnchor(name, [x, y]);
  };

  const removeAnchor = (name) => {
    if (blocked) return;
    setAnchors((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
    setDrafts((current) => ({ ...current, [name]: { x: '', y: '' } }));
    setError('');
    setStatus('');
  };

  const save = async () => {
    if (blocked || !feedback.canSave || typeof onSave !== 'function') return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await onSave({
        projectId: safeSource.projectId,
        sourceArtifactId: safeSource.sourceArtifactId,
        anchors,
      });
      setLocked(true);
      setStatus(t('fashion.manualTryOn.bodyAnchorsSaved'));
      if (typeof onSaved === 'function') onSaved();
    } catch (cause) {
      setError(manualAcquisitionErrorMessage(cause, t));
    } finally {
      setBusy(false);
    }
  };

  if (!safeSource) {
    return (
      <section className="rounded-xl border border-border p-3" aria-label={t('fashion.manualTryOn.bodyAnchorEditor')}>
        <p className="text-xs text-destructive" role="alert">{sourceState.error}</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border p-3 space-y-3" aria-label={t('fashion.manualTryOn.bodyAnchorEditor')}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{t('fashion.manualTryOn.bodyAnchorsTitle')}</p>
          <p className="text-[11px] text-muted-foreground">
            {t('fashion.manualTryOn.bodyAnchorsDescription')}
          </p>
        </div>
        {typeof onCancel === 'function' && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy} aria-label={t('fashion.manualTryOn.closeBodyAnchorEditor')}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {!safeSource.supported && (
        <p className="text-xs text-destructive" role="alert">{t('fashion.manualTryOn.unsupportedCategory')}</p>
      )}

      <div
        className={`relative overflow-hidden rounded-lg border border-border bg-secondary/20 ${blocked ? 'cursor-not-allowed opacity-70' : 'cursor-crosshair'}`}
        onPointerDown={placeSelectedFromImage}
        aria-describedby="manual-body-anchor-feedback"
      >
        <img
          ref={imageRef}
          src={safeSource.imageUrl}
          alt={t('fashion.manualTryOn.projectImageAlt')}
          className="block h-auto w-full select-none"
          draggable={false}
        />
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {BODY_ANCHOR_NAMES.filter((name) => anchors[name]).map((name) => (
            <circle
              key={name}
              cx={anchors[name][0] * 100}
              cy={anchors[name][1] * 100}
              r="1.35"
              className={name === selectedName ? 'fill-primary stroke-background' : 'fill-foreground stroke-background'}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </div>

      <div className="space-y-1" aria-label={t('fashion.manualTryOn.bodyAnchorControls')}>
        {BODY_ANCHOR_NAMES.map((name) => {
          const point = anchors[name];
          const isRequired = required.has(name);
          return (
            <div key={name} className="grid grid-cols-[minmax(7rem,1fr)_1fr_1fr_auto_auto] items-center gap-1 rounded-lg bg-secondary/30 p-1.5">
              <button
                type="button"
                className={`flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-left text-[11px] ${selectedName === name ? 'bg-secondary font-medium' : ''}`}
                onClick={() => setSelectedName(name)}
                disabled={blocked}
                aria-pressed={selectedName === name}
                aria-label={t('fashion.manualTryOn.selectAnchor', { anchor: anchorLabel(name, t), requiredSuffix: isRequired ? t('fashion.manualTryOn.requiredSuffix') : '' })}
              >
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{anchorLabel(name, t)}{isRequired ? ' *' : ''}</span>
              </button>
              <Input
                type="number"
                min="0"
                max="1"
                step="any"
                inputMode="decimal"
                value={drafts[name]?.x ?? ''}
                onChange={(event) => updateDraft(name, 'x', event.target.value)}
                placeholder={t('fashion.manualTryOn.xRange')}
                aria-label={t('fashion.manualTryOn.anchorX', { anchor: anchorLabel(name, t) })}
                disabled={blocked}
              />
              <Input
                type="number"
                min="0"
                max="1"
                step="any"
                inputMode="decimal"
                value={drafts[name]?.y ?? ''}
                onChange={(event) => updateDraft(name, 'y', event.target.value)}
                placeholder={t('fashion.manualTryOn.yRange')}
                aria-label={t('fashion.manualTryOn.anchorY', { anchor: anchorLabel(name, t) })}
                disabled={blocked}
              />
              <Button type="button" variant="secondary" size="sm" onClick={() => applyTypedAnchor(name)} disabled={blocked} aria-label={t('fashion.manualTryOn.setAnchor', { anchor: anchorLabel(name, t) })}>
                {t('fashion.manualTryOn.setAnchorButton')}
              </Button>
              <button
                type="button"
                className="rounded-md p-1 text-destructive disabled:opacity-40"
                onClick={() => removeAnchor(name)}
                disabled={blocked || !point}
                aria-label={t('fashion.manualTryOn.removeAnchor', { anchor: anchorLabel(name, t) })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <div id="manual-body-anchor-feedback" className="space-y-1">
        <p className={`text-[11px] ${feedback.canSave ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-300'}`} role="status">
          {bodyAnchorFeedbackMessage(feedback, t)} {t('fashion.manualTryOn.bodyAnchorCount', { count: Object.keys(anchors).length, total: BODY_ANCHOR_NAMES.length })}
        </p>
        {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
        {status && <p className="text-xs text-muted-foreground" role="status">{status}</p>}
      </div>

      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={save} disabled={blocked || !feedback.canSave || typeof onSave !== 'function'}>
          {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
          {t('fashion.manualTryOn.saveBodyAnchors')}
        </Button>
      </div>
    </section>
  );
}
