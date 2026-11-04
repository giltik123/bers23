import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

export default function ErrorBanner({ message, onRetry }) {
  const { t } = useTranslation();
  if (!message) return null;
  return (
    <div role="alert" className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
      <AlertCircle className="w-4 h-4 text-destructive shrink-0" aria-hidden="true" />
      <span className="flex-1 text-destructive">{message}</span>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry} className="rounded-lg shrink-0">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> {t('common.retry')}
        </Button>
      )}
    </div>
  );
}
