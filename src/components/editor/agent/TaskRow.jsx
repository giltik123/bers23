import React, { useState } from 'react';
import { CheckCircle2, XCircle, Loader2, Circle, SkipForward, RotateCcw, ChevronUp, ChevronDown, Pencil } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { RECIPE_LIBRARY } from '@/lib/recipes/recipeLibrary';
import { executionQueue } from '@/lib/agent/executionQueue';

const StatusIcon = ({ status }) => {
  if (status === 'done') return <CheckCircle2 className="w-4 h-4 text-green-600" />;
  if (status === 'failed') return <XCircle className="w-4 h-4 text-destructive" />;
  if (status === 'running') return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
  if (status === 'skipped') return <SkipForward className="w-4 h-4 text-muted-foreground" />;
  return <Circle className="w-4 h-4 text-muted-foreground/50" />;
};

export default function TaskRow({ task, index, total, orderLabel, running }) {
  const [editing, setEditing] = useState(false);
  const locked = running || task.status === 'done';

  return (
    <div className={`border border-border/60 rounded-xl p-3 space-y-2 ${!task.enabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-muted-foreground w-5">{orderLabel}</span>
        <StatusIcon status={task.status} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{task.label}</p>
          <p className="text-[10px] text-muted-foreground">
            {task.targetObject ? `Target: ${task.targetObject} · ` : 'Whole image · '}
            ~{task.estimatedCredits} credits · ~{Math.round(task.estimatedTime / 1000)}s
            {task.merged && ' · merged'}
            {task.dependencies.length > 0 && ` · after ${task.dependencies.length} task(s)`}
          </p>
        </div>
        <div className="flex items-center gap-0.5">
          <button disabled={locked || index === 0} onClick={() => executionQueue.move(task.id, -1)} className="p-1 rounded hover:bg-accent disabled:opacity-30" aria-label="Move up"><ChevronUp className="w-3.5 h-3.5" /></button>
          <button disabled={locked || index === total - 1} onClick={() => executionQueue.move(task.id, 1)} className="p-1 rounded hover:bg-accent disabled:opacity-30" aria-label="Move down"><ChevronDown className="w-3.5 h-3.5" /></button>
          <button disabled={locked} onClick={() => setEditing(!editing)} className="p-1 rounded hover:bg-accent disabled:opacity-30" aria-label="Edit task"><Pencil className="w-3.5 h-3.5" /></button>
          {task.status === 'failed' && <button onClick={() => executionQueue.retry(task.id)} className="p-1 rounded hover:bg-accent" aria-label="Retry"><RotateCcw className="w-3.5 h-3.5" /></button>}
          {(task.status === 'pending' || task.status === 'failed') && <button onClick={() => executionQueue.skip(task.id)} className="p-1 rounded hover:bg-accent" aria-label="Skip"><SkipForward className="w-3.5 h-3.5" /></button>}
          <Switch checked={task.enabled} disabled={locked} onCheckedChange={(v) => executionQueue.setEnabled(task.id, v)} className="ml-1 scale-75" />
        </div>
      </div>

      {task.error && <p className="text-[11px] text-destructive">{task.error}</p>}

      {editing && !locked && (
        <div className="space-y-2 pt-1">
          <select
            value={task.recipe || ''}
            onChange={(e) => executionQueue.updateTask(task.id, { recipe: e.target.value || null, type: e.target.value ? 'recipe' : 'custom' })}
            className="w-full text-xs border border-border rounded-lg px-2 py-1.5 bg-background"
          >
            <option value="">Custom prompt (no recipe)</option>
            {RECIPE_LIBRARY.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <Textarea
            value={task.customPrompt || ''}
            onChange={(e) => executionQueue.updateTask(task.id, { customPrompt: e.target.value })}
            placeholder="Editing prompt for this task"
            className="text-xs min-h-[60px]"
          />
        </div>
      )}
    </div>
  );
}