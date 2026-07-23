import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { subscriptionManager } from '@/lib/subscriptions/subscriptionManager';
import { getPlan } from '@/lib/subscriptions/subscriptionPlans';
import { subscriptionUsage } from '@/lib/subscriptions/subscriptionUsage';
import { creditsWallet } from '@/lib/credits/creditsWallet';
import { planRecommendationEngine } from '@/lib/subscriptions/planRecommendationEngine';
import SubscriptionSummary from '@/components/subscription/SubscriptionSummary';
import UsageMeters from '@/components/subscription/UsageMeters';
import RecommendationList from '@/components/subscription/RecommendationList';
import PlanCards from '@/components/subscription/PlanCards';

export default function Subscription() {
  const [data, setData] = useState(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const load = async () => { const [subscription, usage, wallet, recommendations] = await Promise.all([subscriptionManager.ensure(), subscriptionUsage.ensure(), creditsWallet.ensure(), planRecommendationEngine.recommend()]); setData({ subscription, usage, credits: creditsWallet.available(wallet), recommendations }); };
  useEffect(() => { load(); }, []);
  const change = async (planId, trial = false) => { setBusy(true); setError(''); try { if (trial) await subscriptionManager.startTrial(planId); else await subscriptionManager.changePlan(planId); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  if (!data) return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  const plan = getPlan(data.subscription.plan_id);
  return <div className="max-w-4xl mx-auto px-4 py-6 space-y-6"><div className="flex items-center gap-2"><Link to="/" className="p-2 -ml-2 rounded-lg hover:bg-accent"><ArrowLeft className="w-5 h-5" /></Link><h1 className="text-xl font-semibold">Subscription</h1></div>{error && <p className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}<div className="grid md:grid-cols-2 gap-4"><SubscriptionSummary subscription={data.subscription} plan={plan} /><UsageMeters usage={data.usage} plan={plan} credits={data.credits} /></div><RecommendationList recommendations={data.recommendations} /><PlanCards currentPlanId={plan.id} trialUsed={data.subscription.trial_used} busy={busy} onChoose={(id) => change(id)} onTrial={(id) => change(id, true)} /></div>;
}