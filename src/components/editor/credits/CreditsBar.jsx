import React from 'react';
import { Calculator } from 'lucide-react';

// Advisory display only. Balance/reservation/settlement truth belongs to Core.
export default function CreditsBar({ estimate = 0 }) {
  if (!(estimate > 0)) return null;
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground px-1 flex-wrap">
      <span className="flex items-center gap-1">
        <Calculator className="w-3 h-3" />
        Est. cost: <span className="font-medium text-foreground">{estimate}</span>
      </span>
      <span>Advisory only · final authorization and settlement are server-owned.</span>
    </div>
  );
}
