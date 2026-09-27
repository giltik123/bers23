import React, { useState, useEffect } from 'react';
import { Fingerprint, Lock, LockOpen, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { sceneMemory } from '@/lib/scene/sceneMemory';
import { styleLock } from '@/lib/scene/styleLock';
import { consistencyEngine } from '@/lib/scene/consistencyEngine';

const ROWS = [
  { key: 'style', label: 'Scene consistency' },
  { key: 'identity', label: 'Identity consistency' },
  { key: 'lighting', label: 'Lighting consistency' },
  { key: 'color', label: 'Color consistency' },
  { key: 'camera', label: 'Camera consistency' },
];

export default function SceneMemoryPanel({ project }) {
  const [state, setState] = useState(sceneMemory.state);
  const [report, setReport] = useState(consistencyEngine.lastReport);
  const [locked, setLocked] = useState(styleLock.isEnabled(project.id));
  const [open, setOpen] = useState(false);

  useEffect(() => sceneMemory.subscribe(setState), []);
  useEffect(() => consistencyEngine.subscribe(setReport), []);

  const memory = state.projectId === project.id ? state.memory : null;

  const toggleLock = (enabled) => {
    styleLock.setEnabled(project.id, enabled);
    setLocked(enabled);
  };

  return (
    <div className="border border-border/60 rounded-2xl">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-2.5">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Fingerprint className="w-4 h-4 text-primary" /> Scene Memory
        </span>
        <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {locked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
          Style Lock {locked ? 'on' : 'off'}
          {memory && ` · v${memory.fingerprint?.version || 1}`}
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-3 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span>Style Lock — preserve the original look in every edit</span>
            <Switch checked={locked} onCheckedChange={toggleLock} className="scale-75" />
          </div>

          {memory ? (
            <div className="space-y-1">
              {ROWS.map((row) => {
                const drift = report?.categories?.[row.key] === 'drift';
                return (
                  <div key={row.key} className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className={`flex items-center gap-1 ${drift ? 'text-amber-600' : 'text-green-600'}`}>
                      {drift ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                      {drift ? 'Drift risk' : 'Consistent'}
                    </span>
                  </div>
                );
              })}
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Scene fingerprint</span>
                <span className="font-mono">v{memory.fingerprint?.version || 1} · {memory.fingerprint?.hash}</span>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Scene analysis is unavailable until the server-owned Scene Profile authority is enabled.
            </p>
          )}
        </div>
      )}
    </div>
  );
}