import React from 'react';

const Meter = ({ label, used, limit, unit = '' }) => <div className="space-y-1.5"><div className="flex justify-between text-xs"><span>{label}</span><span className="text-muted-foreground">{used} / {limit}{unit}</span></div><div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, limit ? (used / limit) * 100 : 0)}%` }} /></div></div>;

export default function UsageMeters({ usage, plan, credits }) {
  return <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-4"><h2 className="font-semibold">Usage this month</h2><Meter label="Projects" used={usage.projects_created || 0} limit={plan.maxProjects} /><Meter label="Credits used" used={usage.credits_used || 0} limit={plan.includedCredits} /><Meter label="Storage" used={((usage.storage_used || 0) / 1073741824).toFixed(2)} limit={plan.maxStorage} unit=" GB" /><div className="pt-1 text-sm">Remaining credits <span className="font-semibold">{credits}</span></div></div>;
}