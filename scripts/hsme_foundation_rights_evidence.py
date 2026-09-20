#!/usr/bin/env python3
"""HSME-2a.3.2f dependency-complete benchmark rights evidence.

Engineering admission only. This script does not provide legal advice or
production approval. It binds reviewed license/obligation evidence to the exact
immutable artifact manifests used by the foundation benchmark.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
COLLECTOR_PATH = ROOT / "scripts" / "hsme_foundation_candidate_metadata_evidence.py"
COLLECTOR_SPEC = importlib.util.spec_from_file_location("hsme_foundation_metadata", COLLECTOR_PATH)
if COLLECTOR_SPEC is None or COLLECTOR_SPEC.loader is None:
    raise RuntimeError("cannot load artifact collector")
collector = importlib.util.module_from_spec(COLLECTOR_SPEC)
COLLECTOR_SPEC.loader.exec_module(collector)

SCHEMA = "BERS_HSME_FOUNDATION_RIGHTS_EVIDENCE_V1"
RIGHTS_SCHEMA = "BERS_HSME_FOUNDATION_BENCHMARK_RIGHTS_REVIEW_V1"
RIGHTS_DOMAIN = "bers:hsme:foundation-benchmark-rights-review:v1"
LICENSE_EVIDENCE_DOMAIN = "bers:hsme:foundation-rights-license-evidence:v1"
OBLIGATIONS_DOMAIN = "bers:hsme:foundation-rights-obligations:v1"
REVIEW_POLICY_DOMAIN = "bers:hsme:foundation-rights-review-policy:v1"
RATIONALE_DOMAIN = "bers:hsme:foundation-rights-rationale:v1"


class RightsEvidenceError(RuntimeError):
    pass


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def domain_hash(domain: str, value: Any) -> str:
    return hashlib.sha256(domain.encode("utf-8") + b"\0" + canonical_bytes(value)).hexdigest()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def evidence_map(
    candidate_policy: dict[str, Any],
    resolved_documentation: dict[str, dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    values: dict[str, dict[str, Any]] = {}
    for evidence_id, item in resolved_documentation.items():
        if evidence_id in values:
            raise RightsEvidenceError(f"duplicate evidenceId: {evidence_id}")
        values[evidence_id] = {"kind": "PINNED_REPOSITORY_DOCUMENT", **item}
    for item in candidate_policy.get("externalEvidence", []):
        evidence_id = item.get("evidenceId")
        if not isinstance(evidence_id, str) or not evidence_id:
            raise RightsEvidenceError("external evidenceId missing")
        if evidence_id in values:
            raise RightsEvidenceError(f"duplicate evidenceId: {evidence_id}")
        values[evidence_id] = {"kind": "REVIEWED_EXTERNAL_REFERENCE", **item}
    return values


def verify_documentation(
    candidate: dict[str, Any],
    policy: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    from huggingface_hub import hf_hub_url

    manifest = candidate["artifactManifest"]
    by_path = {item["relativePath"]: item for item in manifest["artifacts"]}
    source = manifest["primarySource"]
    resolved: dict[str, dict[str, Any]] = {}
    for evidence in policy.get("documentationEvidence", []):
        evidence_id = evidence.get("evidenceId")
        if not isinstance(evidence_id, str) or not evidence_id:
            raise RightsEvidenceError("documentation evidenceId missing")
        path = evidence["relativePath"]
        artifact = by_path.get(path)
        if artifact is None:
            raise RightsEvidenceError(f"{candidate['candidateId']} missing evidence path {path}")
        if artifact["runtimeRequired"]:
            raise RightsEvidenceError(f"{candidate['candidateId']} rights document cannot be runtime-required: {path}")
        actual_sha = artifact["contentSha256"]
        expected_sha = evidence["contentSha256"]
        if expected_sha != "DISCOVER_AFTER_RUNTIME_IDENTITY_PROOF" and actual_sha != expected_sha:
            raise RightsEvidenceError(f"{candidate['candidateId']} evidence hash drift: {path}")
        url = hf_hub_url(source["sourceRoot"], path, revision=source["immutableRevision"])
        payload = collector.fetch_small(url)
        if sha256_bytes(payload) != actual_sha:
            raise RightsEvidenceError(f"{candidate['candidateId']} fetched evidence bytes drift: {path}")
        text = payload.decode("utf-8", errors="strict")
        for needle in evidence.get("requiredSubstrings", []):
            if needle not in text:
                raise RightsEvidenceError(
                    f"{candidate['candidateId']} evidence assertion missing in {path}: {needle}"
                )
        resolved[evidence_id] = {
            "evidenceId": evidence_id,
            "relativePath": path,
            "contentSha256": actual_sha,
            "source": source,
            "requiredSubstrings": evidence.get("requiredSubstrings", []),
        }
    return resolved


def runtime_projection(candidate: dict[str, Any]) -> list[dict[str, Any]]:
    return sorted(
        [
            {
                "logicalId": item["logicalId"],
                "relativePath": item["relativePath"],
                "role": item["role"],
                "bytes": item["bytes"],
                "contentSha256": item["contentSha256"],
                "identityMethod": item["identityMethod"],
                "protocolContentSha256Verified": item["protocolContentSha256Verified"],
            }
            for item in candidate["artifactManifest"]["artifacts"]
            if item["runtimeRequired"]
        ],
        key=lambda item: item["relativePath"],
    )


def non_runtime_projection(candidate: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        item["relativePath"]: {
            "bytes": item["bytes"],
            "contentSha256": item["contentSha256"],
            "role": item["role"],
        }
        for item in candidate["artifactManifest"]["artifacts"]
        if not item["runtimeRequired"]
    }


def prove_rights_safe_repin(
    campaign_collected_candidate: dict[str, Any],
    candidate_policy: dict[str, Any],
    campaign_candidate: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    config = candidate_policy.get("rightsSafeRepin")
    if not isinstance(config, dict):
        raise RightsEvidenceError("rightsSafeRepin configuration missing")
    old_revision = config.get("oldRevision")
    new_revision = config.get("newRevision")
    campaign_revision = campaign_candidate["immutableRevision"]
    candidate_id = campaign_collected_candidate["candidateId"]

    if campaign_collected_candidate["immutableRevision"] != campaign_revision:
        raise RightsEvidenceError(
            f"{candidate_id} collected revision differs from campaign"
        )
    if campaign_collected_candidate["modelContentSha256"] != campaign_candidate["modelContentSha256"]:
        raise RightsEvidenceError(
            f"{candidate_id} collected modelContentSha256 differs from campaign"
        )

    if campaign_revision == old_revision:
        old_candidate = campaign_collected_candidate
        new_candidate, _ = collector.collect_candidate({
            "candidateId": candidate_id,
            "sourceRoot": campaign_collected_candidate["sourceRoot"],
            "immutableRevision": new_revision,
        })
        campaign_update_required = True
    elif campaign_revision == new_revision:
        new_candidate = campaign_collected_candidate
        old_candidate, _ = collector.collect_candidate({
            "candidateId": candidate_id,
            "sourceRoot": campaign_collected_candidate["sourceRoot"],
            "immutableRevision": old_revision,
        })
        campaign_update_required = False
    else:
        raise RightsEvidenceError(
            f"{candidate_id} campaign revision is neither rights-safe repin endpoint"
        )

    if old_candidate["immutableRevision"] != old_revision:
        raise RightsEvidenceError(f"{candidate_id} collected old revision mismatch")
    if new_candidate["immutableRevision"] != new_revision:
        raise RightsEvidenceError(f"{candidate_id} collected new revision mismatch")

    old_runtime = runtime_projection(old_candidate)
    new_runtime = runtime_projection(new_candidate)
    if old_runtime != new_runtime:
        raise RightsEvidenceError(
            f"{candidate_id} rights-safe repin changes runtime-required bytes"
        )

    old_docs = non_runtime_projection(old_candidate)
    new_docs = non_runtime_projection(new_candidate)
    changed_paths = sorted(
        path
        for path in set(old_docs) | set(new_docs)
        if old_docs.get(path) != new_docs.get(path)
    )
    allowed = set(config.get("allowedNonRuntimeChangedPaths", []))
    if not changed_paths:
        raise RightsEvidenceError(
            f"{candidate_id} repin changed no documentary evidence"
        )
    if any(path not in allowed for path in changed_paths):
        raise RightsEvidenceError(
            f"{candidate_id} repin changes non-runtime path outside allowlist: {changed_paths}"
        )
    if "README.md" not in changed_paths:
        raise RightsEvidenceError(
            f"{candidate_id} repin must change pinned README rights declaration"
        )

    old_runtime_digest = domain_hash(
        "bers:hsme:sana-runtime-set:v1",
        old_runtime,
    )
    new_runtime_digest = domain_hash(
        "bers:hsme:sana-runtime-set:v1",
        new_runtime,
    )
    if old_runtime_digest != new_runtime_digest:
        raise RightsEvidenceError(
            f"{candidate_id} runtime-set digest mismatch after repin"
        )

    return new_candidate, {
        "candidateId": candidate_id,
        "oldRevision": old_revision,
        "newRevision": new_revision,
        "runtimeIdentityPreserved": True,
        "runtimeArtifactCount": len(old_runtime),
        "runtimeSetSha256": old_runtime_digest,
        "changedNonRuntimePaths": changed_paths,
        "oldModelContentSha256": old_candidate["modelContentSha256"],
        "newModelContentSha256": new_candidate["modelContentSha256"],
        "campaignUpdateRequired": campaign_update_required,
        "qualitySettingsTransferAllowed": True,
        "candidateOutputsObserved": False,
    }

def select_group(
    runtime_artifacts: list[dict[str, Any]],
    remaining: set[str],
    selector: dict[str, Any],
) -> list[dict[str, Any]]:
    kind = selector.get("kind")
    if kind == "ALL_RUNTIME":
        selected = [item for item in runtime_artifacts if item["logicalId"] in remaining]
    elif kind == "PATH_PREFIXES":
        prefixes = selector.get("prefixes")
        if not isinstance(prefixes, list) or not prefixes:
            raise RightsEvidenceError("PATH_PREFIXES requires nonempty prefixes")
        selected = [
            item for item in runtime_artifacts
            if item["logicalId"] in remaining
            and any(item["relativePath"].startswith(prefix) for prefix in prefixes)
        ]
    elif kind == "REMAINDER_RUNTIME":
        selected = [item for item in runtime_artifacts if item["logicalId"] in remaining]
    else:
        raise RightsEvidenceError(f"unsupported selector kind: {kind}")
    if not selected:
        raise RightsEvidenceError(f"rights selector {kind} matched zero runtime artifacts")
    return selected


def build_candidate_rights(
    candidate: dict[str, Any],
    candidate_policy: dict[str, Any],
    review_policy_sha256: str,
) -> dict[str, Any]:
    candidate_id = candidate["candidateId"]
    manifest = candidate["artifactManifest"]
    if manifest["state"] != "PINNED":
        raise RightsEvidenceError(f"{candidate_id} artifact manifest must be PINNED")
    resolved_documentation = verify_documentation(candidate, candidate_policy)

    runtime_artifacts = [item for item in manifest["artifacts"] if item["runtimeRequired"]]
    remaining = {item["logicalId"] for item in runtime_artifacts}
    evidence = evidence_map(candidate_policy, resolved_documentation)
    dependency_reviews: list[dict[str, Any]] = []
    coverage: list[dict[str, Any]] = []

    for group in candidate_policy.get("groups", []):
        selected = select_group(runtime_artifacts, remaining, group["selector"])
        selected_ids = sorted(item["logicalId"] for item in selected)
        for logical_id in selected_ids:
            if logical_id not in remaining:
                raise RightsEvidenceError(f"{candidate_id} duplicate rights coverage: {logical_id}")
            remaining.remove(logical_id)

        ids = group.get("evidenceIds")
        if not isinstance(ids, list) or not ids:
            raise RightsEvidenceError(f"{candidate_id}:{group['groupId']} has no evidenceIds")
        descriptors = []
        for evidence_id in ids:
            if evidence_id not in evidence:
                raise RightsEvidenceError(f"{candidate_id} unknown evidenceId: {evidence_id}")
            descriptors.append(evidence[evidence_id])
        descriptors.sort(key=lambda value: value["evidenceId"])

        dependency_reviews.append({
            "source": manifest["primarySource"],
            "artifactLogicalIds": selected_ids,
            "licenseId": group["licenseId"],
            "licenseEvidenceSha256": domain_hash(LICENSE_EVIDENCE_DOMAIN, descriptors),
            "obligationsEvidenceSha256": domain_hash(OBLIGATIONS_DOMAIN, group["obligations"]),
            "conclusion": group["conclusion"],
        })
        coverage.append({
            "groupId": group["groupId"],
            "artifactCount": len(selected_ids),
            "relativePaths": sorted(item["relativePath"] for item in selected),
        })

    if remaining:
        uncovered = sorted(
            item["relativePath"] for item in runtime_artifacts if item["logicalId"] in remaining
        )
        raise RightsEvidenceError(f"{candidate_id} uncovered runtime artifacts: {uncovered}")
    covered_ids = [
        logical_id
        for review in dependency_reviews
        for logical_id in review["artifactLogicalIds"]
    ]
    if len(covered_ids) != len(set(covered_ids)):
        raise RightsEvidenceError(f"{candidate_id} runtime artifact covered more than once")
    if len(covered_ids) != len(runtime_artifacts):
        raise RightsEvidenceError(f"{candidate_id} runtime rights coverage cardinality mismatch")

    rights_review = {
        "schemaVersion": RIGHTS_SCHEMA,
        "candidateId": candidate_id,
        "reviewState": "REVIEWED",
        "artifactManifestDigest": candidate["modelContentSha256"],
        "aggregateLicenseId": candidate_policy["aggregateLicenseId"],
        "dependencyReviews": sorted(
            dependency_reviews,
            key=lambda value: (
                value["source"]["sourceRoot"],
                value["source"]["immutableRevision"],
                value["licenseId"],
                tuple(value["artifactLogicalIds"]),
            ),
        ),
        "commercialUseConclusion": candidate_policy["commercialUseConclusion"],
        "reviewPolicySha256": review_policy_sha256,
        "rationaleEvidenceSha256": domain_hash(RATIONALE_DOMAIN, candidate_policy["rationale"]),
    }
    return {
        "candidateId": candidate_id,
        "modelContentSha256": candidate["modelContentSha256"],
        "artifactManifest": manifest,
        "runtimeArtifactCount": len(runtime_artifacts),
        "coverage": coverage,
        "rightsReview": rights_review,
        "rightsEvidenceSha256": domain_hash(RIGHTS_DOMAIN, rights_review),
        "benchmarkRunnable": False,
        "benchmarkRunnableReason": "TRUST_BUNDLE_NOT_PINNED",
    }


def collect(policy_path: Path, campaign_path: Path) -> dict[str, Any]:
    policy = json.loads(policy_path.read_text(encoding="utf-8"))
    campaign = json.loads(campaign_path.read_text(encoding="utf-8"))
    if policy.get("schemaVersion") != "BERS_HSME_FOUNDATION_RIGHTS_ADMISSION_POLICY_V1":
        raise RightsEvidenceError("rights policy schema mismatch")
    if policy.get("scope") != "BENCHMARK_EVIDENCE_ONLY_NOT_PRODUCTION_APPROVAL":
        raise RightsEvidenceError("rights scope must remain benchmark-only")
    if policy.get("legalReviewRequiredBeforeProductDeployment") is not True:
        raise RightsEvidenceError("production legal review must remain explicitly required")
    for field in (
        "candidateOutputsObserved",
        "productionAuthorityGranted",
        "providerAuthorityGranted",
        "billingAuthorityGranted",
        "projectArtifactMutationAllowed",
        "durableModelFleetPromotionAllowed",
        "trainingOrDistillationAllowed",
    ):
        if policy.get(field) is not False:
            raise RightsEvidenceError(f"{field} must remain false")

    artifact_evidence = collector.collect(campaign_path)
    artifact_candidates = {
        item["candidateId"]: item
        for item in artifact_evidence["candidates"]
    }
    policies = {item["candidateId"]: item for item in policy["candidates"]}
    campaign_candidates = {item["candidateId"]: item for item in campaign["candidates"]}
    if set(artifact_candidates) != set(policies) or set(policies) != set(campaign_candidates):
        raise RightsEvidenceError("rights policy/campaign/artifact candidate sets differ")

    review_policy_sha256 = domain_hash(REVIEW_POLICY_DOMAIN, policy["reviewPolicy"])
    results = []
    repins = []
    for candidate_id in sorted(policies):
        candidate = artifact_candidates[candidate_id]
        campaign_candidate = campaign_candidates[candidate_id]
        candidate_policy = policies[candidate_id]
        if "rightsSafeRepin" in candidate_policy:
            candidate, repin = prove_rights_safe_repin(
                candidate,
                candidate_policy,
                campaign_candidate,
            )
            repins.append(repin)
        elif candidate["modelContentSha256"] != campaign_candidate["modelContentSha256"]:
            raise RightsEvidenceError(f"{candidate_id} modelContentSha256 differs from campaign")
        result = build_candidate_rights(
            candidate,
            candidate_policy,
            review_policy_sha256,
        )
        repin_record = next((item for item in repins if item["candidateId"] == candidate_id), None)
        result["campaignUpdateRequired"] = bool(repin_record and repin_record["campaignUpdateRequired"])
        results.append(result)

    return {
        "schemaVersion": SCHEMA,
        "scope": policy["scope"],
        "reviewedAtUtc": policy["reviewedAtUtc"],
        "reviewPolicySha256": review_policy_sha256,
        "candidateOutputsObserved": False,
        "fixturePackPinned": campaign["fixturePack"]["state"] == "PINNED",
        "productionAuthorityGranted": False,
        "providerAuthorityGranted": False,
        "billingAuthorityGranted": False,
        "projectArtifactMutationAllowed": False,
        "durableModelFleetPromotionAllowed": False,
        "trainingOrDistillationAllowed": False,
        "rightsSafeRepins": repins,
        "candidates": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--policy", required=True, type=Path)
    parser.add_argument("--campaign", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    result = collect(args.policy, args.campaign)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(result, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({
        "schemaVersion": result["schemaVersion"],
        "candidateCount": len(result["candidates"]),
        "rightsEvidenceSha256": {
            item["candidateId"]: item["rightsEvidenceSha256"]
            for item in result["candidates"]
        },
        "benchmarkRunnable": {
            item["candidateId"]: item["benchmarkRunnable"]
            for item in result["candidates"]
        },
        "rightsSafeRepins": result["rightsSafeRepins"],
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
