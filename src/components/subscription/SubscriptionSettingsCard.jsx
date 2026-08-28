import React from 'react';
import { Link } from 'react-router-dom';
import { CreditCard } from 'lucide-react';

export default function SubscriptionSettingsCard() {
  return (
    <Link to="/subscription" className="block p-4 hover:bg-accent/50 transition-colors">
      <div className="flex justify-between gap-4">
        <div>
          <p className="font-medium text-sm flex items-center gap-2"><CreditCard className="w-4 h-4" />Subscription</p>
          <p className="text-sm text-muted-foreground mt-0.5">Plans and trials are not connected to production billing yet.</p>
          <p className="text-xs text-muted-foreground mt-1">No billing or credit mutation is performed from this browser.</p>
        </div>
        <span className="text-sm font-medium self-center">Status</span>
      </div>
    </Link>
  );
}
