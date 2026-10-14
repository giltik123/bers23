# Editor split compare and grouped Undo — isolated research

This scoped PR copies four unchanged and independently testable source/test
files from Draft #1003 at exact source SHA `95629052f9f672005499083495c66db677354d6f`.

- `localCompare.js` is a pure in-memory RGBA8 before/after split preview
  with exact transparent pixel copies, percentage bounds and an allocation cap.
  It does not implement file export or change the current canonical image.
- `localHistory.js` groups slider/keyboard gestures into useful Undo entries
  in an injected bounded state. It does not persist Project, tenant, Artifact,
  browser storage, media, network calls or background jobs.

**No runtime integration**: neither module is imported by any current
production Editor or Core code in this PR. The original feature branch #1003
remains Draft; accepting these pure research utilities does not authorize its
UI or implicit merging of overlapping Editor PRs.

Exact-head CI verifies the original unit tests, source protection, strict
entry bounds, typecheck, and build through existing repository checks.
Required before editor admission: combined current-Project source/revision
identity, real-browser/keyboard/gesture accessibility, stored draft safety,
real-photo comparison and independent UX review.

No provider, model, paid features, release ledger, feature flag, production
deployment or server migration is added.
