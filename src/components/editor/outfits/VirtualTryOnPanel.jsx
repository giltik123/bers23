import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { coreClient } from '@/api/coreClient';

export default function VirtualTryOnPanel({ disabled, needsAccountSetup, onPrepareAccount, onRun, onOpenWardrobe }) {
  const [garments, setGarments] = useState([]);
  const [garmentId, setGarmentId] = useState('');
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    coreClient.fashion.wardrobe.list().then(items => {
      if (active) setGarments(items.filter(item => item.status === 'ACTIVE' && ['tops', 'bottoms', 'dresses'].includes(item.categoryGroup)));
    }).catch(cause => { if (active) setError(cause?.message || 'Не удалось загрузить гардероб'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  return <section className="rounded-xl border bg-card p-4 space-y-3" aria-label="Примерка одежды">
    <h3 className="font-medium">Примерить одежду</h3>
    <p className="text-sm text-muted-foreground">Текущее фото — человек для примерки. Выберите вещь из гардероба. Ручные маски и точки тела не требуются. На фото вещи может быть другой человек.</p>
    <label className="block text-sm">Вещь
      <select className="mt-1 w-full rounded-md border bg-background p-2" value={garmentId} disabled={disabled || loading} onChange={event => { setGarmentId(event.target.value); setConsent(false); }}>
        <option value="">{loading ? 'Загрузка…' : 'Выберите верх, низ или платье'}</option>
        {garments.map(item => <option key={item.garmentId} value={item.garmentId}>{item.name || item.category || 'Вещь'}</option>)}
      </select>
    </label>
    {!loading && garments.length === 0 && <p className="text-sm">Сначала добавьте фотографию вещи в гардероб.</p>}
    <Button variant="outline" onClick={onOpenWardrobe} disabled={disabled}>Открыть гардероб</Button>
    <label className="flex gap-2 text-sm items-start"><input type="checkbox" checked={consent} disabled={disabled || !garmentId} onChange={event => setConsent(event.target.checked)} /><span>Разрешаю отправить текущее фото и фото вещи в FAL / FASHN для облачной примерки.</span></label>
    <p className="text-xs text-muted-foreground">Закрытая телом одежда, несколько людей и необычные ракурсы могут ухудшить результат. Перед сохранением проверьте лицо, руки и посадку в сравнении «До / После».</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {needsAccountSetup && <div className="space-y-2" role="status">
      <p className="text-sm">Для первого облачного запуска нужно подготовить аккаунт. Бесплатный лимит назначает сервер. После подготовки нажмите «Примерить».</p>
      <Button variant="outline" disabled={disabled} onClick={onPrepareAccount}>Подготовить облачную обработку</Button>
    </div>}
    <Button disabled={disabled || needsAccountSetup || loading || !garmentId || !consent} onClick={() => onRun({ garmentId, tryOnConsent: consent })}>Примерить</Button>
  </section>;
}
