import React, { lazy, Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, LogOut } from 'lucide-react';
import { coreClient } from '@/api/coreClient';
import { Button } from '@/components/ui/button';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageSwitcher from '@/components/i18n/LanguageSwitcher';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
const PerformanceSettings = lazy(() => import('@/components/settings/PerformanceSettings'));

export default function Settings() {
  const [account, setAccount] = useState({ status: 'loading', email: '' });
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const requestId = useRef(0);
  const { t } = useTranslation();

  const loadAccount = useCallback(async () => {
    const request = ++requestId.current;
    setAccount({ status: 'loading', email: '' });
    try {
      const context = await coreClient.auth.me();
      if (request !== requestId.current) return;
      if (typeof context?.email !== 'string' || !context.email.trim()) {
        setAccount({ status: 'error', email: '' });
        return;
      }
      setAccount({ status: 'ready', email: context.email });
    } catch {
      if (request === requestId.current) {
        setAccount({ status: 'error', email: '' });
      }
    }
  }, []);

  useEffect(() => {
    void loadAccount();
    return () => { requestId.current++; };
  }, [loadAccount]);

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutFailed(false);
    try {
      // Only the canonical cookie-backed Auth service may end the session.
      // Redirect to login only after Core confirms successful logout.
      await coreClient.auth.logout('/');
    } catch {
      setSignOutFailed(true);
      setSigningOut(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Link to="/" aria-label={t('common.back')} className="p-2 -ml-2 rounded-lg hover:bg-accent transition-colors"><ArrowLeft className="w-5 h-5 rtl-flip" /></Link>
        <h1 className="text-xl font-semibold tracking-tight">{t('settings.title')}</h1>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card divide-y divide-border/60">
        <div className="p-4 flex items-center justify-between gap-4">
          <div>
            <p className="font-medium text-sm">{t('settings.account')}</p>
            {account.status === 'ready' ? (
              <p className="text-sm text-muted-foreground mt-0.5">{account.email}</p>
            ) : account.status === 'error' ? (
              <p role="alert" className="text-sm text-destructive mt-0.5">{t('settings.accountLoadFailed')}</p>
            ) : (
              <p role="status" className="text-sm text-muted-foreground mt-0.5">{t('common.loading')}</p>
            )}
          </div>
          {account.status === 'error' && (
            <Button type="button" variant="outline" size="sm" onClick={loadAccount}>
              {t('common.retry')}
            </Button>
          )}
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
        <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">{t('settings.loadingPerformance')}</div>}><PerformanceSettings /></Suspense>
      </div>

      <div className="space-y-2">
        {signOutFailed && (
          <p role="alert" className="text-sm text-destructive">{t('settings.signOutFailed')}</p>
        )}
        <Button type="button" variant="outline" disabled={signingOut}
          className="w-full rounded-xl h-11" onClick={signOut}>
          <LogOut className="w-4 h-4 mr-2" />
          {signingOut ? t('settings.signingOut') : t('common.signOut')}
        </Button>
      </div>
    </div>
  );
}