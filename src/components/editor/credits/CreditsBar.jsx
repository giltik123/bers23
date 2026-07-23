import React, { useState, useEffect } from 'react';
import { Coins, Lock, Calculator, ArrowRight } from 'lucide-react';
import { creditsWallet } from '@/lib/credits/creditsWallet';

// Editor credits strip: current balance, reserved, estimated cost of the
// pending action, and the remaining balance after execution.
export default function CreditsBar({ estimate = 0 }) {
  const [state, setState] = useState(creditsWallet.state);
  useEffect(() => {
    const unsubscribe = creditsWallet.subscribe(setState);
    creditsWallet.ensure().catch(() => {});
    return unsubscribe;
  }, []);

  if (!state.wallet) return null;
  const reserved = state.wallet.reserved || 0;
  const available = creditsWallet.available(state.wallet);
  const after = available - estimate;

  return (
    <div className="flex items-center gap-4 text-[11px] text-muted-foreground px-1 flex-wrap">
      <span className="flex items-center gap-1"><Coins className="w-3.5 h-3.5 text-amber-500" /> Balance: <span className="font-medium text-foreground">{available}</span></span>
      {reserved > 0 && <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> Reserved: {reserved}</span>}
      {estimate > 0 && (
        <>
          <span className="flex items-center gap-1"><Calculator className="w-3 h-3" /> Est. cost: <span className="font-medium text-foreground">{estimate}</span></span>
          <span className={`flex items-center gap-1 ${after < 0 ? 'text-destructive font-medium' : ''}`}>
            <ArrowRight className="w-3 h-3" /> After: {after}
          </span>
        </>
      )}
    </div>
  );
}