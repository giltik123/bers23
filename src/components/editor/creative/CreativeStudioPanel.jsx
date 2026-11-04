import React, { useMemo, useState } from 'react';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import CreativeGoalPicker from '@/components/editor/creative/CreativeGoalPicker';
import CreativeIdeaCard from '@/components/editor/creative/CreativeIdeaCard';
import CreativeMoodBoardCard from '@/components/editor/creative/CreativeMoodBoardCard';
import CreativeStrategySummary from '@/components/editor/creative/CreativeStrategySummary';
import { creativeStudio } from '@/lib/creative/CreativeStudio';
import { creativeHistory } from '@/lib/creative/CreativeHistory';
import { creativeAnalytics } from '@/lib/creative/CreativeAnalytics';
import { sceneMemory } from '@/lib/scene/sceneMemory';
import { workspaceManager } from '@/lib/workspace/workspaceManager';

// Advisory-only Creative Studio. Canonical Outfit authority exists, but Outfit-aware
// recommendations remain disabled until Creative receives its own narrow read cutover.
export default function CreativeStudioPanel({ project, objects }) {
  const { t } = useTranslation();
  const [persistenceUnavailable, setPersistenceUnavailable] = useState(false);
  const [goalId, setGoalId] = useState('marketing');
  const [ideaId, setIdeaId] = useState(null);
  const [saved, setSaved] = useState(null);
  const analysis = useMemo(() => creativeStudio.analyze({ project, objects, memory: sceneMemory.getActive(), workspace: workspaceManager.active() }), [project, objects]);
  const generated = useMemo(() => creativeStudio.generate({ goalId, analysis }), [goalId, analysis]);
  const idea = generated.ideas.find((item) => item.id === ideaId) || generated.ideas[0];
  const strategy = useMemo(() => creativeStudio.strategy({ idea, goal: generated.goal, analysis, outfits: [] }), [idea, generated.goal, analysis]);
  const selectGoal = (id) => { setGoalId(id); setIdeaId(null); creativeAnalytics.track('goal_selected', { goal: id }); };
  const selectIdea = (item) => { setIdeaId(item.id); creativeAnalytics.track('idea_selected', { goal: goalId, idea: item.title }); };
  const save = () => {
    const result = creativeHistory.save(strategy);
    if (!result.ok) { setPersistenceUnavailable(true); return; }
    setSaved(result.entry);
    setPersistenceUnavailable(false);
    creativeAnalytics.track('strategy_saved', { goal: goalId });
  };
  const favorite = () => {
    let entry = saved;
    if (!entry) {
      const savedResult = creativeHistory.save(strategy);
      if (!savedResult.ok) { setPersistenceUnavailable(true); return; }
      entry = savedResult.entry;
      setSaved(entry);
      creativeAnalytics.track('strategy_saved', { goal: goalId });
    }
    const result = creativeHistory.favorite(entry);
    if (!result.ok) { setPersistenceUnavailable(true); return; }
    setSaved(result.entry);
    setPersistenceUnavailable(false);
    creativeAnalytics.track('style_favorited', { goal: goalId });
  };
  return <div className="space-y-4 rounded-2xl border border-border/60 p-4"><div><p className="font-medium">Creative Studio</p><p className="text-xs text-muted-foreground">Plans ideas and execution strategies; it never edits your image directly.</p><p className="mt-1 text-xs text-muted-foreground">Canonical Outfit authority is available, but Creative Studio integration is not wired yet.</p></div><CreativeGoalPicker value={goalId} onChange={selectGoal} /><div className="grid gap-2 md:grid-cols-3">{generated.ideas.map((item) => <CreativeIdeaCard key={item.id} idea={item} active={item.id === idea.id} onSelect={selectIdea} />)}</div><div><p className="mb-2 text-sm font-medium">Mood boards</p><div className="grid gap-2 md:grid-cols-2">{generated.moodBoards.map((board) => <CreativeMoodBoardCard key={board.id} board={board} />)}</div></div><div className="rounded-xl bg-secondary/50 p-3 text-xs text-muted-foreground">Suggested workspace: <span className="font-medium text-foreground">{strategy.recommendations.workspace}</span></div><CreativeStrategySummary strategy={strategy} saved={saved} onSave={save} onFavorite={favorite} />{persistenceUnavailable && <p role="status" aria-live="polite" className="text-xs text-muted-foreground">{t('creative.storageUnavailable')}</p>}</div>;
}
