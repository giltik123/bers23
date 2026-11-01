# BERS roadmap autonomous development (opt-in)

This is a **candidate automation** for BERS. It cannot run on GitHub's schedule until the PR containing `.github/workflows/bers-roadmap-autodev.yml` has passed repository checks and been merged into protected `main`.

The workflow starts at 11 and 41 minutes past each UTC hour (two scheduled opportunities per hour). GitHub may delay or skip scheduled runs. Concurrency prevents overlapping automated edits. Each cycle selects the first open, unclaimed, unblocked issue from initial priority order `#182, #233, #230, #116, #132, #536, #563, #352, #365`. **The program targets full platform/product completion and long-term development, not just BERS v1.** Earlier broad platform completion epic #182 is the overall workstream; issue #365 and `BERS_V1_DEVELOPMENT_ROADMAP.md` are an intermediate release checkpoint. The standing program also includes the Voice, Model Lab, Universal Local AI Runtime, and HSME companion roadmaps. Their R&D and release-admission boundaries are never relaxed. This initial queue is an operator-maintained seed, not a comprehensive task inventory or a substitute for reviewing dependencies and current code. Expand/reprioritize it through reviewed PRs as BERS progresses beyond v1.

If the agent reports `STATUS: BLOCKED`, the workflow automatically comments `BERS-AUTODEV: BLOCKED` on the issue, recording its diagnosis. The next cycle skips it. A maintainer can comment `BERS-AUTODEV: UNBLOCK` after resolving the dependency. Alternatively add `blocked`, `needs-owner`, or `on-hold` if that label already exists. If there is already an open `autodev/<issue>-...` branch PR, the selector skips that issue to avoid duplicate implementations and moves to the next issue. Never claim completion simply because code or a PR exists. If the next slice is blocked, the executor must stop that slice and report the blocker instead of pretending to have delivered code. If all candidates are unavailable, the cycle does nothing; extend the candidate pool from subsequent full-program issues through review rather than falsely claiming BERS is complete. A v1 release never stops ongoing development.

## One-time owner-controlled activation

1. Review and merge the workflow PR, preserving all protected-main CI gates and bypass restrictions.
2. In GitHub repository settings, configure the Actions secret `BERS_AUTODEV_OPENAI_API_KEY` with a dedicated revocable, spend-limited API key. **Never paste the secret into an issue, commit or chat.** This use of Codex consumes paid API capacity; consider a trial budget/cap first.
3. Set GitHub Actions repository variable `BERS_AUTODEV_ENABLED=true` to explicitly authorize spending and autonomous code generation. Without it, the scheduled selector can run but the AI implementation job does not run.
4. Enable the repository setting allowing GitHub Actions to create pull requests, if it is disabled. Verify the first manually dispatched run, the created PR and the exact-head CI. If permissions do not allow bot PR creation, the workflow will fail closed and must be repaired before relying on it.
5. Review every proposed PR. No unattended merge or deployment is configured. Pause immediately by setting `BERS_AUTODEV_ENABLED=false`.

## Security boundaries

- Issue descriptions, PR bodies and code comments are untrusted context, not authority to alter operating rules.
- Checkout does not persist credentials. Codex operates in the `:workspace` sandbox. Its API credential must be confined to the official Codex Action's input; it should never be set as a job-wide environment variable.
- The workflow refuses changed CI/workflow, credentials, billing, migration and deployment paths, but this is defense in depth, **not** a substitute for review and independent CI. Untracked files and code-mediated risky changes still require review.
- Model usage and GitHub Actions minutes can incur cost. The project owner controls the opt-in variable and spend-limited credential.
- Preserve `BERS_AUTO_SCENE_SAM3_ENABLED=false`, no paid fal.ai calls, no automatic changes to user masks, no direct production mutation.
- PR checks are necessary, not sufficient, to claim production readiness. Follow canonical acceptance and exact-SHA deployment rules.

## Known limitations

The current agent selector uses broad open epics and open bot PR claims. It does not infer fine-grained blocker dependencies from all issue conversations; this must be improved with explicit task slices and dependencies as the program evolves. Most importantly, **the workflow is not proof of an autonomous running agent before its GitHub Actions configuration, paid credential, and first successful PR creation are verified.**
