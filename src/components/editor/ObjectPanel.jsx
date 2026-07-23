import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff, User, Car, Trees, Cloud, Shirt, Dog, Box } from 'lucide-react';

const iconFor = (label = '') => {
  const l = label.toLowerCase();
  if (/person|man|woman|people|face|hair/.test(l)) return User;
  if (/car|truck|vehicle|bike/.test(l)) return Car;
  if (/tree|plant|flower|grass/.test(l)) return Trees;
  if (/sky|cloud|background/.test(l)) return Cloud;
  if (/shirt|jacket|dress|pants|shoe|clothing|hat/.test(l)) return Shirt;
  if (/dog|cat|animal|bird/.test(l)) return Dog;
  return Box;
};

function ObjectRow({ obj, objects, depth, hidden, onToggleHidden, onSelect }) {
  const [expanded, setExpanded] = useState(true);
  const children = objects.filter((o) => o.parent_object === obj.id);
  const Icon = iconFor(obj.label);
  const isHidden = hidden.has(obj.id);
  return (
    <>
      <div
        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-sm transition-colors ${
          obj.selected ? 'bg-primary/10 text-primary' : 'hover:bg-accent'
        } ${isHidden ? 'opacity-40' : ''}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => onSelect(obj)}
      >
        {children.length > 0 ? (
          <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }} className="shrink-0">
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <span className="w-3.5" />
        )}
        <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate">{obj.label}</span>
        {obj.confidence != null && (
          <span className="text-[10px] text-muted-foreground tabular-nums">{Math.round(obj.confidence * 100)}%</span>
        )}
        <button onClick={(e) => { e.stopPropagation(); onToggleHidden(obj.id); }} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Toggle visibility">
          {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      </div>
      {expanded && children.map((c) => (
        <ObjectRow key={c.id} obj={c} objects={objects} depth={depth + 1} hidden={hidden} onToggleHidden={onToggleHidden} onSelect={onSelect} />
      ))}
    </>
  );
}

export default function ObjectPanel({ objects, onSelect }) {
  const [open, setOpen] = useState(true);
  const [hidden, setHidden] = useState(new Set());
  const roots = objects.filter((o) => !o.parent_object);

  const toggleHidden = (id) => {
    const next = new Set(hidden);
    next.has(id) ? next.delete(id) : next.add(id);
    setHidden(next);
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium">
        <span>Objects ({objects.length})</span>
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {open && (
        <div className="px-1.5 pb-2 max-h-64 overflow-y-auto">
          {roots.map((o) => (
            <ObjectRow key={o.id} obj={o} objects={objects} depth={0} hidden={hidden} onToggleHidden={toggleHidden} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}