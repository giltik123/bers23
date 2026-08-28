#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gc
import hashlib
import json
from pathlib import Path

import torch
from safetensors.torch import save_file

COMPONENTS = {
    "text_encoder": "text_encoder/pytorch_model.bin",
    "unet": "unet/diffusion_pytorch_model.bin",
    "vae": "vae/diffusion_pytorch_model.bin",
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot", required=True)
    parser.add_argument("--inventory", required=True)
    parser.add_argument("--expected-manifest", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()

    snapshot = Path(args.snapshot).resolve(strict=True)
    inventory = json.loads(Path(args.inventory).read_text(encoding="utf-8"))
    if inventory.get("matchesPinnedManifest") is not True:
        raise RuntimeError("Tiny-SD inventory was not admitted against the pinned manifest")
    by_path = {record["path"]: record for record in inventory["inventory"]}

    manifest = json.loads(Path(args.expected_manifest).read_text(encoding="utf-8"))
    if manifest.get("modelId") != "segmind-tiny-sd" or manifest.get("status") != "CANDIDATE":
        raise RuntimeError("unexpected Tiny-SD manifest identity/status")
    expected_bridge = manifest.get("tensorBridge", {})
    if expected_bridge.get("state") != "PINNED":
        raise RuntimeError("Tiny-SD tensor bridge identity must be PINNED")
    if expected_bridge.get("hashBeforeDeserializationRequired") is not True or expected_bridge.get("weightsOnlyRequired") is not True:
        raise RuntimeError("Tiny-SD pinned bridge security contract changed")
    pinned_components = expected_bridge.get("components")
    if not isinstance(pinned_components, list) or len(pinned_components) != len(COMPONENTS):
        raise RuntimeError("Tiny-SD pinned bridge component set is incomplete")
    pinned_by_component = {record.get("component"): record for record in pinned_components}
    if set(pinned_by_component) != set(COMPONENTS):
        raise RuntimeError("Tiny-SD pinned bridge component names changed")

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    component_reports = []
    for component, relative in COMPONENTS.items():
        expected_source = by_path.get(relative)
        pinned = pinned_by_component[component]
        if not expected_source or expected_source.get("kind") != "PICKLE_WEIGHT":
            raise RuntimeError(f"missing inventory binding for {relative}")
        if pinned.get("sourcePath") != relative:
            raise RuntimeError(f"pinned bridge source path changed: {component}")
        source = snapshot / relative
        if source.is_symlink() or not source.is_file():
            raise RuntimeError(f"invalid source weight path: {relative}")
        actual_size = source.stat().st_size
        actual_sha = sha256_file(source)
        if actual_size != expected_source["size"] or actual_sha != expected_source["sha256"]:
            raise RuntimeError(f"source weight drift before deserialization: {relative}")
        if actual_size != pinned.get("sourceSize") or actual_sha != pinned.get("sourceSha256"):
            raise RuntimeError(f"source weight differs from pinned bridge identity: {relative}")

        state = torch.load(source, map_location="cpu", weights_only=True)
        if not isinstance(state, dict) or not state:
            raise RuntimeError(f"unexpected state_dict container: {relative}")
        if not all(isinstance(key, str) for key in state):
            raise RuntimeError(f"non-string state_dict key: {relative}")
        if not all(isinstance(value, torch.Tensor) for value in state.values()):
            raise RuntimeError(f"non-tensor state_dict value: {relative}")

        tensors = {key: value.detach().cpu().contiguous() for key, value in state.items()}
        target = out_dir / f"{component}.safetensors"
        save_file(tensors, str(target))
        record = {
            "component": component,
            "sourcePath": relative,
            "sourceSize": actual_size,
            "sourceSha256": actual_sha,
            "sourceVerifiedBeforeDeserialization": True,
            "weightsOnly": True,
            "keyCount": len(tensors),
            "tensorElements": sum(tensor.numel() for tensor in tensors.values()),
            "dtypes": sorted({str(tensor.dtype) for tensor in tensors.values()}),
            "bridgePath": target.name,
            "bridgeSize": target.stat().st_size,
            "bridgeSha256": sha256_file(target),
        }
        pinned_identity = {
            key: pinned.get(key)
            for key in (
                "component",
                "sourcePath",
                "sourceSize",
                "sourceSha256",
                "keyCount",
                "tensorElements",
                "dtypes",
                "bridgeSize",
                "bridgeSha256",
            )
        }
        observed_identity = {key: record[key] for key in pinned_identity}
        if observed_identity != pinned_identity:
            raise RuntimeError(f"Tiny-SD pinned tensor bridge identity mismatch: {component}")
        component_reports.append(record)
        del tensors
        del state
        gc.collect()

    report = {
        "status": "CANDIDATE",
        "modelId": "segmind-tiny-sd",
        "sourceFormat": "PYTORCH_PICKLE_STATE_DICT",
        "targetFormat": "SAFETENSORS",
        "components": component_reports,
        "sourceVerifiedBeforeDeserialization": True,
        "weightsOnly": True,
        "pickleFreeBridge": True,
        "matchesPinnedManifest": True,
        "bridgeEphemeral": True,
        "bridgePublished": False,
        "runtimeAuthorityGranted": False,
        "productionApproval": False,
    }
    target = Path(args.report)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(
        "TINY-SD PINNED TENSOR BRIDGE: PASS "
        + " ".join(f"{item['component']}={item['bridgeSha256']}" for item in component_reports)
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
