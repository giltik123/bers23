import React, { useEffect, useRef, useState } from 'react';
import { Gauge } from 'lucide-react';
import { deviceProfiler } from '@/lib/performance/deviceProfiler';
import { memoryManager } from '@/lib/performance/memoryManager';
import { previewCache } from '@/lib/performance/previewCache';
import { diskCache } from '@/lib/performance/diskCache';
import { performanceMonitor } from '@/lib/performance/performanceMonitor';
import { resourceScheduler } from '@/lib/performance/resourceScheduler';

export default function PerformanceSettings() {
  const [state, setState] = useState({}); const previous = useRef('');
  useEffect(() => { let active = true; const load = async () => { if (document.visibilityState !== 'visible') return; const next = { profile: deviceProfiler.snapshot(), memory: memoryManager.snapshot(), cache: previewCache.snapshot(), diskMb: await diskCache.usage(), performance: performanceMonitor.snapshot(), scheduler: resourceScheduler.snapshot() }; const serialized = JSON.stringify(next); if (active && serialized !== previous.current) { previous.current = serialized; setState(next); } }; load(); const timer = window.setInterval(load, 5000); return () => { active = false; window.clearInterval(timer); }; }, []);
  return <div className="p-4 space-y-3"><div className="flex items-center gap-2"><Gauge className="w-4 h-4" /><p className="font-medium text-sm">Performance</p></div><div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground"><p>Memory: {state.memory?.usageMb ?? '—'} MB</p><p>Cache: {state.diskMb ?? '—'} MB</p><p>Queue cache: {state.cache?.entries ?? 0}</p><p>Render: {state.performance?.averageRenderMs ?? 0} ms</p><p>Device: {state.profile?.ramGb ?? '—'} GB RAM</p><p>Mode: {state.profile?.tier || 'balanced'}</p></div>{state.scheduler?.paused && <p className="text-xs text-muted-foreground">Heavy work is paused to protect {state.scheduler.reason === 'battery' ? 'battery' : 'memory'}.</p>}</div>;
}