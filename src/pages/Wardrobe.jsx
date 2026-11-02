import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Shirt } from 'lucide-react';
import FashionPanel from '@/components/editor/fashion/FashionPanel';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

// Garment management is the sole dedicated Fashion page. It uses the existing
// canonical wardrobe client; returning to the editor never recreates a Project.
export default function Wardrobe() {
  const location = useLocation();
  const { t } = useTranslation();
  const id = new URLSearchParams(location.search).get('project');
  const projectId = typeof id === 'string' && /^[\w-]{1,128}$/.test(id) ? id : null;
  const backTo = projectId ? `/editor?id=${encodeURIComponent(projectId)}&mode=fashion` : '/';
  const voiceQuery = location.state?.voiceQuery || null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <Link to={backTo} className="inline-flex min-h-11 items-center gap-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {projectId ? t('fashionUi.backToEditor') : t('fashionUi.backToProjects')}
      </Link>
      <header className="flex items-center gap-3">
        <span className="rounded-2xl bg-primary/10 p-3 text-primary"><Shirt className="h-6 w-6" aria-hidden="true" /></span>
        <div>
          <h1 className="text-2xl font-semibold">{t('fashionUi.wardrobe')}</h1>
          <p className="text-sm text-muted-foreground">{t('fashionUi.pageDescription')}</p>
        </div>
      </header>
      <FashionPanel voiceQuery={voiceQuery} />
    </div>
  );
}
