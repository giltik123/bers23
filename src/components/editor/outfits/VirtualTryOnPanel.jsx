import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import { coreClient } from '@/api/coreClient';

export default function VirtualTryOnPanel({ disabled, needsAccountSetup, onPrepareAccount, onRun, onOpenWardrobe }) {
  const { t } = useTranslation();
  const [garments, setGarments] = useState([]);
  const [garmentId, setGarmentId] = useState('');
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    coreClient.fashion.wardrobe.list().then(items => {
      if (active) setGarments(items.filter(item => item.status === 'ACTIVE' && ['tops', 'bottoms', 'dresses'].includes(item.categoryGroup)));
    }).catch(cause => { if (active) setError(cause?.message || t('fashionUi.virtualTryOnError')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [t]);
  return <section className="rounded-xl border bg-card p-4 space-y-3" aria-label={t('fashionUi.virtualTryOnPanelLabel')}>
    <h3 className="font-medium">{t('fashionUi.virtualTryOnTitle')}</h3>
    <p className="text-sm text-muted-foreground">{t('fashionUi.virtualTryOnIntro')}</p>
    <label className="block text-sm">{t('fashionUi.virtualTryOnGarmentLabel')}
      <select className="mt-1 w-full rounded-md border bg-background p-2" value={garmentId} disabled={disabled || loading} onChange={event => { setGarmentId(event.target.value); setConsent(false); }}>
        <option value="">{loading ? t('fashionUi.virtualTryOnLoadingGarments') : t('fashionUi.virtualTryOnChooseGarment')}</option>
        {garments.map(item => <option key={item.garmentId} value={item.garmentId}>{item.name || item.category || t('fashionUi.virtualTryOnGarmentFallback')}</option>)}
      </select>
    </label>
    {!loading && garments.length === 0 && <p className="text-sm">{t('fashionUi.virtualTryOnNoGarments')}</p>}
    <Button variant="outline" onClick={onOpenWardrobe} disabled={disabled}>{t('fashionUi.virtualTryOnOpenWardrobe')}</Button>
    <label className="flex gap-2 text-sm items-start"><input type="checkbox" checked={consent} disabled={disabled || !garmentId} onChange={event => setConsent(event.target.checked)} /><span>{t('fashionUi.virtualTryOnConsent')}</span></label>
    <p className="text-xs text-muted-foreground">{t('fashionUi.virtualTryOnQualityNote')}</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {needsAccountSetup && <div className="space-y-2" role="status">
      <p className="text-sm">{t('fashionUi.virtualTryOnAccountSetup')}</p>
      <Button variant="outline" disabled={disabled} onClick={onPrepareAccount}>{t('fashionUi.virtualTryOnPrepareAccount')}</Button>
    </div>}
    <Button disabled={disabled || needsAccountSetup || loading || !garmentId || !consent} onClick={() => onRun({ garmentId, tryOnConsent: consent })}>{t('fashionUi.virtualTryOnRun')}</Button>
  </section>;
}
