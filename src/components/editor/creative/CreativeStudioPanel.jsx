import React, { useEffect, useMemo, useState } from 'react';
import { coreClient } from '@/api/coreClient';
import { projectReadyCreativeOutfits } from '@/application/creative/creativeOutfitContext';
import CreativeGoalPicker from '@/components/editor/creative/CreativeGoalPicker';
import CreativeIdeaCard from '@/components/editor/creative/CreativeIdeaCard';
import CreativeMoodBoardCard from '@/components/editor/creative/CreativeMoodBoardCard';
import CreativeStrategySummary from '@/components/editor/creative/CreativeStrategySummary';
import { creativeStudio } from '@/lib/creative/CreativeStudio';
import { creativeHistory } from '@/lib/creative/CreativeHistory';
import { creativeAnalytics } from '@/lib/creative/CreativeAnalytics';
import { sceneMemory } from '@/lib/scene/sceneMemory';
import { workspaceManager } from '@/lib/workspace/workspaceManager';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import { useAuth } from '@/lib/AuthContext';
import {
  savedCreativeStrategyForCurrent,
  scopeCreativeStrategyToProject,
} from '@/application/creative/creativeStrategyScope';

const EMPTY_OUTFITS = Object.freeze([]);

// Outfit context is a read-only recommendation input. Core remains the sole
// authority for Outfit ownership, references, mutations and any Try-On run.
export default function CreativeStudioPanel({ project, objects }) {
  const { t } = useTranslation();
  const { user, isAuthenticated, isLoadingAuth } = useAuth();
  const principalKey = user?.id && user?.tenant_id ? user.tenant_id + ':' + user.id : '';
  const [goalId, setGoalId] = useState('marketing');
  const [ideaId, setIdeaId] = useState(null);
  const [saved, setSaved] = useState(null);
  const [savedStrategy, setSavedStrategy] = useState(null);
  const [outfits, setOutfits] = useState(EMPTY_OUTFITS);
  const [outfitsStatus, setOutfitsStatus] = useState('idle');
  const [outfitsRetry, setOutfitsRetry] = useState(0);

  useEffect(() => {
    setSaved(null);
    setSavedStrategy(null);
  }, [principalKey]);

  const analysis = useMemo(
    () => creativeStudio.analyze({
      project,
      objects,
      memory: sceneMemory.getActive(),
      workspace: workspaceManager.active(),
    }),
    [project, objects],
  );
  const generated = useMemo(() => creativeStudio.generate({ goalId, analysis }), [goalId, analysis]);
  const idea = generated.ideas.find((item) => item.id === ideaId) || generated.ideas[0];

  const localizedIdea = useMemo(() => {
    const theme = t('creative.themes.' + idea.themeKey);
    return {
      ...idea,
      title: theme,
      description: t('creative.ideaDescription', {
        goal: t('creative.goalDescriptions.' + idea.goalId),
        theme,
        orientation: t('creative.orientations.' + idea.orientation),
      }),
    };
  }, [idea, t]);

  useEffect(() => {
    if (goalId !== 'fashion') {
      setOutfits(EMPTY_OUTFITS);
      setOutfitsStatus('idle');
      return undefined;
    }
    if (isLoadingAuth) {
      setOutfits(EMPTY_OUTFITS);
      setOutfitsStatus('loading');
      return undefined;
    }
    if (!isAuthenticated || !principalKey) {
      setOutfits(EMPTY_OUTFITS);
      setOutfitsStatus('error');
      return undefined;
    }

    let active = true;
    setOutfits(EMPTY_OUTFITS);
    setOutfitsStatus('loading');

    const load = async () => {
      try {
        const canonicalOutfits = await coreClient.fashion.outfits.list();
        const next = projectReadyCreativeOutfits(canonicalOutfits);
        if (!active) return;
        setOutfits(next);
        setOutfitsStatus('ready');
      } catch {
        if (!active) return;
        setOutfits(EMPTY_OUTFITS);
        setOutfitsStatus('error');
      }
    };

    void load();
    return () => { active = false; };
  }, [goalId, outfitsRetry, isAuthenticated, isLoadingAuth, principalKey]);

  const strategyOutfits = goalId === 'fashion' && outfitsStatus === 'ready' ? outfits : EMPTY_OUTFITS;
  const strategy = useMemo(() => scopeCreativeStrategyToProject(
    creativeStudio.strategy({
      idea: localizedIdea,
      goal: generated.goal,
      analysis,
      outfits: strategyOutfits,
    }),
    project?.id,
  ), [localizedIdea, generated.goal, analysis, strategyOutfits, project?.id]);
  const historyStrategy = useMemo(() => Object.freeze({
    ...strategy,
    recommendations: Object.freeze({
      ...strategy.recommendations,
      outfits: EMPTY_OUTFITS,
    }),
  }), [strategy]);
  const currentSaved = savedCreativeStrategyForCurrent(saved, savedStrategy, strategy);

  const selectGoal = (id) => {
    setGoalId(id);
    setIdeaId(null);
    creativeAnalytics.track('goal_selected', { goal: id });
  };
  const selectIdea = (item) => {
    setIdeaId(item.id);
    creativeAnalytics.track('idea_selected', { goal: goalId, idea: item.title });
  };
  const save = () => {
    const entry = creativeHistory.save(historyStrategy);
    setSaved(entry);
    setSavedStrategy(strategy);
    creativeAnalytics.track('strategy_saved', { goal: goalId });
  };
  const favorite = () => {
    const entry = currentSaved || creativeHistory.save(historyStrategy);
    setSaved(creativeHistory.favorite(entry));
    setSavedStrategy(strategy);
    creativeAnalytics.track('style_favorited', { goal: goalId });
  };

  return (
    <div className="space-y-4 rounded-2xl border border-border/60 p-4">
      <div>
        <p className="font-medium">{t('creative.title')}</p>
        <p className="text-xs text-muted-foreground">{t('creative.description')}</p>
      </div>
      <CreativeGoalPicker value={goalId} onChange={selectGoal} />
      <div className="grid gap-2 md:grid-cols-3">
        {generated.ideas.map((item) => (
          <CreativeIdeaCard
            key={item.id}
            idea={item}
            active={item.id === idea.id}
            onSelect={selectIdea}
          />
        ))}
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">{t('creative.moodBoards')}</p>
        <div className="grid gap-2 md:grid-cols-2">
          {generated.moodBoards.map((board) => (
            <CreativeMoodBoardCard key={board.id} board={board} />
          ))}
        </div>
      </div>
      <div className="rounded-xl bg-secondary/50 p-3 text-xs text-muted-foreground">
        {t('creative.suggestedWorkspace')}: <span className="font-medium text-foreground">{strategy.recommendations.workspace}</span>
      </div>
      <CreativeStrategySummary
        strategy={strategy}
        saved={currentSaved}
        onSave={save}
        onFavorite={favorite}
        outfitsStatus={goalId === 'fashion' && outfitsStatus === 'idle' ? 'loading' : outfitsStatus}
        onRetryOutfits={() => setOutfitsRetry((value) => value + 1)}
      />
    </div>
  );
}
