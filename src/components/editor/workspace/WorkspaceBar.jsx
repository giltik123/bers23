import React, { useState, useEffect } from 'react';
import { ChevronDown, Wand2 } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { workspaceManager } from '@/lib/workspace/workspaceManager';
import { workspaceHistory } from '@/lib/workspace/workspaceHistory';
import { WORKSPACES, getWorkspace } from '@/lib/workspace/workspaceProfiles';
import WorkspaceIcon from '@/components/editor/workspace/WorkspaceIcon';

export default function WorkspaceBar({ projectId }) {
  const [state, setState] = useState(workspaceManager.state);
  useEffect(() => workspaceManager.subscribe(setState), []);

  const ws = getWorkspace(state.workspaceId);
  const summary = workspaceHistory.summary();

  return (
    <div className="flex items-center justify-between border border-border/60 rounded-2xl px-4 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <WorkspaceIcon name={ws.icon} className="w-4 h-4 text-primary" />
        <div className="min-w-0">
          <p className="text-sm font-medium leading-tight truncate">{ws.name}</p>
          <p className="text-[10px] text-muted-foreground truncate">{ws.tagline}</p>
        </div>
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${state.mode === 'auto' ? 'border-green-500/40 text-green-600' : 'border-border text-muted-foreground'}`}>
          {state.mode === 'auto' ? 'Auto-detected' : 'Manual'}
        </span>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-border hover:bg-accent transition-colors">
          Switch <ChevronDown className="w-3.5 h-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs">Workspaces</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => workspaceManager.select(projectId, null)} className="text-xs">
            <Wand2 className="w-3.5 h-3.5 mr-2" /> Auto-detect ({getWorkspace(state.detectedId).name})
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {WORKSPACES.map((w) => (
            <DropdownMenuItem key={w.id} onClick={() => workspaceManager.select(projectId, w.id)} className={`text-xs ${w.id === state.workspaceId ? 'bg-accent' : ''}`}>
              <WorkspaceIcon name={w.icon} className="w-3.5 h-3.5 mr-2" /> {w.name}
            </DropdownMenuItem>
          ))}
          {summary.mostUsed && (
            <>
              <DropdownMenuSeparator />
              <p className="px-2 py-1.5 text-[10px] text-muted-foreground">
                Most used: {getWorkspace(summary.mostUsed).name}
                {summary.favorite && ` · Favorite: ${getWorkspace(summary.favorite).name}`}
                {summary.averageTimeMs > 0 && ` · Avg edit ~${Math.round(summary.averageTimeMs / 1000)}s`}
              </p>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}