import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard } from 'lucide-react';
import { subscriptionManager } from '@/lib/subscriptions/subscriptionManager';
import { getPlan } from '@/lib/subscriptions/subscriptionPlans';
import { subscriptionPolicy } from '@/lib/subscriptions/subscriptionPolicy';

export default function SubscriptionSettingsCard() {
  const [subscription, setSubscription] = useState(null);
  useEffect(() => { subscriptionManager.ensure().then(setSubscription); }, []);
  if (!subscription) return null;
  const plan = getPlan(subscription.plan_id);
  return <Link to="/subscription" className="block p-4 hover:bg-accent/50 transition-colors"><div className="flex justify-between gap-4"><div><p className="font-medium text-sm flex items-center gap-2"><CreditCard className="w-4 h-4" />Subscription</p><p className="text-sm text-muted-foreground mt-0.5">{plan.name} · {subscriptionPolicy.renewalLabel(subscription)}</p><p className="text-xs text-muted-foreground mt-1">{plan.maxProjects} projects · {plan.maxStorage} GB · {plan.includedCredits.toLocaleString()} included credits</p></div><span className="text-sm font-medium self-center">Manage</span></div></Link>;
}