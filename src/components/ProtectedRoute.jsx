import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

export default function ProtectedRoute({ fallback = <DefaultFallback />, unauthenticatedElement }) {
  const { isAuthenticated, isLoadingAuth, authChecked, authError, checkUserAuth } = useAuth();
  const { t } = useTranslation();

  useEffect(() => {
    if (!authChecked && !isLoadingAuth) {
      checkUserAuth().catch(() => {});
    }
  }, [authChecked, isLoadingAuth, checkUserAuth]);

  if (isLoadingAuth || !authChecked) {
    return fallback;
  }

  // Only canonical 401/403 is an auth denial. An unknown/network failure must
  // not silently navigate away from the current Project/Editor route.
  if (authError && !isAuthenticated) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    if (authError.type === 'unknown') {
      return (
        <main className="flex min-h-[50vh] items-center justify-center p-6">
          <div role="alert" className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-6 text-center">
            <p className="text-sm text-foreground">{t('errors.generic')}</p>
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-medium hover:bg-accent"
              disabled={isLoadingAuth}
              onClick={() => { void checkUserAuth().catch(() => {}); }}
            >
              {t('common.retry')}
            </button>
          </div>
        </main>
      );
    }
    return unauthenticatedElement;
  }

  if (!isAuthenticated) {
    return unauthenticatedElement;
  }

  return <Outlet />;
}
