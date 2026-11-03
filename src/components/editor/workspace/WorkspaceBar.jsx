import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
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
  const { t } = useTranslation();
  const [state, setState] = useState(workspaceManager.state);
  useEffect(() => workspaceManager.subscribe(setState), []);

  const ws = getWorkspace(state.workspaceId);
  const summary = workspaceHistory.summary();
  const workspaceName = (id) => {
    const profile = getWorkspace(id);
    return t(`workspace.profiles.${profile.id}.name`);
  };
  const workspaceTagline = (id) => {
    const profile = getWorkspace(id);
    return t(`workspace.profiles.${profile.id}.tagline`);
  };

  return (
    <div className="flex items-center justify-between border border-border/60 rounded-2xl px-4 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <WorkspaceIcon name={ws.icon} className="w-4 h-4 text-primary" />
        <div className="min-w-0">
          <p className="text-sm font-medium leading-tight truncate">{workspaceName(ws.id)}</p>
          <p className="text-[10px] text-muted-foreground truncate">{workspaceTagline(ws.id)}</p>
        </div>
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${state.mode === 'auto' ? 'border-green-500/40 text-green-600' : 'border-border text-muted-foreground'}`}>
          {t(state.mode === 'auto' ? 'workspace.auto' : 'workspace.manual')}
        </span>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-border hover:bg-accent transition-colors">
          {t('workspace.switch')} <ChevronDown className="w-3.5 h-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs">{t('workspace.listTitle')}</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => workspaceManager.select(projectId, null)} className="text-xs">
            <Wand2 className="w-3.5 h-3.5 mr-2" /> {t('workspace.autoDetect', { name: workspaceName(state.detectedId) })}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {WORKSPACES.map((w) => (
            <DropdownMenuItem key={w.id} onClick={() => workspaceManager.select(projectId, w.id)} className={`text-xs ${w.id === state.workspaceId ? 'bg-accent' : ''}`}>
              <WorkspaceIcon name={w.icon} className="w-3.5 h-3.5 mr-2" /> {workspaceName(w.id)}
            </DropdownMenuItem>
          ))}
          {summary.mostUsed && (
            <>
              <DropdownMenuSeparator />
              <p className="px-2 py-1.5 text-[10px] text-muted-foreground">
                {t('workspace.mostUsedWorkspace', { name: workspaceName(summary.mostUsed) })}
                {summary.favorite && ` · ${t('workspace.favoriteWorkspace', { name: workspaceName(summary.favorite) })}`}
                {summary.averageTimeMs > 0 && ` · ${t('workspace.averageEdit', { seconds: Math.round(summary.averageTimeMs / 1000) })}`}
              </p>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}