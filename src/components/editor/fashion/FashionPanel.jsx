import React from 'react';
import { ShieldCheck, Shirt } from 'lucide-react';

// Fashion stays reachable as a truthful capability surface while #230 F1 replaces
// legacy generic entity CRUD with narrow server-owned Managed Garment authority.
export default function FashionPanel() {
  return (
    <section className="rounded-2xl border border-border p-3 space-y-2" aria-label="Fashion wardrobe status">
      <p className="text-xs font-medium flex items-center gap-1.5">
        <Shirt className="w-3.5 h-3.5 text-primary" /> Wardrobe
      </p>
      <div className="rounded-xl bg-secondary/50 p-3 text-sm text-muted-foreground" role="status">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <ShieldCheck className="h-4 w-4" /> Canonical Wardrobe authority is not enabled yet.
        </p>
        <p className="mt-2">
          Garment upload, multi-view capture, collections and representation upgrades require server-owned managed garment assets with tenant ownership and stable garment identity.
        </p>
        <p className="mt-2">
          Legacy generic Garment and GarmentCollection entity CRUD is disabled. Fashion remains reachable without object detection while the managed Wardrobe authority is being implemented.
        </p>
      </div>
    </section>
  );
}
