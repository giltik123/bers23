import React from 'react';
import { Heart, Shirt } from 'lucide-react';
import { getCategory } from '@/lib/fashion/garmentCategories';
import { garmentFavorites } from '@/lib/fashion/garmentFavorites';
import { wardrobeManager } from '@/lib/fashion/wardrobeManager';

export default function GarmentCard({ garment, onOpen }) {
  const toggleFavorite = async (e) => {
    e.stopPropagation();
    await garmentFavorites.toggle(garment);
    wardrobeManager.refresh();
  };

  return (
    <button onClick={() => onOpen(garment)} className="text-left rounded-xl border border-border overflow-hidden hover:border-primary/50 transition-colors group">
      <div className="aspect-square bg-muted flex items-center justify-center relative">
        {garment.thumbnail_url ? (
          <img src={garment.thumbnail_url} alt={garment.name} className="w-full h-full object-cover" />
        ) : (
          <Shirt className="w-8 h-8 text-muted-foreground/40" />
        )}
        <span onClick={toggleFavorite} className="absolute top-1.5 right-1.5 p-1 rounded-full bg-background/70 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity" style={garment.favorite ? { opacity: 1 } : undefined}>
          <Heart className={`w-3.5 h-3.5 ${garment.favorite ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
        </span>
      </div>
      <div className="p-2">
        <p className="text-xs font-medium truncate">{garment.name}</p>
        <p className="text-[10px] text-muted-foreground truncate">{getCategory(garment.category).name}{garment.brand ? ` · ${garment.brand}` : ''}</p>
      </div>
    </button>
  );
}