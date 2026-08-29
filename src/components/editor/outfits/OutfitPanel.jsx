import React from 'react';
import { Layers, ShieldCheck } from 'lucide-react';

// Outfit navigation remains reachable while #230 F2/F3 replaces legacy generic
// entity CRUD with a server-owned Outfit aggregate over canonical garment refs.
export default function OutfitPanel() {
  return (
    <section className="rounded-2xl border border-border p-3 space-y-2" aria-label="Outfit builder status">
      <p className="text-xs font-medium flex items-center gap-1.5">
        <Layers className="w-3.5 h-3.5 text-primary" /> Outfits
      </p>
      <div className="rounded-xl bg-secondary/50 p-3 text-sm text-muted-foreground" role="status">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <ShieldCheck className="h-4 w-4" /> Canonical Outfit authority is not enabled yet.
        </p>
        <p className="mt-2">
          Outfit creation and editing require server-owned ordered garment references, ownership validation, layer semantics and revision/conflict handling.
        </p>
        <p className="mt-2">
          Legacy generic Outfit entity CRUD is disabled. You can reach this workspace without object detection; editing will become available through the managed Fashion authority.
        </p>
      </div>
    </section>
  );
}
