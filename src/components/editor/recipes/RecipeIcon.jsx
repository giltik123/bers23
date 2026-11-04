import React from 'react';
import {
  Box,
  Briefcase,
  Building2,
  Car,
  Cloud,
  Eye,
  Focus,
  Footprints,
  Heart,
  Image,
  Paintbrush,
  Palette,
  PawPrint,
  Scissors,
  Share2,
  Shirt,
  Smile,
  Sparkles,
  Sun,
  Trees,
  UtensilsCrossed,
  Wand2,
  Watch,
} from 'lucide-react';

// Keep this catalog explicit: importing Lucide's full `icons` registry would
// pull every icon into the lazy Recipe Panel chunk.
const RECIPE_ICONS = {
  Box,
  Briefcase,
  Building2,
  Car,
  Cloud,
  Eye,
  Focus,
  Footprints,
  Heart,
  Image,
  Paintbrush,
  Palette,
  PawPrint,
  Scissors,
  Share2,
  Shirt,
  Smile,
  Sparkles,
  Sun,
  Trees,
  UtensilsCrossed,
  Wand2,
  Watch,
};

// Renders a lucide icon by name (recipes store icon names as strings).
export default function RecipeIcon({ name, className = 'w-4 h-4' }) {
  const Icon = RECIPE_ICONS[name] || Sparkles;
  return <Icon className={className} />;
}
