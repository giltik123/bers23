import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { TranslationProvider, useTranslation } from '@/lib/i18n/TranslationProvider';
import ScrollToTop from './components/ScrollToTop';
import { Navigate } from 'react-router-dom';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/AppLayout';

// Keep each top-level journey out of the initial bundle. Authentication and
// routing remain eager so lazy UI code never becomes a session authority.
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const Projects = lazy(() => import('@/pages/Projects'));
const Editor = lazy(() => import('@/pages/Editor'));
const Wardrobe = lazy(() => import('@/pages/Wardrobe'));
const Settings = lazy(() => import('@/pages/Settings'));
const AssetLibrary = lazy(() => import('@/pages/AssetLibrary'));
const AutomationStudio = lazy(() => import('@/pages/AutomationStudio'));

// Never expose this standalone, unauthoritative image lab in deployed builds.
// It cannot create or accept Core FINAL Artifacts and cannot upload images.
const EDITOR_PRO_LAB_LOCAL_ONLY = import.meta.env.DEV &&
  import.meta.env.VITE_BERS_EDITOR_PRO_LAB === 'true';
const ProfessionalEditorLabRND = lazy(() => import('@/pages/ProfessionalEditorLabRND'));

function RouteLoading() {
  const { t } = useTranslation();
  return (
    <div role="status" className="flex min-h-[40vh] items-center justify-center p-6 text-sm text-muted-foreground">
      {t('common.loading')}
    </div>
  );
}

const AuthenticatedApp = () => {
  const { t } = useTranslation();
  const { isLoadingAuth, isLoadingPublicSettings } = useAuth();

  // Resolve the initial session check before choosing public or protected routes.
  // Auth denial itself is handled only by ProtectedRoute. Keeping that decision
  // out of this global wrapper ensures /login, /register and recovery routes can
  // render when the canonical session endpoint correctly returns 401.
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed inset-0 flex items-center justify-center"
      >
        <span className="sr-only">{t('common.loading')}</span>
        <div
          aria-hidden="true"
          className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"
        />
      </div>
    );
  }

  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Projects />} />
          <Route path="/editor" element={<Editor />} />
          <Route path="/wardrobe" element={<Wardrobe />} />
          {EDITOR_PRO_LAB_LOCAL_ONLY && (
            <Route path="/editor-pro-lab" element={
              <Suspense fallback={<p role="status" className="p-6">Loading local image-quality lab…</p>}>
                <ProfessionalEditorLabRND />
              </Suspense>
            } />
          )}
          <Route path="/settings" element={<Settings />} />
          <Route path="/billing" element={<Navigate to="/settings" replace />} />
          <Route path="/subscription" element={<Navigate to="/settings" replace />} />
          <Route path="/assets" element={<AssetLibrary />} />
          <Route path="/automations" element={<AutomationStudio />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
};


function App() {

  return (
    <AuthProvider>
      <TranslationProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <ScrollToTop />
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </TranslationProvider>
    </AuthProvider>
  )
}

export default App
