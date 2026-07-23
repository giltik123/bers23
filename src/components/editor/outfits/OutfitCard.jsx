import React from 'react';
import { Heart, Layers } from 'lucide-react';
import { labelize } from '@/lib/outfits/outfitModel';

export default function OutfitCard({ outfit, score, onOpen }) {
  return (
    <button onClick={() => onOpen(outfit)} className="text-left rounded-xl border border-border overflow-hidden hover:border-primary/50 transition-colors">
      <div className="aspect-video bg-muted flex items-center justify-center relative">
        {outfit.thumbnail_url ? (
          <img src={outfit.thumbnail_url} alt={outfit.name} className="w-full h-full object-cover" />
        ) : (
          <Layers className="w-8 h-8 text-muted-foreground/40" />
        )}
        {outfit.favorite && <Heart className="absolute top-1.5 right-1.5 w-3.5 h-3.5 fill-red-500 text-red-500" />}
        {score != null && (
          <span className={`absolute bottom-1.5 right-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-background/80 backdrop-blur-sm ${score >= 75 ? 'text-green-600' : score >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
            {score}
          </span>
        )}
      </div>
      <div className="p-2">
        <p className="text-xs font-medium truncate">{outfit.name}</p>
        <p className="text-[10px] text-muted-foreground truncate">
          {labelize(outfit.style)} · {labelize(outfit.occasion)} · {(outfit.garment_ids || []).length} items
        </p>
      </div>
    </button>
  );
}