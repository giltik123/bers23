import React, { useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Sparkles, Settings, CreditCard, Library, Workflow } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import NotificationCenter from '@/components/NotificationCenter';
import { deviceProfiler } from '@/lib/performance/deviceProfiler';
import { memoryManager } from '@/lib/performance/memoryManager';
import { imageMemoryCache } from '@/lib/performance/imageMemoryCache';
import { previewCache } from '@/lib/performance/previewCache';
import { performanceMonitor } from '@/lib/performance/performanceMonitor';
import { resourceScheduler } from '@/lib/performance/resourceScheduler';
import { appStateManager } from '@/lib/performance/appStateManager';
import { networkManager } from '@/lib/performance/networkManager';
import { offlineQueue } from '@/lib/performance/offlineQueue';
import { sessionRecovery } from '@/lib/performance/sessionRecovery';
import { usePlatformProfile } from '@/lib/platform/PlatformManager';
import { adaptiveCachePolicy } from '@/lib/platform/AdaptiveCachePolicy';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

export default function AppLayout() {
  const location = useLocation();
  const platform = usePlatformProfile();
  const { t } = useTranslation();
  useEffect(() => {
    memoryManager.configure(deviceProfiler.refresh()); performanceMonitor.start(); resourceScheduler.evaluate(); networkManager.snapshot();
    const unsubscribe = appStateManager.subscribe((state) => { if (state === 'hidden') { imageMemoryCache.setVisible([]); previewCache.cancelAll(); performanceMonitor.stop(); } else { performanceMonitor.start(); resourceScheduler.evaluate(); } });
    return unsubscribe;
  }, []);
  useEffect(() => { memoryManager.configure({ cacheMb: adaptiveCachePolicy(platform).cacheMb }); }, [platform.formFactor]);
  useEffect(() => { sessionRecovery.saveRoute(`${location.pathname}${location.search}`); offlineQueue.snapshot(); }, [location.pathname, location.search]);
  return (
    <div data-platform={platform.formFactor} className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 h-14">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </span>
            <span className="hidden sm:inline">{t('common.appName')}</span>
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <NotificationCenter />
            <Link to="/subscription" className="p-2 rounded-lg hover:bg-accent transition-colors" aria-label={t('billing.subscription')}>
              <CreditCard className="w-5 h-5" />
            </Link>
            <Link to="/automations" className="p-2 rounded-lg hover:bg-accent transition-colors" aria-label={t('automation.title')}>
              <Workflow className="w-5 h-5" />
            </Link>
            <Link to="/assets" className="p-2 rounded-lg hover:bg-accent transition-colors" aria-label={t('assets.title')}>
              <Library className="w-5 h-5" />
            </Link>
            <Link to="/settings" className="p-2 rounded-lg hover:bg-accent transition-colors" aria-label={t('settings.title')}>
              <Settings className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}