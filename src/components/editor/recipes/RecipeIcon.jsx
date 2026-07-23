import React from 'react';
import { icons } from 'lucide-react';

// Renders a lucide icon by name (recipes store icon names as strings).
export default function RecipeIcon({ name, className = 'w-4 h-4' }) {
  const Icon = icons[name] || icons.Sparkles;
  return <Icon className={className} />;
}