// WorkspaceLayouts — per-workspace UI configuration: which sections show,
// default editing tab and special capabilities. Pure configuration, no logic.
const DEFAULT_LAYOUT = { sections: ['quickActions', 'recommendations'], defaultTab: 'prompt', unlockAllRecipes: false, advancedPrompt: false };

export const WORKSPACE_LAYOUTS = {
  portrait: { ...DEFAULT_LAYOUT, defaultTab: 'recipes' },
  fashion: { ...DEFAULT_LAYOUT, defaultTab: 'recipes' },
  product: { ...DEFAULT_LAYOUT },
  vehicle: { ...DEFAULT_LAYOUT },
  realestate: { ...DEFAULT_LAYOUT },
  landscape: { ...DEFAULT_LAYOUT },
  food: { ...DEFAULT_LAYOUT },
  creative: { ...DEFAULT_LAYOUT, unlockAllRecipes: true, advancedPrompt: true },
  social: { ...DEFAULT_LAYOUT },
  universal: { ...DEFAULT_LAYOUT, unlockAllRecipes: true },
};

export const layoutFor = (workspaceId) => WORKSPACE_LAYOUTS[workspaceId] || DEFAULT_LAYOUT;