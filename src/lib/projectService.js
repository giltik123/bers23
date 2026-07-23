import { base44 } from '@/api/base44Client';
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
  list: () => base44.entities.Project.list('-updated_date'),

  get: (id) => base44.entities.Project.get(id),

  update: (id, data) => base44.entities.Project.update(id, data),

  create: async ({ name, imageUrl, width = null, height = null, storageBytes = 0 }) => {
    await subscriptionValidator.validateProject({ width, height });
    await subscriptionValidator.validateStorage(storageBytes);
    const project = await base44.entities.Project.create({
      name,
      original_image_url: imageUrl,
      current_image_url: imageUrl,
      thumbnail_url: imageUrl,
      width,
      height,
      status: 'draft',
      favorite: false,
      archived: false,
      history: [],
      history_index: -1,
      objects: [],
      operations: [],
      versions: [],
      metadata: {},
    });
    await subscriptionUsage.track({ projects: 1, storage: storageBytes, feature: 'projects' });
    return project;
  },

  rename: (id, name) => base44.entities.Project.update(id, { name }),

  duplicate: async (project) => {
    await subscriptionValidator.validateProject({ width: project.width, height: project.height });
    const {
      id, created_date, updated_date, created_by_id, // strip built-ins
      ...data
    } = project;
    const copy = await base44.entities.Project.create({
      ...data,
      name: `${project.name} (copy)`,
      favorite: false,
    });
    await subscriptionUsage.track({ projects: 1, feature: 'projects' });
    return copy;
  },

  remove: (id) => base44.entities.Project.delete(id),

  setFavorite: (id, favorite) => base44.entities.Project.update(id, { favorite }),

  setArchived: (id, archived) => base44.entities.Project.update(id, { archived }),
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