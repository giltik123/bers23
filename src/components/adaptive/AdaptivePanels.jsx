import React, { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { usePlatformProfile } from '@/lib/platform/PlatformManager';

export default function AdaptivePanel({ title, children, open = false }) {
  const profile = usePlatformProfile(); const [expanded, setExpanded] = useState(open);
  if (!profile.compact) return <section className="min-w-0 resize-y overflow-auto">{children}</section>;
  return <section className="rounded-2xl border border-border/60 overflow-hidden"><button onClick={() => setExpanded(true)} className="w-full px-3 py-2.5 flex items-center justify-between text-sm font-medium">{title}<ChevronDown className="w-4 h-4" /></button>{expanded && <div className="fixed inset-x-0 bottom-0 z-50 max-h-[75vh] overflow-y-auto rounded-t-3xl border border-border bg-background p-4 shadow-2xl"><div className="mb-3 flex items-center justify-between"><p className="font-medium">{title}</p><button onClick={() => setExpanded(false)} className="rounded-lg p-2 hover:bg-accent" aria-label={`Close ${title}`}><X className="w-4 h-4" /></button></div>{children}</div>}</section>;
}