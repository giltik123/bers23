# Durable Local Model Fleet Lifecycle (6.42B2)

## Architecture decision

The decision compared three storage shapes against the twelve required criteria.

| Criterion | A: metadata registry + blobs | B: content-addressed blobs + manifests | C: version directories + active pointer |
| --- | --- | --- | --- |
| Crash consistency | Good with transactional metadata | Strong: immutable completed blobs | Depends on filesystem rename semantics |
| Rollback safety | Good if bytes are retained | Strong: exact digest identifies bytes | Good, but directory contents can drift |
| Deduplication | Requires an added index | Native | None by default |
| Atomic activation | Metadata transaction | Metadata transaction | Pointer rename; uneven browser support |
| Partial downloads | Separate staging object | Separate, binding-keyed staging object | Natural temporary file |
| Browser portability | Strong with IndexedDB | Strong with IndexedDB | Weak |
| Desktop/native portability | Strong behind ports | Strong behind ports | Strongest on filesystems |
| Concurrent update | Registry transaction/lock | Registry transaction/lock | Requires cross-directory locking |
| Migration complexity | Moderate | Moderate and fail-closed | High across browser/native layouts |
| Storage accounting | Explicit | Explicit; shared blobs need reachability | Simple but double-counts duplicates |
| Quarantine recovery | Metadata-driven | Metadata plus exact immutable bytes | Metadata plus mutable directory |
| Testability | Strong through ports | Strong through ports | Filesystem-dependent |

**Selected architecture: a hybrid of A and B.** A narrow transactional metadata registry owns lifecycle, active pointers, bounded rollback history, quarantine and transactions. Immutable complete bytes live in content-addressed storage under their expected SHA-256. Partial bytes live separately under a binding of model, exact version, expected hash, manifest identity and URI. This is better for BERS than A alone because deduplication and exact rollback identity are intrinsic, and better than C because both IndexedDB and native adapters can implement the same semantics without pretending directory rename is portable.

## Persistence model

`FleetMetadataPort` provides an atomic read-modify-write transaction. `FleetBlobPort` provides immutable complete blobs, binding-keyed partials and real free-space reporting. Domain code imports neither browser nor filesystem APIs. Metadata contains only model lifecycle facts: schema/revision, signed manifest and binding, expected/content hashes, byte size, active version, bounded history, timestamps, failure/quarantine facts and in-flight transaction/partial state. It contains no provider credential, billing, Project ownership or canonical Artifact authority.

The browser production adapter uses one IndexedDB database with separate metadata, blob and partial object stores. Deterministic domain tests share an in-memory backing object to simulate process restarts. A future native adapter can use transactional metadata plus CAS files without changing the domain.

## Crash consistency

Install validates manifest policy before mutation, reserves the remaining temporary bytes plus a configurable safety reserve, persists `DOWNLOADING`/`UPDATING`, stores a binding-keyed partial, persists `VERIFYING`, verifies size/hash/signature/trust, writes the CAS blob, persists `STAGED`, then atomically changes the active pointer and status to `READY`. A crash before the last transaction cannot activate the candidate. A crash after it reconstructs the new active version, subject to startup byte and trust revalidation. The prior active blob is retained throughout an update.

Startup reconciliation never trusts `READY` metadata alone. Missing/corrupt/untrusted active bytes are quarantined. Interrupted verification/staging becomes failed and cannot be loaded; interrupted removal is completed; partial downloads remain resumable only under their exact binding. Rollback revalidates the exact prior CAS blob and signed manifest before moving the active pointer, and fails closed otherwise.

## Storage / deduplication

Complete blobs are keyed by SHA-256. Multiple model/version records may reference one blob. Removal performs deterministic reachability cleanup only after its metadata reference is gone. Available capacity is checked before lifecycle mutation and must cover remaining download bytes plus the safety reserve; an update retains A while staging B, so coexistence is inherent in actual used/free accounting.

## Migration strategy

No ephemeral registry entry or legacy filename becomes `READY`. Legacy bytes may be imported only by a separate explicit migration after an exact trusted signed manifest, version and SHA-256 are supplied and full lifecycle revalidation succeeds. Otherwise bytes are unclaimed and should be cleaned up or reinstalled; filename inference is forbidden.

## Security and authority boundary

The existing `ModelManifestVerifier` remains the only trust validator and is not weakened. Recommendation is advisory and cannot write fleet state. Fleet ports have no cloud/provider or paid Billing dependency and cannot mint Project or canonical Artifact identities. No signing private key is stored.
