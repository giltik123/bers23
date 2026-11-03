# Settings performance diagnostics — read-only UI contract

The Settings → Performance panel is a browser-side diagnostic surface, **not** a Core, Project, Execution, or Billing authority.

- **JS heap** comes from the optional browser `performance.memory` API. Unsupported browsers display `—`, not a fabricated 0 MB.
- **Site storage** is `navigator.storage.estimate().usage`, rounded to MB. This is an origin-wide estimate, **not** the preview-cache size. Rejection or unsupported storage APIs display `—` while other diagnostics remain available.
- **Cached previews** counts in-memory preview entries, not queued server jobs.
- **Device policy** is a heuristic from `deviceProfiler`, not physical device benchmark or model qualification evidence. Do not display its fallback RAM estimate as measured physical memory.
- **Pause reason** comes from the read-only resource scheduler; unknown reasons use a generic message.
- Polling is visible-tab-only, single-flight and cleaned up on unmount. Snapshot errors remain recoverable by the next automatic poll.

No data is sent to cloud services by this panel. These UI estimates must never be used for model admission, financial authorization, release readiness, or device-performance evidence.
