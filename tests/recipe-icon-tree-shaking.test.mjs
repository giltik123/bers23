import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('recipe icons tree-shake Lucide while covering every catalog icon and fallback', async () => {
  const [iconModule, library] = await Promise.all([
    readFile('src/components/editor/recipes/RecipeIcon.jsx', 'utf8'),
    readFile('src/lib/recipes/recipeLibrary.js', 'utf8'),
  ]);

  assert.doesNotMatch(iconModule, /import\s*\{\s*icons\s*\}\s*from\s*['"]lucide-react['"]/);
  assert.match(iconModule, /RECIPE_ICONS\[name\] \|\| Sparkles/);
  const catalogIcons = [...library.matchAll(/icon:\s*'([^']+)'/g)].map((match) => match[1]);
  assert.ok(catalogIcons.length > 0);
  for (const name of new Set(catalogIcons)) {
    assert.match(iconModule, new RegExp(`\\b${name}\\b`), `missing recipe icon ${name}`);
  }
});
