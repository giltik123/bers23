# Application Composition Root

`createApplication()` is the only application assembly entry point. It creates an isolated Platform runtime, registers it with Core DI, installs metadata-only initializers, completes bootstrap dependency validation, and returns the started runtime.

The composition root does not import React, UI code, providers, Planner, Pipeline, or any other business implementation. Existing services continue to be invoked through their current APIs; Platform only discovers their metadata and capabilities.

## Registered inventory

- Providers: SAM 3, Reve, and FASHN.
- Recipes: RecipeLibrary.
- Workspaces: Portrait, Fashion, Product, Automotive, Real Estate, Landscape, Food, Creative, Social, and Universal.
- AI modules: Planner, AI Agent, Scene Memory, Editing Engine, and Image Pipeline.

## Inspection

The returned runtime exposes `inspect()`, which provides module counts by category and the sorted set of currently available capabilities. Category registries remain available through `runtime.context` and through Core DI.
