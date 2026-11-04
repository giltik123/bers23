import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import en from '../src/lib/i18n/locales/en/recipes.js';
import { modules as ru } from '../src/lib/i18n/locales/ru/index.js';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('recipe selection and favorite controls are separate accessible actions', () => {
  const card = read('src/components/editor/recipes/RecipeCard.jsx');
  assert.equal((card.match(/<button\b/g) || []).length, 2);
  assert.doesNotMatch(card, /role=["']button["']/);
  assert.match(card, /aria-pressed=\{Boolean\(isFavorite\)\}/);
  assert.match(card, /aria-label=\{t\('recipes\.openRecipe'/);
  assert.match(card, /recipes\.removeFavorite/);
  assert.match(card, /recipes\.addFavorite/);
  const favoriteButton = card.split('<button').at(-1);
  assert.ok(favoriteButton.includes('onToggleFavorite(recipe.id)'));
  assert.doesNotMatch(favoriteButton, /disabled=/);
});

test('Recipe browser localizes filters and exposes their selected state', () => {
  const panel = read('src/components/editor/recipes/RecipePanel.jsx');
  assert.match(panel, /aria-pressed=\{view === id && !category\}/);
  assert.match(panel, /aria-pressed=\{category === item\.id\}/);
  assert.match(panel, /recipes\.categories\.\$\{item\.id\}/);
  assert.match(panel, /recipes\.chainsUnavailable/);
  assert.match(panel, /role="group"/);
  assert.match(panel, /aria-label=\{t\('recipes\.searchPlaceholder'\)\}/);
  assert.match(panel, /disabled=\{disabled \|\| !recipeManager\.isApplicable\(selectedRecipe, selectedObjects\)\}/);
  assert.match(read('src/components/editor/recipes/RecipeDetail.jsx'), /recipes\.allRecipes/);
});

test('Recipe template handoff is prompt-only and never presents a browser price or starts execution', () => {
  const preview = read('src/components/editor/recipes/RecipePromptPreview.jsx');
  const editor = read('src/pages/Editor.jsx');
  assert.match(preview, /recipes\.handoffNotice/);
  assert.match(preview, /aria-describedby="recipe-handoff-note"/);
  assert.match(preview, /disabled=\{disabled \|\| !prompt\.trim\(\)\}/);
  assert.doesNotMatch(preview, /compiled\.credits|compiled\.estimatedTimeMs|coreClient|fetch\(/);
  assert.match(editor, /setInstruction\(prompt\);\s*setActiveRecipe\(recipe\);\s*setEditTab\('prompt'\)/);
});

test('Recipe variable controls have labels and localized slider strength without changing prompt values', () => {
  const variables = read('src/components/editor/recipes/RecipeVariablesForm.jsx');
  assert.match(variables, /htmlFor=\{controlId\}/);
  assert.match(variables, /SelectTrigger id=\{controlId\} aria-label=\{definition\.label\}/);
  assert.match(variables, /Slider[\s\S]*id=\{controlId\}[\s\S]*aria-label=\{definition\.label\}/);
  assert.match(variables, /Input[\s\S]*id=\{controlId\}[\s\S]*aria-label=\{definition\.label\}/);
  assert.match(variables, /sliderWord/);
  assert.match(variables, /recipes\.sliderStrength/);
  assert.doesNotMatch(variables, /renderTemplate|coreClient|fetch\(/);
});

test('English and Russian catalogs cover every recipe category and preserve the truthful handoff contract', () => {
  const ids = [...read('src/lib/recipes/recipeCategories.js').matchAll(/\{ id: '([^']+)', label:/g)].map((match) => match[1]);
  assert.equal(ids.length, 23);
  const required = [
    'favorites', 'viewsLabel', 'categoriesLabel', 'allRecipes', 'openRecipe',
    'addFavorite', 'removeFavorite', 'chainsUnavailable', 'chainsHint',
    'noFavorites', 'noRecent', 'noResults', 'generatedPrompt', 'editable',
    'target', 'keeps', 'handoffNotice',
  ];
  for (const key of required) {
    assert.ok(en[key], 'English recipe catalog is missing ' + key);
    assert.ok(ru.recipes[key], 'Russian recipe catalog is missing ' + key);
  }
  assert.deepEqual(Object.keys(en.categories).sort(), [...ids].sort());
  assert.deepEqual(Object.keys(ru.recipes.categories).sort(), [...ids].sort());
  assert.deepEqual(Object.keys(en.sliderStrength).sort(), Object.keys(ru.recipes.sliderStrength).sort());
  assert.match(en.handoffNotice, /does not run a model or spend credits/);
  assert.match(ru.recipes.handoffNotice, /кредиты не списываются/);
});
