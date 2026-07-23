export const assetRelations = {
  project(project) { return [{ type: 'original_image', asset_key: `image:${project.id}`, label: 'Original image' }, ...(project.versions || []).map((version) => ({ type: 'version', asset_key: `version:${project.id}:${version.id}`, label: version.name }))]; },
  object(project, object) { return [{ type: 'project', asset_key: `project:${project.id}`, label: project.name }, ...(object.mask_url ? [{ type: 'mask', asset_key: `mask:${project.id}:${object.id}`, label: `${object.label} mask` }] : [])]; },
};