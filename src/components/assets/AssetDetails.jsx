import React from 'react';
import { Clock3, Link2, Tag } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

export default function AssetDetails({ asset, history, onAddToCollection }) {
  const { t } = useTranslation();
  if (!asset) return <aside className="rounded-2xl border border-border/60 p-4 text-sm text-muted-foreground">{t('assetUi.selectAsset')}</aside>;

  const usage = history.filter((item) => item.asset_key === asset.asset_key);
  const typeLabel = asset.type === 'project' ? t('assetUi.projectType') : asset.type.replaceAll('_', ' ');
  const displayTag = (tag) => {
    if (tag === 'project') return t('assetUi.projectType');
    if (tag === 'canonical artifact') return t('assetUi.canonicalArtifactTag');
    return tag;
  };

  return (
    <aside className="space-y-4 rounded-2xl border border-border/60 p-4">
      <div>
        {asset.preview && <img src={asset.preview} alt="" className="mb-3 aspect-video w-full rounded-xl object-cover" />}
        <p className="font-medium">{asset.name}</p>
        <p className="text-xs capitalize text-muted-foreground">{typeLabel}</p>
      </div>
      <div>
        <p className="mb-1 flex items-center gap-1 text-xs font-medium"><Tag className="h-3.5 w-3.5" />{t('assetUi.tags')}</p>
        <div className="flex flex-wrap gap-1">
          {(asset.tags || []).map((tag) => <span key={tag} className="rounded-full bg-secondary px-2 py-0.5 text-[10px]">{displayTag(tag)}</span>)}
        </div>
      </div>
      <div>
        <p className="mb-1 flex items-center gap-1 text-xs font-medium"><Link2 className="h-3.5 w-3.5" />{t('assetUi.related')}</p>
        {(asset.relations || []).map((relation) => <p key={relation.asset_key} className="text-xs text-muted-foreground">{relation.label}</p>)}
      </div>
      {onAddToCollection && (
        <button type="button" onClick={() => onAddToCollection(asset)} className="w-full rounded-lg border border-input px-2 py-1.5 text-xs hover:bg-accent">
          {t('assetUi.addToCollection')}
        </button>
      )}
      <div>
        <p className="mb-1 flex items-center gap-1 text-xs font-medium"><Clock3 className="h-3.5 w-3.5" />{t('assetUi.usageHistory')}</p>
        <p className="text-xs text-muted-foreground">
          {usage.length ? t('assetUi.usageCount', { count: usage.length }) : t('assetUi.noUsage')}
        </p>
      </div>
    </aside>
  );
}
