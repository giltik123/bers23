import React, { useEffect, useRef, useState } from 'react';
import { Gauge } from 'lucide-react';
import { deviceProfiler } from '@/lib/performance/deviceProfiler';
import { memoryManager } from '@/lib/performance/memoryManager';
import { previewCache } from '@/lib/performance/previewCache';
import { diskCache } from '@/lib/performance/diskCache';
import { resourceScheduler } from '@/lib/performance/resourceScheduler';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import { readPerformanceSnapshot, displayMetric, performancePolicyKey, pauseReasonKey } from './performanceSnapshot';

const sources = { deviceProfiler, memoryManager, previewCache, diskCache, resourceScheduler };

export default function PerformanceSettings() {
  const { t } = useTranslation();
  const [state, setState] = useState(null);
  const [error, setError] = useState(false);
  const previous = useRef('');

  useEffect(() => {
    let active = true;
    let inFlight = false;
    const load = async () => {
      if (!active || inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;
      try {
        const next = await readPerformanceSnapshot(sources);
        if (!active) return;
        const serialized = JSON.stringify(next);
        if (serialized !== previous.current) {
          previous.current = serialized;
          setState(next);
        }
        setError(false);
      } catch {
        if (active) setError(true);
      } finally {
        inFlight = false;
      }
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  return (
    <section className="p-4 space-y-3" aria-label={t('settings.performance')}>
      <div className="flex items-center gap-2">
        <Gauge aria-hidden="true" className="w-4 h-4" />
        <h2 className="font-medium text-sm">{t('settings.performance')}</h2>
      </div>
      {error && <p role="status" className="text-xs text-muted-foreground">{t('settings.performanceUnavailable')}</p>}
      {!state && !error && <p role="status" className="text-xs text-muted-foreground">{t('settings.loadingPerformance')}</p>}
      {state && (
        <dl className="grid grid-cols-2 gap-3 text-xs">
          <div><dt className="text-muted-foreground">{t('settings.performanceHeap')}</dt><dd className="font-medium">{displayMetric(state.memory?.usageMb)} MB</dd></div>
          <div><dt className="text-muted-foreground">{t('settings.performanceStorage')}</dt><dd className="font-medium">{displayMetric(state.diskMb)} MB</dd></div>
          <div><dt className="text-muted-foreground">{t('settings.performancePreviews')}</dt><dd className="font-medium">{displayMetric(state.cache?.entries)}</dd></div>
          <div><dt className="text-muted-foreground">{t('settings.performancePolicy')}</dt><dd className="font-medium">{t(performancePolicyKey(state.profile?.tier))}</dd></div>
        </dl>
      )}
      {state?.scheduler?.paused && (
        <p role="status" className="text-xs text-muted-foreground">{t(pauseReasonKey(state.scheduler.reason))}</p>
      )}
    </section>
  );
}
