import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// FASHN Virtual Try-On provider endpoint (via fal.ai). Takes a model (person)
// image and a garment image, returns the re-dressed image URL.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { model_image, garment_image, category } = await req.json();
    if (!model_image || !garment_image) {
      return Response.json({ error: 'model_image and garment_image are required' }, { status: 400 });
    }

    const falKey = Deno.env.get('FAL_KEY');
    const started = Date.now();
    const res = await fetch('https://fal.run/fal-ai/fashn/tryon/v1.6', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${falKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_image,
        garment_image,
        category: category || 'auto',
        mode: 'balanced',
        output_format: 'png',
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('FASHN error', res.status, detail);
      return Response.json({ error: `Try-on generation failed (${res.status})`, detail }, { status: 502 });
    }

    const data = await res.json();
    const imageUrl = data.images?.[0]?.url;
    if (!imageUrl) {
      return Response.json({ error: 'Try-on returned no image' }, { status: 502 });
    }

    return Response.json({
      image_url: imageUrl,
      provider: 'fashn',
      generation_time_ms: Date.now() - started,
      credits_used: 50,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});