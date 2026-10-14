# Standalone Editor color difference and tonal clipping — R&D only

Source: unchanged four source/test files from Draft #988 at exact SHA
`4adca122ea52d561cf6ba7a25b4d8e8a5d4de2cd`.

- `EditorColorDifferenceRND.ts`: deterministic bounded CIEDE2000 (Delta-E)
  diagnostic using assumed common sRGB/D65 RGBA8 images, optional R8
  editable mask, alpha handling, pixel-count bounds and sample limits.
- `EditorTonalClippingRND.ts`: alpha-aware channel highlight/shadow clipping
  counts for local image previews; does not grade creative intent.
- Original Node tests are copied without modification and run on the exact
  pull-request SHA. The workflow also typechecks/builds the current app.

**No runtime admission.** No new imports from active Editor/Core, service,
Project/Artifact, persistence, schema, endpoint, provider, model or billing.
The supplied diagnostics are *advisory*; `qualityApproved=false` and
`releaseQualityDecision=UNREVIEWED_DIAGNOSTIC_ONLY` stay authoritative
as non-approval. Delta-E is not a measure of garment fit or photo realism.

**Limitations.** No ICC/profile conversion or Display-P3 handling, actual
photo quality approval, canonical MASK provenance, human evaluation,
customer data, device validation, browser integration or release proof.
Integration from #988/#995/#1003/#997/#998 remains gated; no permission
to merge those intersecting branches is implied. Issue #365 release gates
and the protected main branch must stay unchanged except for these inert
research files if this PR is subsequently independently approved.

CI success on a branch head proves only the narrow standalone contract
tested there. Keep this PR Draft pending exact-head CI and code review.
