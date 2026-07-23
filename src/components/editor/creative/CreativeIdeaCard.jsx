import React from 'react';
import { Sparkles } from 'lucide-react';

export default function CreativeIdeaCard({ idea, active, onSelect }) {
  return <button onClick={() => onSelect(idea)} className={`w-full rounded-xl border p-3 text-left transition-colors ${active ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-primary/50'}`}><div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /><span className="flex-1 text-sm font-medium">{idea.title}</span><span className="text-[10px] text-muted-foreground">{idea.emphasis}</span></div><p className="mt-1 text-xs text-muted-foreground">{idea.description}</p></button>;
}