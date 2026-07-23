import React from 'react';
import { Check, Loader2, ChevronRight } from 'lucide-react';

// Visualizes the fixed processing flow:
// Prompt → AI Planner → Image Pipeline → Reve Adapter → Quality Check → Composer → History
const FLOW = [
  { id: 'prompt', label: 'Prompt', stages: [] },
  { id: 'planner', label: 'AI Planner', stages: [] },
  { id: 'pipeline', label: 'Image Pipeline', stages: ['preparing', 'compiling'] },
  { id: 'reve', label: 'Reve Adapter', stages: ['generating'] },
  { id: 'quality', label: 'Quality Check', stages: ['validating'] },
  { id: 'composer', label: 'Composer', stages: ['composing'] },
  { id: 'history', label: 'History', stages: ['finalizing'] },
];

export default function PipelineFlow({ stage }) {
  const activeIdx = FLOW.findIndex((s) => s.stages.includes(stage));
  const currentIdx = activeIdx === -1 ? 1 : activeIdx; // before first engine stage, planner is done

  return (
    <div className="flex items-center gap-1 overflow-x-auto py-1">
      {FLOW.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <React.Fragment key={step.id}>
            {i > 0 && <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground/50" />}
            <span
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] whitespace-nowrap border ${
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : done
                  ? 'border-border bg-accent text-foreground'
                  : 'border-border/60 text-muted-foreground'
              }`}
            >
              {done && <Check className="w-3 h-3" />}
              {active && <Loader2 className="w-3 h-3 animate-spin" />}
              {step.label}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}