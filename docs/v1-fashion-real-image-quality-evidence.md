# BERS v1 deterministic Try-On real-image quality evidence

This is the evidence path for release blocker `FASHION_REAL_IMAGE_QUALITY` / #230 / R2.

It is deliberately independent from HSME. Under the 2026-10-04 owner release-policy override, physical-mobile HSME validation is post-v1 and does not block RC. This Fashion gate does not require a physical phone.

## Purpose

The accepted deterministic Try-On software path already proves canonical authority, LOCAL_ONLY execution, FINAL/Preview/Accept semantics and persistence. Release quality still needs a representative real-image review with measured runtime resources.

The evidence workflow therefore verifies two external JSON documents plus every referenced source, garment and result image byte-for-byte.

It does not generate quality claims. It only normalizes a reviewer-approved real-image evidence set into one exact-SHA release artifact.

## Fixture manifest

The fixture manifest must be available through a direct public HTTPS URL and have this form:

```json
{
  "schemaVersion": 1,
  "kind": "BERS_V1_FASHION_REAL_IMAGE_FIXTURE_SET",
  "candidateSha": "<40-char exact candidate SHA>",
  "representativeSetConfirmed": true,
  "samples": [
    {
      "id": "sample-01",
      "source": {
        "url": "https://.../person.jpg",
        "sha256": "<64 hex>"
      },
      "garment": {
        "url": "https://.../garment.png",
        "sha256": "<64 hex>"
      },
      "result": {
        "url": "https://.../result.png",
        "sha256": "<64 hex>"
      }
    }
  ]
}
```

Every URL must be direct HTTPS, non-local/private, and every fetched image must match its declared SHA-256 and decode as JPEG, PNG or WebP.

Use only release fixtures that may lawfully be used for this purpose. Do not use private end-user photos merely to satisfy the release gate.

## Review artifact

The review artifact must be available through a direct public HTTPS URL:

```json
{
  "schemaVersion": 1,
  "kind": "BERS_V1_FASHION_REAL_IMAGE_REVIEW",
  "candidateSha": "<same exact candidate SHA>",
  "representativeSetConfirmed": true,
  "decision": "ACCEPT_FOR_V1_DETERMINISTIC_TRYON",
  "samples": [
    {
      "id": "sample-01",
      "sourceClass": "REAL_PHOTO",
      "fixtureRightsRef": "<consent/license/source record>",
      "garmentPreservation": "PASS",
      "logoPatternPreservation": "PASS",
      "reviewedOutputSha256": "<exact fixture.samples[0].result.sha256>",
      "observedFailureModes": [
        "<reviewed limitation, or an empty array if none were observed>"
      ],
      "latencyMs": 123.4,
      "peakMemoryBytes": 123456789
    }
  ]
}
```

`logoPatternPreservation` may be `NOT_APPLICABLE` when the garment genuinely contains no logo/pattern to review. A failed garment or logo/pattern preservation review cannot produce accepted v1 evidence.

Latency and peak memory must come from the actual reviewed execution, not estimates. Each `reviewedOutputSha256` must be the exact 64-character lowercase SHA-256 of that sample's `result` bytes in the fixture manifest. Missing or mismatched review hashes fail closed: the reviewer cannot attest to one output while the release verifier checks another. The published `review-draft.json` already contains these output identities; the owner must personally inspect the images and record a decision rather than mechanically converting every `PENDING_OWNER_REVIEW` to `PASS`.

## Running the evidence workflow

Dispatch **BERS v1 Fashion real-image quality evidence** on the exact candidate ref and provide:

- `fixture_manifest_url`;
- `review_artifact_url`.

The workflow checks out the exact dispatched SHA, downloads and verifies all referenced image bytes, checks the review, computes fixture/review digests, derives p50/p95 latency and peak memory, and uploads:

- `fashion-tryon-quality.json`;
- the verified fixture manifest JSON;
- the verified review JSON.

The artifact is named:

`bers-v1-fashion-real-image-quality-<candidate SHA>`

Image bytes are verified during the run but are not copied into the GitHub evidence artifact.

## Promotion into the RC ledger

A successful workflow run does not edit release authority by itself.

To clear #230, copy the normalized `fashion-tryon-quality.json` fields into `config/v1-release-readiness.json#fashionTryOnQualityValidation.acceptedEvidence`, change the validation state/classification to `QUALITY_VALIDATED`, remove `FASHION_REAL_IMAGE_QUALITY` from blockers, and update `DETERMINISTIC_TRYON_V1` to `PRODUCTION_READY`.

That ledger change must be a reviewed PR. Its RC readiness guard requires the hosted workflow URL and artifact name to bind the same candidate SHA.

Quality evidence grants no new provider, Billing, model, Project or Artifact authority.
