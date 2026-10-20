import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Shirt } from 'lucide-react';
import FashionPanel from '@/components/editor/fashion/FashionPanel';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

// Garment management is the sole dedicated Fashion page. It uses the existing
// canonical wardrobe client; returning to the editor never recreates a Project.
export default function Wardrobe() {
  const location = useLocation();
  const { language } = useTranslation();
  const id = new URLSearchParams(location.search).get('project');
  const projectId = typeof id === 'string' && /^[\w-]{1,128}$/.test(id) ? id : null;
  const backTo = projectId ? `/editor?id=${encodeURIComponent(projectId)}` : '/';
  const voiceQuery = location.state?.voiceQuery || null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <Link to={backTo} className="inline-flex min-h-11 items-center gap-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {language === 'ru' ? 'Назад к редактору' : 'Back to workspace'}
      </Link>
      <header className="flex items-center gap-3">
        <span className="rounded-2xl bg-primary/10 p-3 text-primary"><Shirt className="h-6 w-6" aria-hidden="true" /></span>
        <div>
          <h1 className="text-2xl font-semibold">{language === 'ru' ? 'Мой гардероб' : 'My wardrobe'}</h1>
          <p className="text-sm text-muted-foreground">{language === 'ru'
            ? 'Вещи, фотографии и коллекции — отдельно от рабочего экрана.'
            : 'Manage garments, photos and collections outside the main workspace.'}</p>
        </div>
      </header>
      <FashionPanel voiceQuery={voiceQuery} />
    </div>
  );
}
