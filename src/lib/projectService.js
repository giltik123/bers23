import { coreClient } from '@/api/coreClient';
import { subscriptionValidator } from '@/lib/subscriptions/subscriptionValidator';
import { subscriptionUsage } from '@/lib/subscriptions/subscriptionUsage';

// Project Engine service layer — ALL project CRUD/business operations live here.
// UI components never call the entities SDK directly for projects.

export const genId = () =>
  `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

// Reads natural dimensions of an image URL in the browser.
export function getImageDimensions(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: null, height: null });
    img.src = url;
  });
}

export const projectService = {
  list: () => coreClient.projects.list(),

  get: (id) => coreClient.projects.get(id),

  update: (id, data) => coreClient.projects.update(id, data),

  createFromFile: async (file) => {
    await subscriptionValidator.validateStorage(file.size);
    const project = await coreClient.projects.createFromFile({ file, name: file.name.replace(/\.[^.]+$/, '') });
    await subscriptionUsage.track({ projects: 1, storage: file.size, feature: 'projects' });
    return project;
  },

  rename: (id, name) => coreClient.projects.update(id, { name }),

  remove: (id) => coreClient.projects.delete(id),
  acceptFinal: (id, finalArtifactId, instruction) => coreClient.projects.acceptFinal(id, finalArtifactId, instruction),
  undo: (id) => coreClient.projects.undo(id),
  redo: (id) => coreClient.projects.redo(id),
  restoreOriginal: (id) => coreClient.projects.restoreOriginal(id),
  createVersion: (id, name) => coreClient.projects.createVersion(id, name),
  restoreVersion: (id, versionId) => coreClient.projects.restoreVersion(id, versionId),

  setFavorite: (id, favorite) => coreClient.projects.update(id, { favorite }),

  setArchived: (id, archived) => coreClient.projects.update(id, { archived }),
};

// --- Pure helpers for listing UI ---

export function searchProjects(projects, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return projects;
  return projects.filter((p) => (p.name || '').toLowerCase().includes(q));
}

export const SORT_OPTIONS = [
  { value: 'recent', label: 'Last edited' },
  { value: 'created', label: 'Newest' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'edits', label: 'Most edits' },
];

export function sortProjects(projects, sortBy) {
  const list = [...projects];
  switch (sortBy) {
    case 'name':
      return list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    case 'created':
      return list.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    case 'edits':
      return list.sort((a, b) => (b.operations?.length || 0) - (a.operations?.length || 0));
    case 'recent':
    default:
      return list.sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date));
  }
}
