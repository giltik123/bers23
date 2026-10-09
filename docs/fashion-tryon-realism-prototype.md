# Fashion Try-On realism improvements (experimental prototype)

This branch contains a **standalone, unintegrated pixel primitive** for one of the known visual limitations: preserving a foreground hand/arm **when an independently trusted mask is already available**. It does not automatically find arms, derive depth, produce fabric folds or grant production authority.

## Why it is isolated

The canonical F4b.5 garment warp/texture composite is an exact-byte audited production authority. Adding a foreground segmentation mask to that pipeline requires a versioned schema, a project/pose/mask provenance contract, recomputation on Core, persistence/integrity review and new measured real-photo fixtures. Silently changing the currently validated Try-On compositor would invalidate its exact-SHA visual evidence and potentially break texture/garment lineage.

## Proposed stages

1. **Foreground occlusion (this PR):** pure RGBA8 mask-restore prototype. It requires a full-frame binary 0/255 mask and exact geometry; malformed or ambiguous masks fail closed. Test restores original arm pixels while retaining garment pixels elsewhere. No routing into production.
2. **Mask authority:** obtain or manually annotate hands/arms and hair foreground, bind the mask to the exact Project source bytes and pose/geometry, add tests for stale or untrusted segmentation and Core byte recomputation.
3. **Pose perspective:** improve body-anchor and garment mesh landmark selection with shoulders, torso and limb intersections, prevent mesh flips and evaluate rotated/side poses.
4. **Drape:** introduce an explicitly separately versioned shading/cloth deformation stage (not fabricated 3D simulation), with toggle and honest output labelling.
5. **Quality gate:** regenerate six or more reference pairs including raised-arm/side poses, compare source/garment logos, mask boundaries, fidelity/latency/RSS, run secured reproducibility workflows and obtain new explicit owner acceptance before promotion.

Do not erase the two limitations from the Fashion review template until quantitative and visual evidence demonstrates each has been addressed. The v1 release gate remains pending owner acceptance; physical phone checks are not v1 blockers.
