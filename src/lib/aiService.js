import { coreClient } from '@/api/coreClient';

// Single AI gateway — every AI request in the app goes through here.
// The backend 'aiService' function routes to the right provider
// (fal.ai SAM for segmentation, Reve for editing, FASHN for try-on),
// decides parameters and credit cost, and normalizes results.
async function invoke(action, params) {
  const response = await coreClient.functions.invoke('aiService', { action, ...params });
  if (response.data?.error) throw new Error(response.data.error);
  return response.data;
}

export const aiService = {
  // Returns { objects: [{ id, label, box: {x,y,w,h} (normalized 0-1), mask_url }] }
  detectObjects: (projectId, imageUrl) => invoke('segment', {
    operation_id: 'sam3.segment', project_id: projectId, image_url: imageUrl,
  }),

  // Edits ONLY the selected object. Returns { image_url }
  editObject: ({ projectId, imageUrl, maskUrl, objectLabel, instruction }) =>
    invoke('edit', { operation_id: 'reve.edit', project_id: projectId, image_url: imageUrl, mask_url: maskUrl, object_label: objectLabel, instruction }),

  // Virtual try-on. Returns { image_url }
  tryOn: ({ projectId, personImageUrl, garmentImageUrl }) =>
    invoke('tryon', { operation_id: 'fashn.tryon', project_id: projectId, person_image_url: personImageUrl, garment_image_url: garmentImageUrl }),
};
