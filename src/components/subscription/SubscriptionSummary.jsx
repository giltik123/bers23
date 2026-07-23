import React from 'react';
import { Badge } from '@/components/ui/badge';
import { subscriptionPolicy } from '@/lib/subscriptions/subscriptionPolicy';

export default function SubscriptionSummary({ subscription, plan }) {
  const trial = subscriptionPolicy.isTrialActive(subscription);
  return <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-2">
    <div className="flex items-center justify-between gap-3"><div><p className="text-sm text-muted-foreground">Current plan</p><h2 className="text-xl font-semibold">{plan.name}</h2></div><Badge variant="secondary">{trial ? `${subscriptionPolicy.trialDaysRemaining(subscription)} trial days left` : subscription.status}</Badge></div>
    <p className="text-sm text-muted-foreground">{plan.description}</p>
    <p className="text-xs text-muted-foreground">Renewal: {subscriptionPolicy.renewalLabel(subscription)}</p>
  </div>;
}