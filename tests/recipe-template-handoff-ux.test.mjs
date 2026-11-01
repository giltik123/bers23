import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import en from '../src/lib/i18n/locales/en/recipes.js';
import { modules as ru } from '../src/lib/i18n/locales/ru/index.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('recipe selection and favorite actions are separate native accessible buttons', () => {
  const card = read('src/components/editor/recipes/RecipeCard.jsx');
  assert.match(card, /<div className="relative/);
  assert.equal((card.match(/<button\b/g) || []).length, 2);
  assert.doesNotMatch(card, /role="button"|recipe\.credits|isPremium|<Lock/);
  assert.match(card, /aria-pressed=\{isFavorite\}/);
  assert.match(card, /aria-label=\{t\(isFavorite/);
  assert.match(card, /disabled=\{disabled\}/);
  assert.match(card, /onToggleFavorite\(recipe\.id\)/);
});

test('recipe handoff remains prompt-only, not a paid run or browser price quote', () => {
  const preview = read('src/components/editor/recipes/RecipePromptPreview.jsx');
  const editor = read('src/pages/Editor.jsx');
  assert.match(preview, /recipes\.handoffNotice/);
  assert.match(preview, /aria-describedby="recipe-handoff-note"/);
  assert.match(preview, /disabled=\{disabled \|\| !prompt\.trim\(\)\}/);
  assert.doesNotMatch(preview, /compiled\.credits|compiled\.estimatedTimeMs|editingEngine|coreClient/);
  assert.match(editor, /setInstruction\(prompt\);\s*setActiveRecipe\(recipe\);\s*setEditTab\('prompt'\)/);
});

test('recipe navigation is translated and keyboard state is exposed', () => {
  const panel = read('src/components/editor/recipes/RecipePanel.jsx');
  assert.match(panel, /aria-pressed=\{view === id && !category\}/);
  assert.match(panel, /aria-pressed=\{category === item\.id\}/);
  assert.match(panel, /recipes\.categories\.\$\{item\.id\}/);
  assert.match(panel, /recipes\.chainsUnavailable/);
  assert.match(read('src/components/editor/recipes/RecipeDetail.jsx'), /recipes\.allRecipes/);
});

test('EN and RU recipe labels cover every category and truthful handoff text', () => {
  const ids = [...read('src/lib/recipes/recipeCategories.js').matchAll(/\{ id: '([^']+)', label:/g)].map((match) => match[1]);
  assert.equal(ids.length, 23);
  for (const key of ['favorites', 'chainsUnavailable', 'chainsHint', 'categoriesLabel', 'allRecipes', 'noFavorites', 'noRecent', 'noResults', 'addFavorite', 'removeFavorite', 'generatedPrompt', 'editable', 'target', 'keeps', 'handoffNotice']) {
    assert.ok(en[key] && ru.recipes[key], `Missing recipe UI key: ${key}`);
  }
  assert.deepEqual(Object.keys(en.categories).sort(), [...ids].sort());
  assert.deepEqual(Object.keys(ru.recipes.categories).sort(), [...ids].sort());
  assert.match(en.handoffNotice, /does not run a model or spend credits/);
  assert.match(ru.recipes.handoffNotice, /кредиты не списываются/);
});
