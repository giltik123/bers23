import React, { useState, useEffect, useMemo } from 'react';
import { Bot, Loader2, Play, Pause, XCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { aiAgent } from '@/lib/agent/aiAgent';
import { executionQueue } from '@/lib/agent/executionQueue';
import { taskHistory } from '@/lib/agent/taskHistory';
import { suggestFor } from '@/lib/agent/smartSuggestions';
import ExecutionPlan from '@/components/editor/agent/ExecutionPlan';
import AgentSuggestions from '@/components/editor/agent/AgentSuggestions';
import AgentRollback from '@/components/editor/agent/AgentRollback';

export default function AgentPanel({ project, objects, disabled, onCommit, onRollback }) {
  const [request, setRequest] = useState('');
  const [planning, setPlanning] = useState(false);
  const [issues, setIssues] = useState([]);
  const [error, setError] = useState(null);
  const [queue, setQueue] = useState(executionQueue.snapshot());
  const [snapshots, setSnapshots] = useState(taskHistory.list());

  useEffect(() => executionQueue.subscribe((s) => { setQueue(s); setSnapshots(taskHistory.list()); }), []);

  const suggestions = useMemo(
    () => suggestFor(queue.tasks, objects).filter((s) => !queue.tasks.some((t) => t.label === s.task().label)),
    [queue.tasks, objects]
  );

  const createPlan = async () => {
    setPlanning(true);
    setError(null);
    try {
      const plan = await aiAgent.createPlan({ request, objects });
      setIssues(plan.issues);
      setSnapshots([]);
    } catch (e) {
      setError(e.message || 'Could not build a plan');
    } finally {
      setPlanning(false);
    }
  };

  const run = () => executionQueue.run({ project, objects, onCommit }).catch(() => {});

  const hasPlan = queue.tasks.length > 0;
  const hasRunnable = queue.tasks.some((t) => t.enabled && (t.status === 'pending'));

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Bot className="w-3.5 h-3.5" /> Describe all the edits you want in one message — the agent will build an execution plan.
        </p>
        <Textarea
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder='e.g. "Make my hair longer, remove the man behind me, change the jacket to black and make the sunset more dramatic"'
          className="min-h-[80px] text-sm"
          disabled={planning || queue.running}
        />
        <Button onClick={createPlan} disabled={disabled || planning || queue.running || !request.trim()} className="w-full rounded-xl">
          {planning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bot className="w-4 h-4 mr-2" />}
          {planning ? 'Building plan…' : hasPlan ? 'Rebuild plan' : 'Build execution plan'}
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {hasPlan && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Execution Plan</p>
            <div className="flex items-center gap-1">
              {queue.running ? (
                <>
                  {queue.paused
                    ? <Button size="sm" variant="outline" onClick={() => executionQueue.resume()}><Play className="w-3.5 h-3.5 mr-1" /> Resume</Button>
                    : <Button size="sm" variant="outline" onClick={() => executionQueue.pause()}><Pause className="w-3.5 h-3.5 mr-1" /> Pause</Button>}
                  <Button size="sm" variant="ghost" onClick={() => executionQueue.cancel()} className="text-muted-foreground"><XCircle className="w-3.5 h-3.5 mr-1" /> Cancel</Button>
                </>
              ) : (
                <>
                  <Button size="sm" onClick={run} disabled={disabled || !hasRunnable}><Play className="w-3.5 h-3.5 mr-1" /> Run</Button>
                  <Button size="sm" variant="ghost" onClick={() => { executionQueue.clear(); taskHistory.clear(); setSnapshots([]); setIssues([]); }} className="text-muted-foreground" aria-label="Clear plan"><Trash2 className="w-3.5 h-3.5" /></Button>
                </>
              )}
            </div>
          </div>

          <ExecutionPlan tasks={queue.tasks} issues={issues} running={queue.running} />
          <AgentSuggestions suggestions={suggestions} disabled={queue.running} />
          <AgentRollback snapshots={snapshots} onRollback={onRollback} disabled={queue.running || disabled} />
        </>
      )}
    </div>
  );
}