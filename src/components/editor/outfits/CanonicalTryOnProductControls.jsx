import React, { useMemo } from 'react';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import { Loader2, Play, RefreshCw, RotateCcw, Search, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { canonicalTryOnProductUiState } from '@/application/fashion/canonicalTryOnProductUiState';

const TRY_ON_MESSAGE_KEYS = Object.freeze({
  UNCHECKED: 'tryOnUnchecked',
  UNCERTAIN: 'tryOnUncertain',
  READY: 'tryOnReady',
  SOURCE_UNAVAILABLE: 'tryOnSourceUnavailable',
  STALE_SOURCE: 'tryOnStaleSource',
  GARMENT_UNAVAILABLE: 'tryOnGarmentUnavailable',
  GARMENT_UNSUPPORTED: 'tryOnGarmentUnsupported',
  REPRESENTATION_REQUIRED: 'tryOnRepresentationRequired',
  REPRESENTATION_AMBIGUOUS: 'tryOnRepresentationAmbiguous',
  BODY_ANCHORS_REQUIRED: 'tryOnBodyAnchorsRequired',
  BODY_ANCHORS_AMBIGUOUS: 'tryOnBodyAnchorsAmbiguous',
  EVIDENCE_INVALID: 'tryOnEvidenceInvalid',
  WARP_PENDING: 'tryOnWarpPending',
  TEXTURE_NOT_EXECUTED: 'tryOnTextureNotExecuted',
  TEXTURE_NOT_PREPARED: 'tryOnTextureNotPrepared',
  TEXTURE_PENDING: 'tryOnTexturePending',
  TEXTURE_FAILED: 'tryOnTextureFailed',
  TEXTURE_STALE: 'tryOnTextureStale',
});

function tryOnMessageKey(ui) {
  const status = ui.status === 'READINESS' || ui.status === 'BLOCKED'
    ? ui.readiness?.status
    : ui.status;
  const key = TRY_ON_MESSAGE_KEYS[status];
  if (!key) throw new Error('Canonical Try-On status cannot be translated.');
  return `fashionUi.${key}`;
}

export default function CanonicalTryOnProductControls({
  garmentLabel,
  result = null,
  host,
  busy = false,
  disabled = false,
  onInspect,
  onRun,
  onResume,
  onRecover,
  onAbandon,
  onClose,
}) {
  const { t } = useTranslation();
  const ui = useMemo(
    () => canonicalTryOnProductUiState({ result, host, busy, disabled }),
    [result, host, busy, disabled],
  );

  return (
    <section className="rounded-xl border border-border bg-background/70 p-2.5 space-y-2" aria-label={t('fashionUi.controlsLabel')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium truncate">{t('fashionUi.deterministicTryOn')}{garmentLabel ? ` · ${garmentLabel}` : ''}</p>
          <p className="text-[10px] text-muted-foreground" role="status">{t(tryOnMessageKey(ui))}</p>
        </div>
        {typeof onClose === 'function' && !ui.hasInFlight && (
          <Button type="button" variant="ghost" size="sm" className="h-7 text-[10px]" onClick={onClose} disabled={busy}>
            {t('fashionUi.close')}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button type="button" variant="secondary" size="sm" className="h-8 text-xs" onClick={onInspect} disabled={!ui.canInspect || typeof onInspect !== 'function'}>
          {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Search className="h-3.5 w-3.5 mr-1" />}
          {t('fashionUi.checkReadiness')}
        </Button>

        <Button type="button" size="sm" className="h-8 text-xs" onClick={onRun} disabled={!ui.canRun || typeof onRun !== 'function'}>
          <Play className="h-3.5 w-3.5 mr-1" /> {t('fashionUi.run')}
        </Button>

        {ui.hasInFlight && (
          <>
            <Button type="button" variant="secondary" size="sm" className="h-8 text-xs" onClick={onResume} disabled={!ui.canResume || typeof onResume !== 'function'}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> {t('fashionUi.resume')}
            </Button>
            <Button type="button" variant="secondary" size="sm" className="h-8 text-xs" onClick={onRecover} disabled={!ui.canRecover || typeof onRecover !== 'function'}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> {t('fashionUi.recover')}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={onAbandon} disabled={!ui.canAbandon || typeof onAbandon !== 'function'}>
              <Square className="h-3.5 w-3.5 mr-1" /> {t('fashionUi.abandon')}
            </Button>
          </>
        )}
      </div>

      {ui.readiness && ui.readiness.status !== 'READY' && (
        <p className="text-[10px] text-amber-700 dark:text-amber-300">
          {t('fashionUi.readinessRunDisabled')}
        </p>
      )}
    </section>
  );
}
