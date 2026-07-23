import React from 'react';
import { usePlatformProfile } from '@/lib/platform/PlatformManager';

export default function AdaptiveNavigation({ items, active, onChange }) { const profile = usePlatformProfile(); return <div className={`flex rounded-xl border border-border overflow-x-auto text-xs ${profile.compact ? 'w-full' : 'w-fit'}`}>{items.map((item) => <button key={item.id} onClick={() => onChange(item.id)} className={`shrink-0 px-3 py-2 ${active === item.id ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>{item.label}</button>)}</div>; }