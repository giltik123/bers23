import { coreClient } from '@/api/coreClient';
import { normalizeProjectResourceUrls } from '@/api/coreResourceUrl';

// Project Engine service layer — ALL project CRUD/business operations live here.
// UI components never call the entities SDK directly for projects.
//
// Subscription/storage entitlement enforcement is server-owned. The browser must
// not manufacture usage counters or treat client plan state as authorization.

const API_ROOT = (import.meta.env ?? {}).VITE_CORE_API_URL || '/api/core';
const normalizeProject = (project) => normalizeProjectResourceUrls(project, API_ROOT);
const normalizeProjects = (projects) => Array.isArray(projects) ? projects.map(normalizeProject) : projects;

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
  list: async () => normalizeProjects(await coreClient.projects.list()),

  get: async (id) => normalizeProject(await coreClient.projects.get(id)),

  update: async (id, data) => normalizeProject(await coreClient.projects.update(id, data)),

  createFromFile: async (file) => normalizeProject(await coreClient.projects.createFromFile({ file, name: file.name.replace(/\.[^.]+$/, '') })),

  rename: async (id, name) => normalizeProject(await coreClient.projects.update(id, { name })),

  remove: (id) => coreClient.projects.delete(id),
  acceptFinal: async (id, finalArtifactId, instruction) => normalizeProject(await coreClient.projects.acceptFinal(id, finalArtifactId, instruction)),
  undo: async (id) => normalizeProject(await coreClient.projects.undo(id)),
  redo: async (id) => normalizeProject(await coreClient.projects.redo(id)),
  restoreOriginal: async (id) => normalizeProject(await coreClient.projects.restoreOriginal(id)),
  createVersion: async (id, name) => normalizeProject(await coreClient.projects.createVersion(id, name)),
  restoreVersion: async (id, versionId) => normalizeProject(await coreClient.projects.restoreVersion(id, versionId)),

  setFavorite: async (id, favorite) => normalizeProject(await coreClient.projects.update(id, { favorite })),

  setArchived: async (id, archived) => normalizeProject(await coreClient.projects.update(id, { archived })),
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