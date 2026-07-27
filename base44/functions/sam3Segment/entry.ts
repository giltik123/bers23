import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// SAM3 segmentation transport — the only place fal.ai SAM 3 is called.
// Detects labeled objects (with boxes), then fetches a SAM 3 mask per object.
// Returns the internal shape: { objects: [{ label, box, confidence, mask_url }], api_time_ms }.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();

    if (body.action === 'health') {
      return Response.json({ healthy: !!Deno.env.get('FAL_KEY'), provider: 'fal-ai/sam-3' });
    }

    if (body.action === 'mask_debug') {
      if (user.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (!body.image_url || !body.prompt) {
        return Response.json({ error: 'image_url and prompt are required' }, { status: 400 });
      }
      const res = await fetch('https://fal.run/fal-ai/sam-3/image', {
        method: 'POST',
        headers: { 'Authorization': `Key ${Deno.env.get('FAL_KEY')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: body.image_url, prompt: body.prompt, return_multiple_masks: true, max_masks: 1 }),
      });
      const text = await res.text();
      return Response.json({ status: res.status, body: text.slice(0, 1500) });
    }

    const { image_url } = body;
    if (!image_url) return Response.json({ error: 'image_url is required' }, { status: 400 });

    const t0 = Date.now();

    // 1. Enumerate objects with labels + normalized bounding boxes.
    const det = await base44.integrations.Core.InvokeLLM({
      prompt: 'Detect the distinct editable objects in this photo (people, clothing items, furniture, vehicles, products, animals, etc). For each object return a short human label, a confidence between 0 and 1, and its bounding box as INTEGERS on a 0-1000 grid where (0,0) is the top-left corner of the image and (1000,1000) the bottom-right (x,y = top-left corner of the box, w,h = box size). All four values MUST be integers between 0 and 1000 regardless of the image resolution. Return at most 8 of the most prominent objects. Boxes must be tight around each object.',
      file_urls: [image_url],
      response_json_schema: {
        type: 'object',
        properties: {
          objects: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                confidence: { type: 'number' },
                x: { type: 'number' }, y: { type: 'number' },
                w: { type: 'number' }, h: { type: 'number' },
              },
              required: ['label', 'x', 'y', 'w', 'h'],
            },
          },
        },
        required: ['objects'],
      },
    });
    const detected = (det.objects || []).slice(0, 8);

    // 2. One SAM 3 mask per detected object, in parallel. A failed mask never fails the request.
    const maskResults = await Promise.allSettled(detected.map((o) => falSam3Mask(image_url, o.label)));
    maskResults.forEach((r, i) => {
      if (r.status === 'rejected') console.error(`SAM3 mask failed for "${detected[i].label}":`, r.reason?.message);
    });

    const dims = maskResults.find((r) => r.status === 'fulfilled' && r.value)?.value || null;
    const objects = detected.map((o, i) => ({
      label: o.label,
      confidence: typeof o.confidence === 'number' ? clamp01(o.confidence) : null,
      box: normalizeBox(o, dims),
      mask_url: maskResults[i].status === 'fulfilled' ? (maskResults[i].value?.url || null) : null,
    }));

    return Response.json({ objects, provider: 'fal-ai/sam-3', api_time_ms: Date.now() - t0 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function falSam3Mask(imageUrl, label) {
  const res = await fetch('https://fal.run/fal-ai/sam-3/image', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${Deno.env.get('FAL_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ image_url: imageUrl, prompt: label, return_multiple_masks: true, max_masks: 1 }),
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error('invalid_api_key: fal.ai rejected the API key');
    if (res.status === 429) throw new Error('rate_limit: fal.ai rate limit reached');
    if (res.status === 413) throw new Error('image_too_large: image exceeds provider limits');
    const errText = await res.text();
    throw new Error(`provider_error (${res.status}): ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const mask = data?.masks?.[0] || data?.image || null;
  if (!mask?.url) {
    console.error(`SAM3 empty mask for "${label}"`);
    return null;
  }
  return { url: mask.url, width: mask.width, height: mask.height };
}

// Boxes arrive on a 0-1000 integer grid; convert to 0-1 fractions.
// If a value slipped through as raw pixels, fall back to image dims.
function normalizeBox(o, dims) {
  let { x, y, w, h } = o;
  const maxVal = Math.max(x + w, y + h);
  if (maxVal > 1000 && dims?.width && dims?.height) {
    x /= dims.width; w /= dims.width;
    y /= dims.height; h /= dims.height;
  } else {
    x /= 1000; y /= 1000; w /= 1000; h /= 1000;
  }
  return { x: clamp01(x), y: clamp01(y), w: clamp01(w), h: clamp01(h) };
}

function clamp01(n) {
  return Math.max(0, Math.min(1, Number(n) || 0));
}
