import React from 'react';
import { Heart, Image as ImageIcon } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import { assetTypeLabel } from './assetPresentation';

export default function AssetCard({ asset, selected, onSelect, onFavorite }) {
  const { t } = useTranslation();
  const favoriteLabel = asset.favorite ? t('assets.removeFavorite') : t('assets.addFavorite');

  return (
    <div className="relative">
      <button
        type="button"
        aria-pressed={Boolean(selected)}
        onClick={() => onSelect(asset)}
        className={`block w-full overflow-hidden rounded-xl border text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${selected ? 'border-primary ring-1 ring-primary' : 'border-border/60 hover:border-primary/50'}`}
      >
        <div className="aspect-[4/3] bg-secondary">
          {asset.thumbnail
            ? <img src={asset.thumbnail} alt="" className="h-full w-full object-cover" />
            : <ImageIcon aria-hidden="true" className="m-auto h-full w-8 text-muted-foreground" />}
        </div>
        <div className="p-2">
          <p className="truncate text-sm font-medium">{asset.name}</p>
          <p className="text-[10px] text-muted-foreground">{assetTypeLabel(asset.type, t)}</p>
        </div>
      </button>
      <button
        type="button"
        aria-label={favoriteLabel}
        aria-pressed={Boolean(asset.favorite)}
        disabled={!onFavorite}
        onClick={() => onFavorite?.(asset)}
        className="absolute right-1 top-1 rounded-full bg-background/90 p-2 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Heart aria-hidden="true" className={asset.favorite ? 'h-3.5 w-3.5 fill-current text-primary' : 'h-3.5 w-3.5'} />
      </button>
    </div>
  );
}
