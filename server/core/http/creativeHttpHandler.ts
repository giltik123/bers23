import { publicError, type CreativeHttpCore } from '../composition/createCreativeCore.ts';

/** Framework-neutral Fetch handler used unchanged by every deployment adapter. */
export function createCreativeHttpHandler(core: CreativeHttpCore) {
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      const identity = await core.authenticate(request.headers.get('authorization'));
      if (request.method === 'POST' && url.pathname === '/api/core/creative/execute') {
        const input = await request.json().catch(() => { throw publicError(400, 'Invalid JSON body'); });
        return json(await core.execute(identity, input as never), 202);
      }
      const match = url.pathname.match(/^\/api\/core\/creative\/([^/]+)\/(status|result|cancel)$/);
      if (!match) throw publicError(404, 'Route not found');
      const id = decodeURIComponent(match[1]);
      if (match[2] === 'cancel') {
        if (request.method !== 'POST') throw publicError(405, 'Method not allowed');
        return json(core.cancel(identity, id));
      }
      if (request.method !== 'GET') throw publicError(405, 'Method not allowed');
      return json(match[2] === 'status' ? core.status(identity, id) : core.result(identity, id));
    } catch (error) {
      const status = Number((error as { status?: number }).status) || 500;
      return json({ message: status === 500 ? 'Creative execution failed' : (error as Error).message }, status);
    }
  };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
