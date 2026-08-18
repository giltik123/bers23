import type { IncomingMessage, ServerResponse } from 'node:http';

/** Node transport only; all routing and application logic stays in the Fetch handler. */
export function nodeHttpAdapter(handler: (request: Request) => Promise<Response>) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    const origin = `http://${request.headers.host ?? 'localhost'}`;
    const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await readBody(request);
    const result = await handler(new Request(new URL(request.url ?? '/', origin), { method: request.method, headers: request.headers as HeadersInit, body }));
    response.statusCode = result.status;
    result.headers.forEach((value, key) => response.setHeader(key, value));
    response.end(Buffer.from(await result.arrayBuffer()));
  };
}
async function readBody(request: IncomingMessage): Promise<Uint8Array> { const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks); }
