import React from 'react';
import { Layers, MousePointer, Scan, Shapes, Database } from 'lucide-react';

// Compact status strip: object/selection counters, selection mode,
// mask coverage, segmentation status and cache status.
export default function EditorStatusBar({ objectCount, selectionCount, selectionMode, maskedCount, segmentationStatus, cacheStatus }) {
  const items = [
    { icon: Shapes, label: `${objectCount} objects` },
    { icon: MousePointer, label: `${selectionCount} selected · ${selectionMode}` },
    { icon: Layers, label: `Masks ${maskedCount}/${objectCount}` },
    { icon: Scan, label: `Segmentation: ${segmentationStatus}` },
    { icon: Database, label: `Cache: ${cacheStatus}` },
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-[11px] text-muted-foreground">
      {items.map(({ icon: Icon, label }) => (
        <span key={label} className="flex items-center gap-1">
          <Icon className="w-3 h-3" /> {label}
        </span>
      ))}
    </div>
  );
}