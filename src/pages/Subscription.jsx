import React from 'react';
import { ArrowLeft, CreditCard, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

export default function Subscription() {
  const { t } = useTranslation();

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Link to="/" className="p-2 -ml-2 rounded-lg hover:bg-accent" aria-label={t('billing.backToProjects')}>
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-semibold">{t('billing.subscription')}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="w-4 h-4" /> {t('billing.notConnectedTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            {t('billing.notConnectedDescription')}
          </p>
          <p>
            {t('billing.verifiedPaymentsNotice')}
          </p>
          <Button asChild variant="outline">
            <Link to="/billing"><CreditCard className="w-4 h-4 mr-2" />{t('billing.viewBillingStatus')}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
