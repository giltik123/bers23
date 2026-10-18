import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Sparkles, FolderOpen, Images, Workflow, CreditCard, Settings2, Menu, X } from 'lucide-react';
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

function NavLink({ path, label, icon: Icon, active, onNavigate, compact = false }) {
  return (
    <Link
      to={path}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      className={[
        'inline-flex min-h-11 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        compact ? 'w-full justify-start' : '',
        active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      ].join(' ')}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {label}
    </Link>
  );
}

export default function AppLayout() {
  const location = useLocation();
  const platform = usePlatformProfile();
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    memoryManager.configure(deviceProfiler.refresh()); performanceMonitor.start(); resourceScheduler.evaluate(); networkManager.snapshot();
    const unsubscribe = appStateManager.subscribe((state) => {
      if (state === 'hidden') { imageMemoryCache.setVisible([]); previewCache.cancelAll(); performanceMonitor.stop(); }
      else { performanceMonitor.start(); resourceScheduler.evaluate(); }
    });
    return unsubscribe;
  }, []);
  useEffect(() => { memoryManager.configure({ cacheMb: adaptiveCachePolicy(platform).cacheMb }); }, [platform.formFactor]);
  useEffect(() => { sessionRecovery.saveRoute([location.pathname, location.search].join('')); offlineQueue.snapshot(); setMenuOpen(false); }, [location.pathname, location.search]);

  const navigation = [
    { path: '/', label: t('navUi.projects'), icon: FolderOpen },
    { path: '/assets', label: t('assets.title'), icon: Images },
    { path: '/automations', label: t('automation.title'), icon: Workflow },
  ];
  const accountNavigation = [
    { path: '/subscription', label: t('billing.subscription'), icon: CreditCard },
    { path: '/settings', label: t('settings.title'), icon: Settings2 },
  ];
  const isActive = (path) => path === '/' ? (location.pathname === '/' || location.pathname === '/editor') : location.pathname === path;

  return (
    <div data-platform={platform.formFactor} className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-card/95 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex min-h-[72px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-3 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" aria-label={t("navUi.home")}>
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm" aria-hidden="true">
              <Sparkles className="h-5 w-5" />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-lg font-bold tracking-tight">BERS</span>
              <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{t("navUi.brand")}</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label={t("navUi.main")}>
            {navigation.map((item) => <NavLink key={item.path} {...item} active={isActive(item.path)} />)}
          </nav>

          <div className="hidden items-center gap-1 lg:flex" aria-label={t("navUi.account")}>
            <NavLink {...accountNavigation[0]} active={isActive('/subscription')} />
            <span className="mx-1 h-7 w-px bg-border" aria-hidden="true" />
            <NotificationCenter />
            <ThemeToggle showLabel />
            <NavLink {...accountNavigation[1]} active={isActive('/settings')} />
          </div>

          <button
            type="button"
            aria-label={menuOpen ? t("navUi.closeMenu") : t("navUi.openMenu")}
            aria-controls="bers-mobile-navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground lg:hidden"
          >
            {menuOpen ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
            {menuOpen ? t("navUi.close") : t("navUi.menu")}
          </button>
        </div>

        {menuOpen && (
          <nav id="bers-mobile-navigation" className="border-t border-border/70 bg-card px-4 pb-4 pt-3 shadow-lg lg:hidden" aria-label={t("navUi.mobile")}>
            <div className="mx-auto max-w-7xl space-y-1">
              {navigation.map((item) => <NavLink key={item.path} {...item} active={isActive(item.path)} onNavigate={() => setMenuOpen(false)} compact />)}
              <div className="my-2 border-t border-border/70" />
              {accountNavigation.map((item) => <NavLink key={item.path} {...item} active={isActive(item.path)} onNavigate={() => setMenuOpen(false)} compact />)}
              <div className="flex flex-wrap items-center gap-2 px-2 pt-3" aria-label={t("navUi.preferences")}>
                <NotificationCenter />
                <ThemeToggle showLabel />
              </div>
            </div>
          </nav>
        )}
      </header>
      <main id="main-content" className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
