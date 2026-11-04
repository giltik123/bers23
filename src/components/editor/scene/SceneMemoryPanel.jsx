import React, { useState, useEffect, useId } from 'react';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import { Fingerprint, Lock, LockOpen, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { sceneMemory } from '@/lib/scene/sceneMemory';
import { styleLock } from '@/lib/scene/styleLock';
import { consistencyEngine } from '@/lib/scene/consistencyEngine';

const ROWS = [
  { key: 'style', labelKey: 'sceneUi.styleConsistency' },
  { key: 'identity', labelKey: 'sceneUi.identityConsistency' },
  { key: 'lighting', labelKey: 'sceneUi.lightingConsistency' },
  { key: 'color', labelKey: 'sceneUi.colorConsistency' },
  { key: 'camera', labelKey: 'sceneUi.cameraConsistency' },
];

export default function SceneMemoryPanel({ project }) {
  const { t } = useTranslation();
  const panelId = useId();
  const [state, setState] = useState(sceneMemory.state);
  const [report, setReport] = useState(consistencyEngine.lastReport);
  const [locked, setLocked] = useState(styleLock.isEnabled(project.id));
  const [open, setOpen] = useState(false);

  useEffect(() => sceneMemory.subscribe(setState), []);
  useEffect(() => consistencyEngine.subscribe(setReport), []);
  useEffect(() => setLocked(styleLock.isEnabled(project.id)), [project.id]);

  const memory = state.projectId === project.id ? state.memory : null;

  const toggleLock = (enabled) => {
    styleLock.setEnabled(project.id, enabled);
    setLocked(enabled);
  };

  return (
    <div className="border border-border/60 rounded-2xl">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={panelId}
        className="w-full flex items-center justify-between px-4 py-2.5">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Fingerprint className="w-4 h-4 text-primary" aria-hidden="true" /> {t('sceneUi.title')}
        </span>
        <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {locked ? <Lock className="w-3.5 h-3.5" aria-hidden="true" /> : <LockOpen className="w-3.5 h-3.5" aria-hidden="true" />}
          {t('sceneUi.styleLock')} {locked ? t('sceneUi.on') : t('sceneUi.off')}
          {memory && ` · v${memory.fingerprint?.version || 1}`}
          {open ? <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" /> : <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />}
        </span>
      </button>
      <div id={panelId} hidden={!open} className="px-4 pb-3 space-y-3">
        <p className="text-[11px] text-muted-foreground" role="note">{t('sceneUi.advisoryNotice')}</p>
        <div className="flex items-center justify-between text-xs gap-3">
          <span>{t('sceneUi.styleLockHint')}</span>
          <Switch checked={locked} onCheckedChange={toggleLock} aria-label={t('sceneUi.styleLock')} className="scale-75" />
        </div>
        {memory ? (
          <div className="space-y-1">
            {ROWS.map((row) => {
              const drift = report?.categories?.[row.key] === 'drift';
              return (
                <div key={row.key} className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">{t(row.labelKey)}</span>
                  <span className={`flex items-center gap-1 ${drift ? 'text-amber-600' : 'text-green-600'}`}>
                    {drift ? <AlertTriangle className="w-3 h-3" aria-hidden="true" /> : <CheckCircle2 className="w-3 h-3" aria-hidden="true" />}
                    {t(drift ? 'sceneUi.driftRisk' : 'sceneUi.consistent')}
                  </span>
                </div>
              );
            })}
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">{t('sceneUi.fingerprint')}</span>
              <span className="font-mono">v{memory.fingerprint?.version || 1} · {memory.fingerprint?.hash}</span>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">{t('sceneUi.unavailable')}</p>
        )}
      </div>
    </div>
  );
}
