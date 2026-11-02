import React from 'react';
import { Check, Loader2, ChevronRight } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

// Visualizes the fixed processing flow:
// Prompt → AI Planner → Image Pipeline → Reve Adapter → Quality Check → Composer → History
const FLOW = [
  { id: 'prompt', labelKey: 'editorProgress.flow.prompt', stages: [] },
  { id: 'planner', labelKey: 'editorProgress.flow.planner', stages: [] },
  { id: 'pipeline', labelKey: 'editorProgress.flow.pipeline', stages: ['preparing', 'compiling'] },
  { id: 'reve', labelKey: 'editorProgress.flow.adapter', stages: ['generating'] },
  { id: 'quality', labelKey: 'editorProgress.flow.quality', stages: ['validating'] },
  { id: 'composer', labelKey: 'editorProgress.flow.composer', stages: ['composing'] },
  { id: 'history', labelKey: 'editorProgress.flow.history', stages: ['finalizing'] },
];

export default function PipelineFlow({ stage }) {
  const { t } = useTranslation();
  const activeIdx = FLOW.findIndex((s) => s.stages.includes(stage));
  const currentIdx = activeIdx === -1 ? 1 : activeIdx; // before first engine stage, planner is done

  return (
    <div aria-label={t('editorProgress.flowLabel')} className="flex items-center gap-1 overflow-x-auto py-1">
      {FLOW.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <React.Fragment key={step.id}>
            {i > 0 && <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground/50" />}
            <span
              aria-current={active ? 'step' : undefined}
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
              {t(step.labelKey)}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}