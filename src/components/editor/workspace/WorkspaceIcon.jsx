import React from 'react';
import { User, Shirt, Package, Car, Home, Mountain, UtensilsCrossed, Paintbrush, Share2, LayoutGrid } from 'lucide-react';

const ICONS = { User, Shirt, Package, Car, Home, Mountain, UtensilsCrossed, Paintbrush, Share2, LayoutGrid };

export default function WorkspaceIcon({ name, className = 'w-4 h-4' }) {
  const Icon = ICONS[name] || LayoutGrid;
  return <Icon className={className} />;
}