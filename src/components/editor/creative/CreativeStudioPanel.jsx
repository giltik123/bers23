import React, { useMemo, useState } from 'react';
import CreativeGoalPicker from '@/components/editor/creative/CreativeGoalPicker';
import CreativeIdeaCard from '@/components/editor/creative/CreativeIdeaCard';
import CreativeMoodBoardCard from '@/components/editor/creative/CreativeMoodBoardCard';
import CreativeStrategySummary from '@/components/editor/creative/CreativeStrategySummary';
import { creativeStudio } from '@/lib/creative/CreativeStudio';
import { creativeHistory } from '@/lib/creative/CreativeHistory';
import { creativeAnalytics } from '@/lib/creative/CreativeAnalytics';
import { sceneMemory } from '@/lib/scene/sceneMemory';
import { workspaceManager } from '@/lib/workspace/workspaceManager';

// Advisory-only Creative Studio. Outfit-aware recommendations remain disabled until
// a narrow canonical Outfit read authority replaces the legacy generic entity path.
export default function CreativeStudioPanel({ project, objects }) {
  const [goalId, setGoalId] = useState('marketing');
  const [ideaId, setIdeaId] = useState(null);
  const [saved, setSaved] = useState(null);
  const analysis = useMemo(() => creativeStudio.analyze({ project, objects, memory: sceneMemory.getActive(), workspace: workspaceManager.active() }), [project, objects]);
  const generated = useMemo(() => creativeStudio.generate({ goalId, analysis }), [goalId, analysis]);
  const idea = generated.ideas.find((item) => item.id === ideaId) || generated.ideas[0];
  const strategy = useMemo(() => creativeStudio.strategy({ idea, goal: generated.goal, analysis, outfits: [] }), [idea, generated.goal, analysis]);
  const selectGoal = (id) => { setGoalId(id); setIdeaId(null); creativeAnalytics.track('goal_selected', { goal: id }); };
  const selectIdea = (item) => { setIdeaId(item.id); creativeAnalytics.track('idea_selected', { goal: goalId, idea: item.title }); };
  const save = () => { const entry = creativeHistory.save(strategy); setSaved(entry); creativeAnalytics.track('strategy_saved', { goal: goalId }); };
  const favorite = () => { const entry = saved || creativeHistory.save(strategy); setSaved(creativeHistory.favorite(entry)); creativeAnalytics.track('style_favorited', { goal: goalId }); };
  return <div className="space-y-4 rounded-2xl border border-border/60 p-4"><div><p className="font-medium">Creative Studio</p><p className="text-xs text-muted-foreground">Plans ideas and execution strategies; it never edits your image directly.</p><p className="mt-1 text-xs text-muted-foreground">Outfit-aware recommendations are unavailable until canonical Outfit authority is enabled.</p></div><CreativeGoalPicker value={goalId} onChange={selectGoal} /><div className="grid gap-2 md:grid-cols-3">{generated.ideas.map((item) => <CreativeIdeaCard key={item.id} idea={item} active={item.id === idea.id} onSelect={selectIdea} />)}</div><div><p className="mb-2 text-sm font-medium">Mood boards</p><div className="grid gap-2 md:grid-cols-2">{generated.moodBoards.map((board) => <CreativeMoodBoardCard key={board.id} board={board} />)}</div></div><div className="rounded-xl bg-secondary/50 p-3 text-xs text-muted-foreground">Suggested workspace: <span className="font-medium text-foreground">{strategy.recommendations.workspace}</span></div><CreativeStrategySummary strategy={strategy} saved={saved} onSave={save} onFavorite={favorite} /></div>;
}
