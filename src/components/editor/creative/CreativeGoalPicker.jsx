import React from 'react';
import { CREATIVE_GOALS } from '@/lib/creative/CreativeGoals';

export default function CreativeGoalPicker({ value, onChange }) {
  return <div className="flex gap-1.5 overflow-x-auto pb-1">{CREATIVE_GOALS.map((goal) => <button key={goal.id} onClick={() => onChange(goal.id)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${value === goal.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent'}`}>{goal.label}</button>)}</div>;
}