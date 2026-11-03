import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

// Unknown routes are public. Let the existing ProtectedRoute decide whether
// the Projects destination needs login; never make a second Auth request here.
export default function PageNotFound() {
  const { t } = useTranslation();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12 text-foreground">
      <section aria-labelledby="not-found-title" className="w-full max-w-md space-y-5 rounded-2xl border border-border bg-card p-6 text-center shadow-sm sm:p-8">
        <p className="text-6xl font-semibold tracking-tight text-muted-foreground" aria-hidden="true">404</p>
        <h1 id="not-found-title" className="text-2xl font-semibold">{t('notFoundUi.title')}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{t('notFoundUi.hint')}</p>
        <Link
          to="/"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('notFoundUi.backToProjects')}
        </Link>
      </section>
    </main>
  );
}
