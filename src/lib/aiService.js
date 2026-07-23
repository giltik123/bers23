import { base44 } from '@/api/base44Client';

// Single AI gateway — every AI request in the app goes through here.
// The backend 'aiService' function routes to the right provider
// (fal.ai SAM for segmentation, Reve for editing, FASHN for try-on),
// decides parameters and credit cost, and normalizes results.
async function invoke(action, params) {
  const response = await base44.functions.invoke('aiService', { action, ...params });
  if (response.data?.error) throw new Error(response.data.error);
  return response.data;
}

export const aiService = {
  // Returns { objects: [{ id, label, box: {x,y,w,h} (normalized 0-1), mask_url }] }
  detectObjects: (imageUrl) => invoke('segment', { image_url: imageUrl }),

  // Edits ONLY the selected object. Returns { image_url }
  editObject: ({ imageUrl, maskUrl, objectLabel, instruction }) =>
    invoke('edit', { image_url: imageUrl, mask_url: maskUrl, object_label: objectLabel, instruction }),

  // Virtual try-on. Returns { image_url }
  tryOn: ({ personImageUrl, garmentImageUrl }) =>
    invoke('tryon', { person_image_url: personImageUrl, garment_image_url: garmentImageUrl }),
};