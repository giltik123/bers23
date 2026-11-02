import React from 'react';
import { Clock3, Coins, Heart, Save, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

export default function CreativeStrategySummary({
  strategy,
  saved,
  onSave,
  onFavorite,
  outfitsStatus = 'idle',
  onRetryOutfits,
}) {
  const { t } = useTranslation();
  const minutes = Math.ceil(strategy.estimatedTimeMs / 60000);
  const recommendedOutfits = strategy.recommendations?.outfits ?? [];

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div>
        <p className="font-medium">{t('creative.strategyPreview')}</p>
        <p className="text-xs text-muted-foreground">{t('creative.strategyDescription')}</p>
      </div>
      <div className="flex gap-3 text-xs">
        <span className="flex items-center gap-1">
          <Coins className="w-3.5 h-3.5" />
          {t('creative.estimatedCredits', { credits: strategy.estimatedCredits })}
        </span>
        <span className="flex items-center gap-1">
          <Clock3 className="w-3.5 h-3.5" />
          {t('creative.estimatedTime', { minutes })}
        </span>
      </div>
      {strategy.goalId === 'fashion' && (
        <section className="rounded-lg border border-border/60 bg-background/70 p-3 space-y-2" aria-label={t('creative.availableOutfits')}>
          <div>
            <p className="text-xs font-medium">{t('creative.availableOutfits')}</p>
            <p className="text-[11px] text-muted-foreground">{t('creative.outfitContextHint')}</p>
          </div>
          {outfitsStatus === 'loading' ? (
            <p className="text-xs text-muted-foreground" role="status">{t('creative.loadingOutfits')}</p>
          ) : outfitsStatus === 'error' ? (
            <div className="flex flex-wrap items-center justify-between gap-2" role="alert">
              <p className="text-xs text-muted-foreground">{t('creative.outfitsLoadFailed')}</p>
              <Button type="button" variant="outline" size="sm" onClick={onRetryOutfits}>
                {t('common.retry')}
              </Button>
            </div>
          ) : recommendedOutfits.length > 0 ? (
            <ul className="space-y-1">
              {recommendedOutfits.map((outfit) => (
                <li key={outfit.id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate font-medium">{outfit.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {t('creative.outfitItemCount', { count: outfit.entryCount })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">{t('creative.noReadyOutfits')}</p>
          )}
        </section>
      )}
      <ol className="space-y-1 text-xs">
        {strategy.executionOrder.map((step, index) => (
          <li key={step.recipeId}>
            {step.order}. {step.label} <span className="text-muted-foreground">· {strategy.requiredOperations[index]}</span>
          </li>
        ))}
      </ol>
      <div className="rounded-lg bg-background/70 p-2 text-xs text-muted-foreground flex gap-2" role="status">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>{t('creative.previewOnly')}</span>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="icon" onClick={onSave} aria-label={t('creative.saveStrategy')}>
          <Save className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onFavorite}
          aria-label={t('creative.favoriteStrategy')}
          aria-pressed={Boolean(saved?.favorite)}
        >
          <Heart className={saved?.favorite ? 'w-4 h-4 fill-current' : 'w-4 h-4'} />
        </Button>
      </div>
    </div>
  );
}
