import React from 'react';
import { Heart, Image as ImageIcon } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

export default function AssetCard({ asset, selected, onSelect, onFavorite }) {
  const { t } = useTranslation();
  const typeLabel = asset.type === 'project'
    ? t('assets.projectType')
    : asset.type.replaceAll('_', ' ');

  return (
    <article className={`relative overflow-hidden rounded-xl border ${selected ? 'border-primary ring-1 ring-primary' : 'border-border/60 hover:border-primary/50'}`}>
      <button
        type="button"
        onClick={() => onSelect(asset)}
        aria-label={t('assets.selectAsset', { name: asset.name })}
        aria-pressed={Boolean(selected)}
        className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      >
        <div className="aspect-[4/3] bg-secondary">
          {asset.thumbnail
            ? <img src={asset.thumbnail} alt="" aria-hidden="true" className="h-full w-full object-cover" />
            : <ImageIcon aria-hidden="true" className="m-auto h-full w-8 text-muted-foreground" />}
        </div>
        <div className="p-2">
          <p className="truncate text-sm font-medium">{asset.name}</p>
          <p className="text-[10px] capitalize text-muted-foreground">{typeLabel}</p>
        </div>
      </button>
      <button
        type="button"
        aria-label={asset.favorite
          ? t('assets.removeFavorite', { name: asset.name })
          : t('assets.addFavorite', { name: asset.name })}
        aria-pressed={Boolean(asset.favorite)}
        onClick={(event) => {
          event.stopPropagation();
          onFavorite(asset);
        }}
        className="absolute right-1 top-1 rounded-full bg-background/80 p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Heart aria-hidden="true" className={asset.favorite ? 'h-3.5 w-3.5 fill-current text-primary' : 'h-3.5 w-3.5'} />
      </button>
    </article>
  );
}
