export const assetTags = {
  normalize(values = []) { return [...new Set(values.filter(Boolean).map((value) => String(value).trim().toLowerCase()))]; },
  fromProject(project) { return this.normalize([project.status, ...(project.objects || []).map((item) => item.label), ...(project.metadata?.scene_memory?.profiles?.color?.palette || [])]); },
};