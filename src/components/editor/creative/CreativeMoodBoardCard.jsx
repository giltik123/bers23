import React from 'react';
import { Palette } from 'lucide-react';

export default function CreativeMoodBoardCard({ board }) {
  return <div className="rounded-xl border border-border/60 p-3"><div className="flex items-center gap-2"><Palette className="w-4 h-4 text-primary" /><p className="text-sm font-medium">{board.name}</p></div><p className="mt-2 text-[11px] text-muted-foreground">{board.lighting} · {board.composition}</p><div className="mt-2 flex flex-wrap gap-1">{board.palette.slice(0, 3).map((color) => <span key={color} className="rounded-full bg-secondary px-2 py-0.5 text-[10px]">{color}</span>)}</div></div>;
}