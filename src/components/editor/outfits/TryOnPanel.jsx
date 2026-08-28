import React from 'react';
import { ShieldCheck, Wand2 } from 'lucide-react';

export default function TryOnPanel() {
  return (
    <section className="rounded-2xl border border-border p-3 space-y-2">
      <p className="text-xs font-medium flex items-center gap-1.5"><Wand2 className="w-3.5 h-3.5 text-primary" /> Virtual Try-On</p>
      <div className="rounded-xl bg-secondary/50 p-3 text-sm text-muted-foreground" role="status">
        <p className="flex items-center gap-2 font-medium text-foreground"><ShieldCheck className="h-4 w-4" />Canonical Try-On execution is not enabled yet.</p>
        <p className="mt-2">
          Image-producing try-on requires server-owned garment input authority, provider billing, intermediate Artifact lineage and retry reconciliation.
          The legacy browser FASHN execution path is disabled.
        </p>
        <p className="mt-2">You can continue building and reviewing outfit metadata while the production try-on operation is being implemented.</p>
      </div>
    </section>
  );
}
