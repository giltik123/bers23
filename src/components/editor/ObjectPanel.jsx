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
        role="group"
        aria-label={'Object ' + obj.label}
        className={[
          'flex min-h-11 items-center gap-2 rounded-xl px-2 py-1 text-sm transition-colors',
          obj.selected ? 'bg-primary/10 text-primary' : 'hover:bg-accent',
          isHidden ? 'opacity-60' : '',
        ].join(' ')}
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        {children.length > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse ' + obj.label : 'Expand ' + obj.label}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-accent"
          >
            {expanded ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
          </button>
        ) : (
          <span className="w-9 shrink-0" aria-hidden="true" />
        )}
        <button
          type="button"
          aria-pressed={Boolean(obj.selected)}
          aria-label={obj.selected ? 'Deselect ' + obj.label : 'Select ' + obj.label}
          className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left hover:bg-accent"
          onClick={() => onSelect(obj.selected ? null : obj)}
        >
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="flex-1 truncate">{obj.label}</span>
          {obj.confidence != null && <span className="text-xs tabular-nums text-muted-foreground">{Math.round(obj.confidence * 100)}%</span>}
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleHidden(obj.id); }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={isHidden ? "Show object overlay" : "Hide object overlay"}
          aria-pressed={!isHidden}
          title={isHidden ? "Show selection frame on image" : "Hide selection frame on image"}
        >
          {isHidden ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
      {expanded && children.map((c) => (
        <ObjectRow key={c.id} obj={c} objects={objects} depth={depth + 1} hidden={hidden} onToggleHidden={onToggleHidden} onSelect={onSelect} />
      ))}
    </>
  );
}

export default function ObjectPanel({ objects, onSelect, hidden, onToggleHidden }) {
  const [open, setOpen] = useState(true);
  const roots = objects.filter((o) => !o.parent_object);

  const toggleHidden = (id) => onToggleHidden(id);

  return (
    <div className="rounded-2xl border border-border/60 bg-card">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-11 w-full items-center justify-between px-4 py-2.5 text-sm font-semibold">
        <span>Objects ({objects.length})</span>
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {open && (
        <div className="px-1.5 pb-2 max-h-64 overflow-y-auto">
          <p className="px-2 pb-2 text-[11px] text-muted-foreground">Eye icons show or hide object outlines on the canvas; they do not edit the image.</p>
          {roots.map((o) => (
            <ObjectRow key={o.id} obj={o} objects={objects} depth={0} hidden={hidden} onToggleHidden={toggleHidden} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}