export const assetPreviewGenerator = {
  image(url, before = '') { return { thumbnail: url || '', preview: url || '', medium_preview: url || '', high_preview: url || '', comparison_preview: before && url ? { before, after: url } : {} }; },
  project(project) { return this.image(project.thumbnail_url || project.current_image_url || project.original_image_url, project.original_image_url); },
};