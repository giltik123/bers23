import React from 'react';
import { AlertTriangle, Lightbulb, Gauge } from 'lucide-react';
import { labelize } from '@/lib/outfits/outfitModel';

const ScoreBar = ({ label, value }) => (
  <div className="flex-1 min-w-[90px]">
    <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
      <span>{label}</span><span className="font-medium text-foreground">{value}</span>
    </div>
    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
      <div className={`h-full rounded-full ${value >= 75 ? 'bg-green-500' : value >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${value}%` }} />
    </div>
  </div>
);

export default function OutfitAnalysisCard({ report }) {
  if (!report || !report.garments.length) return null;
  return (
    <div className="rounded-2xl border border-border p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Gauge className="w-4 h-4 text-primary" />
        <p className="text-xs font-medium">Compatibility: {report.score}/100</p>
        <span className="text-[10px] text-muted-foreground ml-auto">
          {labelize(report.style.dominantStyle)} · {labelize(report.color.scheme)} palette
        </span>
      </div>
      <div className="flex gap-3 flex-wrap">
        <ScoreBar label="Color harmony" value={report.color.score} />
        <ScoreBar label="Materials" value={report.material.score} />
        <ScoreBar label="Style" value={report.style.consistency} />
        <ScoreBar label="Season" value={report.seasonScore} />
      </div>
      {report.warnings.length > 0 && (
        <div className="space-y-1">
          {report.warnings.map((w, i) => (
            <p key={i} className="text-[11px] text-amber-600 flex gap-1.5"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {w}</p>
          ))}
        </div>
      )}
      {report.suggestions.length > 0 && (
        <div className="space-y-1">
          {report.suggestions.slice(0, 3).map((s, i) => (
            <p key={i} className="text-[11px] text-muted-foreground flex gap-1.5"><Lightbulb className="w-3 h-3 mt-0.5 shrink-0" /> {s}</p>
          ))}
        </div>
      )}
    </div>
  );
}