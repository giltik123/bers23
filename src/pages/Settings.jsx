import React, { lazy, Suspense, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, LogOut } from 'lucide-react';
import { coreClient } from '@/api/coreClient';
import { Button } from '@/components/ui/button';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageSwitcher from '@/components/i18n/LanguageSwitcher';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import SubscriptionSettingsCard from '@/components/subscription/SubscriptionSettingsCard';
const PerformanceSettings = lazy(() => import('@/components/settings/PerformanceSettings'));

export default function Settings() {
  const [user, setUser] = useState(null);
  const { t } = useTranslation();

  useEffect(() => {
    coreClient.auth.me().then(setUser).catch(() => {});
  }, []);

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Link to="/" className="p-2 -ml-2 rounded-lg hover:bg-accent transition-colors"><ArrowLeft className="w-5 h-5 rtl-flip" /></Link>
        <h1 className="text-xl font-semibold tracking-tight">{t('settings.title')}</h1>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card divide-y divide-border/60">
        <div className="p-4 flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">{t('settings.account')}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{user ? user.email : t('common.loading')}</p>
          </div>
        </div>
        <div className="p-4 flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">{t('settings.appearance')}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{t('settings.appearanceHint')}</p>
          </div>
          <ThemeToggle />
        </div>
        <div className="p-4 flex items-center justify-between gap-4">
          <div>
            <p className="font-medium text-sm">{t('settings.language')}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{t('settings.languageHint')}</p>
          </div>
          <LanguageSwitcher />
        </div>
        <SubscriptionSettingsCard />
        <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">{t('settings.loadingPerformance')}</div>}><PerformanceSettings /></Suspense>
      </div>

      <Button variant="outline" className="w-full rounded-xl h-11" onClick={() => coreClient.auth.logout()}>
        <LogOut className="w-4 h-4 mr-2" /> {t('common.signOut')}
      </Button>
    </div>
  );
}