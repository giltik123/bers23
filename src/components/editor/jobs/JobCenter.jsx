import React, { useEffect, useState } from 'react';
import { ListOrdered } from 'lucide-react';
import { jobManager } from '@/lib/jobs/jobManager';
import JobRow from '@/components/editor/jobs/JobRow';

export default function JobCenter() {
  const [state, setState] = useState(jobManager.snapshot());
  useEffect(() => jobManager.subscribe(setState), []);
  const jobs = [...state.running, ...state.queued, ...state.recent];
  if (!jobs.length) return null;
  return <section className="border border-border/60 rounded-2xl p-3 space-y-2"><div className="flex items-center justify-between"><p className="text-[11px] text-muted-foreground flex items-center gap-1.5"><ListOrdered className="w-3.5 h-3.5" />Job Center</p><button onClick={() => state.paused ? jobManager.resume() : jobManager.pause()} className="text-[11px] text-muted-foreground hover:text-foreground">{state.paused ? 'Resume queue' : 'Pause queue'}</button></div>{jobs.map((job) => <JobRow key={job.id} job={job} onCancel={(id) => jobManager.cancel(id)} onRetry={(id) => jobManager.retry(id)} onDuplicate={(id) => jobManager.duplicate(id)} onMoveUp={(id) => jobManager.reorder(id, Math.max(0, state.queued.findIndex((item) => item.id === id) - 1))} />)}</section>;
}