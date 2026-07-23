import React from 'react';
import { Sparkles } from 'lucide-react';

export default function RecommendationList({ recommendations }) {
  if (!recommendations.length) return null;
  return <section className="rounded-2xl border border-border/60 bg-card p-5 space-y-3"><h2 className="font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4" />Upgrade suggestions</h2>{recommendations.map((item) => <div key={item.planId} className="text-sm"><span className="font-medium">{item.planId[0].toUpperCase() + item.planId.slice(1)}: </span><span className="text-muted-foreground">{item.reason}</span></div>)}</section>;
}