import React from 'react';
import { Sparkles, Plus } from 'lucide-react';
import { outfitAnalyzer } from '@/lib/outfits/outfitAnalyzer';
import { outfitBuilder } from '@/lib/outfits/outfitBuilder';
import { outfitAnalytics } from '@/lib/outfits/outfitAnalytics';

export default function OutfitRecommendations({ outfit, wardrobe, onChanged }) {
  const recommendations = outfitAnalyzer.recommend({ outfit, wardrobe });
  if (!recommendations.length) return null;

  const add = async (garment) => {
    const check = outfitBuilder.canAdd(outfit, wardrobe, garment);
    if (!check.ok) return;
    outfitAnalytics.track('recommendation_accepted');
    await outfitBuilder.addGarment(outfit, wardrobe, garment);
    onChanged();
  };

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> Recommended additions</p>
      <div className="flex flex-wrap gap-1.5">
        {recommendations.map(({ garment, reason }) => (
          <button
            key={garment.id}
            onClick={() => add(garment)}
            className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
            title={reason}
          >
            <Plus className="w-3 h-3" /> {garment.name} <span className="opacity-60">· {reason}</span>
          </button>
        ))}
      </div>
    </div>
  );
}