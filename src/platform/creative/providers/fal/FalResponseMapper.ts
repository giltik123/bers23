import { falDeepFreeze } from './immutable';

export class FalResponseMapper {
  job(response: unknown): { requestId: string; statusUrl?: string; responseUrl?: string } | undefined {
    if (!response || typeof response !== 'object') return undefined; const value = response as Record<string, unknown>; const requestId = value.request_id;
    if (typeof requestId !== 'string' || this.urls(response).length) return undefined;
    return falDeepFreeze({ requestId, statusUrl: typeof value.status_url === 'string' ? value.status_url : undefined, responseUrl: typeof value.response_url === 'string' ? value.response_url : undefined });
  }
  urls(response: unknown): readonly string[] {
    const found: string[] = []; const visit = (value: unknown, key = ''): void => { if (typeof value === 'string' && /^https?:\/\//.test(value) && /(url|image|video|file)/i.test(key)) found.push(value); else if (Array.isArray(value)) value.forEach((v) => visit(v, key)); else if (value && typeof value === 'object') Object.entries(value as Record<string, unknown>).forEach(([k, v]) => visit(v, k)); }; visit(response); return falDeepFreeze([...new Set(found)]);
  }
  cost(response: unknown): number | undefined { if (!response || typeof response !== 'object') return undefined; const v = response as Record<string, unknown>; const metrics = v.metrics as Record<string, unknown> | undefined; const candidate = v.cost ?? v.cost_usd ?? metrics?.cost ?? metrics?.cost_usd; return typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0 ? candidate : undefined; }
  data(response: unknown): Readonly<Record<string, unknown>> { return falDeepFreeze(response && typeof response === 'object' ? { ...(response as Record<string, unknown>) } : { value: response }); }
}
