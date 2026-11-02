import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CreditCard } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

// Payments module placeholder — UI shell only, business logic comes later.
export default function Billing() {
  const { t } = useTranslation();

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
      <h1 className="text-2xl font-heading font-semibold">{t('billing.title')}</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="w-4 h-4" /> Payments coming soon
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {t('billing.comingSoonDescription')}
        </CardContent>
      </Card>
    </div>
  );
}