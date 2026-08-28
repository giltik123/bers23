import React from 'react';
import { Bot, ShieldCheck } from 'lucide-react';

export default function AgentPanel() {
  return (
    <section className="space-y-3 rounded-2xl border border-border/60 p-4">
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4" />
        <p className="text-sm font-medium">AI Agent</p>
      </div>
      <div className="rounded-xl bg-secondary/50 p-3 text-sm text-muted-foreground" role="status">
        <p className="flex items-center gap-2 font-medium text-foreground"><ShieldCheck className="h-4 w-4" />Canonical Agent execution is not enabled yet.</p>
        <p className="mt-2">
          Multi-step image edits require server-owned orchestration so every step keeps canonical Artifact lineage,
          provider reconciliation and financial authority. The legacy browser execution path is disabled.
        </p>
        <p className="mt-2">Use the Prompt tab for canonical single edits while Agent orchestration is being productionized.</p>
      </div>
    </section>
  );
}
