import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ErrorBanner({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
      <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
      <span className="flex-1 text-destructive">{message}</span>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="rounded-lg shrink-0">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
        </Button>
      )}
    </div>
  );
}