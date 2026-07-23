import React from 'react';
import { GARMENT_CATEGORIES } from '@/lib/fashion/garmentCategories';

export default function CategoryChips({ selected, onSelect }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
      <button
        onClick={() => onSelect(null)}
        className={`text-[11px] px-2.5 py-1 rounded-full border whitespace-nowrap transition-colors ${!selected ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'}`}
      >
        All
      </button>
      {GARMENT_CATEGORIES.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(selected === c.id ? null : c.id)}
          className={`text-[11px] px-2.5 py-1 rounded-full border whitespace-nowrap transition-colors ${selected === c.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'}`}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}