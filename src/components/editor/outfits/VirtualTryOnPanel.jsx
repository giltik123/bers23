import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { coreClient } from '@/api/coreClient';
import { eligibleTryOnGarments, canSubmitTryOn } from './virtualTryOnWardrobe';

export default function VirtualTryOnPanel({ disabled, needsAccountSetup, onPrepareAccount, onRun, onOpenWardrobe }) {
  const [garments, setGarments] = useState([]);
  const [garmentId, setGarmentId] = useState('');
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [runError, setRunError] = useState('');
  const requestRef = useRef(0);
  const runningRef = useRef(false);

  const refresh = useCallback(async () => {
    const request = ++requestRef.current;
    // A previously confirmed selection/consent must never authorize a new
    // execution while the canonical wardrobe snapshot is being reconciled.
    setLoading(true);
    setError('');
    setRunError('');
    setGarments([]);
    setGarmentId('');
    setConsent(false);
    try {
      const items = await coreClient.fashion.wardrobe.list();
      if (request === requestRef.current) setGarments(eligibleTryOnGarments(items));
    } catch (cause) {
      if (request === requestRef.current) {
        setGarments([]);
        setError(cause?.message || 'Не удалось загрузить гардероб');
      }
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => { requestRef.current += 1; };
  }, [refresh]);

  const canRun = typeof onRun === 'function' && canSubmitTryOn({
    disabled, needsAccountSetup, loading, running, error, garments, garmentId, consent,
  });
  const run = async () => {
    if (!canRun || runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setRunError('');
    // A second paid request always requires a fresh explicit consent.
    setConsent(false);
    try {
      await onRun({ garmentId, tryOnConsent: true });
    } catch (cause) {
      setRunError(cause?.message || 'Не удалось запустить примерку');
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  };

  return <section className="rounded-xl border bg-card p-4 space-y-3" aria-label="Примерка одежды">
    <h3 className="font-medium">Примерить одежду</h3>
    <p className="text-sm text-muted-foreground">Текущее фото — человек для примерки. Выберите вещь из гардероба. Ручные маски и точки тела не требуются. На фото вещи может быть другой человек.</p>
    <label className="block text-sm">Вещь
      <select className="mt-1 w-full rounded-md border bg-background p-2" value={garmentId}
        disabled={disabled || loading || running || Boolean(error)}
        onChange={event => { setGarmentId(event.target.value); setConsent(false); }}>
        <option value="">{loading ? 'Загрузка…' : error ? 'Гардероб недоступен' : 'Выберите верх, низ или платье'}</option>
        {garments.map(item => <option key={item.garmentId} value={item.garmentId}>{item.name || item.category || 'Вещь'}</option>)}
      </select>
    </label>
    {!loading && !error && garments.length === 0 && <p className="text-sm">Сначала добавьте фотографию вещи в гардероб.</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" onClick={onOpenWardrobe} disabled={disabled || running}>Открыть гардероб</Button>
      <Button type="button" variant="outline" onClick={() => void refresh()} disabled={disabled || loading || running}>
        {error ? 'Повторить загрузку' : 'Обновить список вещей'}
      </Button>
    </div>
    <label className="flex gap-2 text-sm items-start">
      <input type="checkbox" checked={consent} disabled={disabled || loading || running || Boolean(error) || !garmentId}
        onChange={event => setConsent(event.target.checked)} />
      <span>Разрешаю отправить текущее фото и фото вещи в FAL / FASHN для облачной примерки.</span>
    </label>
    <p className="text-xs text-muted-foreground">Закрытая телом одежда, несколько людей и необычные ракурсы могут ухудшить результат. Перед сохранением проверьте лицо, руки и посадку в сравнении «До / После».</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}. Обновите список, чтобы снова выбрать вещь.</p>}
    {runError && <p role="alert" className="text-sm text-destructive">{runError}</p>}
    {needsAccountSetup && <div className="space-y-2" role="status">
      <p className="text-sm">Для первой бесплатной облачной примерки нужна подготовка аккаунта. Покупать подписку или кредиты не нужно. Доступность ограничена серверным бесплатным лимитом. После подготовки нажмите «Примерить».</p>
      <Button type="button" variant="outline" disabled={disabled || running} onClick={onPrepareAccount}>Подготовить облачную обработку</Button>
    </div>}
    <Button type="button" disabled={!canRun} onClick={() => void run()}>{running ? 'Примерка выполняется…' : 'Примерить'}</Button>
  </section>;
