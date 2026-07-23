import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { encodeBase64, decodeBase64 } from 'jsr:@std/encoding@1/base64';

// Central AI Service — the ONLY place AI providers are called.
// Routes: segment (object detection), edit (Reve, object-scoped), tryon (fal.ai FASHN).

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    switch (body.action) {
      case 'segment': return Response.json(await segment(base44, body));
      case 'edit': return Response.json(await edit(base44, body));
      case 'tryon': return Response.json(await tryon(base44, body));
      default: return Response.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// --- Segmentation: enumerate editable objects with labels + normalized boxes ---
async function segment(base44, { image_url }) {
  if (!image_url) throw new Error('image_url is required');
  const result = await base44.integrations.Core.InvokeLLM({
    prompt: 'Detect the distinct editable objects in this photo (people, clothing items, furniture, vehicles, products, animals, etc). For each object return a short human label and its bounding box normalized to 0-1 (x,y = top-left corner, w,h = size). Return at most 12 of the most prominent objects. Boxes must be tight around each object.',
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
  const objects = (result.objects || []).map((o, i) => ({
    id: `obj_${i}`,
    label: o.label,
    box: { x: clamp01(o.x), y: clamp01(o.y), w: clamp01(o.w), h: clamp01(o.h) },
  }));
  return { objects };
}

// --- Object-scoped edit: SAM mask (fal.ai) + Reve instruction edit ---
async function edit(base44, { image_url, object_label, instruction }) {
  if (!image_url || !instruction) throw new Error('image_url and instruction are required');

  // Precise object mask via fal.ai SAM (text-prompted concept segmentation)
  let maskUrl = null;
  try {
    const sam = await falRun('fal-ai/sam-3/image', { image_url, prompt: object_label, return_multiple_masks: true, max_masks: 1 });
    maskUrl = sam?.masks?.[0]?.url || sam?.image?.url || null;
  } catch (e) {
    // Mask is an enhancement for edit precision; the constrained Reve edit still applies.
    console.warn('SAM segmentation failed:', e.message);
  }

  // Instruction-based edit via Reve, strictly scoped to the selected object
  const imageRes = await fetch(image_url);
  if (!imageRes.ok) throw new Error('Could not load source image');
  const imageB64 = encodeBase64(new Uint8Array(await imageRes.arrayBuffer()));

  const reveRes = await fetch('https://api.reve.com/v1/image/edit', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('REVE_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      edit_instruction: `Edit ONLY the ${object_label || 'selected object'}: ${instruction}. Keep every other part of the image exactly identical — same composition, lighting, perspective, colors and background.`,
      reference_image: imageB64,
    }),
  });
  if (!reveRes.ok) {
    const errText = await reveRes.text();
    throw new Error(`Reve edit failed (${reveRes.status}): ${errText.slice(0, 300)}`);
  }
  const reveData = await reveRes.json();
  if (reveData.content_violation) throw new Error('The edit was rejected by the content policy');
  const outB64 = reveData.image;
  if (!outB64) throw new Error('Reve returned no image');

  const file = new File([decodeBase64(outB64)], 'edit.png', { type: 'image/png' });
  const { file_url } = await base44.integrations.Core.UploadFile({ file });
  return { image_url: file_url, mask_url: maskUrl };
}

// --- Virtual try-on via fal.ai FASHN v1.6 ---
async function tryon(_base44, { person_image_url, garment_image_url }) {
  if (!person_image_url || !garment_image_url) throw new Error('person and garment images are required');
  const result = await falRun('fal-ai/fashn/tryon/v1.6', {
    model_image: person_image_url,
    garment_image: garment_image_url,
  });
  const url = result?.images?.[0]?.url;
  if (!url) throw new Error('Try-on returned no image');
  return { image_url: url };
}

// --- fal.ai transport ---
async function falRun(model, input) {
  const res = await fetch(`https://fal.run/${model}`, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${Deno.env.get('FAL_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`fal.ai ${model} failed (${res.status}): ${errText.slice(0, 300)}`);
  }
  return await res.json();
}

function clamp01(n) {
  return Math.max(0, Math.min(1, Number(n) || 0));
}