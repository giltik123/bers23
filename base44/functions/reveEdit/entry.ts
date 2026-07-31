import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { encodeBase64, decodeBase64 } from 'jsr:@std/encoding@1/base64';
import { loadTrustedImage, trustedAssetHosts } from './assetSecurity.ts';
import { authorizationService, AuthorizationError } from '../_shared/authorizationService.ts';

// Reve transport — the ONLY place the Reve API is called. API key never leaves the server;
// raw provider responses are never exposed to the client.
const REVE_ENDPOINT = 'https://api.reve.com/v1/image/edit';
const TIMEOUT_MS = 90000;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();

    if (body.action === 'health') {
      return Response.json({ ok: !!Deno.env.get('REVE_API_KEY'), provider: 'reve' });
    }

    const authorization = await authorizationService.authorizeOperation(
      base44,
      body.operation_id,
      body.project_id,
    );
    if (authorization.operation.operation_id !== 'reve.edit') {
      return Response.json({ error: 'Unknown AI operation', code: 'unknown_operation' }, { status: 400 });
    }

    const { image_url, prompt } = body;
    if (!image_url || !prompt) return Response.json({ error: 'image_url and prompt are required' }, { status: 400 });

    const started = Date.now();
    let sourceImage;
    try {
      sourceImage = await loadTrustedImage(image_url, trustedAssetHosts(Deno.env));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid prepared image';
      return Response.json({ error: message, code: 'invalid_image' }, { status: 422 });
    }
    const imageB64 = encodeBase64(sourceImage.bytes);

    let reveRes;
    try {
      reveRes = await fetch(REVE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('REVE_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ edit_instruction: prompt, reference_image: imageB64 }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      const timedOut = e.name === 'TimeoutError' || e.name === 'AbortError';
      return Response.json({ error: timedOut ? 'Generation timed out' : 'Editing provider is offline', code: timedOut ? 'timeout' : 'offline' }, { status: 504 });
    }

    if (!reveRes.ok) {
      const status = reveRes.status;
      await reveRes.text(); // drain; never forward raw provider body
      if (status === 429) return Response.json({ error: 'Rate limit reached — try again shortly', code: 'rate_limit' }, { status: 429 });
      if (status === 401 || status === 403) return Response.json({ error: 'Editing provider authentication failed', code: 'auth' }, { status: 502 });
      if (status === 400) return Response.json({ error: 'The edit request was rejected as invalid', code: 'invalid_prompt' }, { status: 422 });
      return Response.json({ error: `Generation failed (${status})`, code: 'generation_failed' }, { status: 502 });
    }

    const reveData = await reveRes.json();
    if (reveData.content_violation) return Response.json({ error: 'The edit was rejected by the content policy', code: 'invalid_prompt' }, { status: 422 });
    if (!reveData.image) return Response.json({ error: 'Generation returned no image', code: 'generation_failed' }, { status: 502 });

    const file = new File([decodeBase64(reveData.image)], 'generation.png', { type: 'image/png' });
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    return Response.json({
      image_url: file_url,
      provider: 'reve',
      generation_time_ms: Date.now() - started,
      credits_used: reveData.credits_used ?? 1,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});
