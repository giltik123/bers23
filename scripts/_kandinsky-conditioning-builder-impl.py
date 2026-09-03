#!/usr/bin/env python3
"""Offline, fail-closed Kandinsky D2c conditioning builder.

This is a research/build-only path. It consumes the D1-pinned sealed prior,
verifies all pinned bytes before model load, enforces a tested exact CPU FP32
toolchain, binds the accepted D2b candidate identities, and emits only the two
decoder-ready conditioning tensors plus immutable builder evidence.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib
import json
import os
import platform
import re
import socket
import sys
import tempfile
from pathlib import Path
from typing import Any, Mapping

SHA256 = re.compile(r"^[0-9a-f]{64}$")
CONTAINER_DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
D1_MODEL_ID = "kandinsky-2-2-decoder-inpaint-refinement"
D1_VERSION = "0.1.0-feasibility.3"
PRIOR_REPOSITORY = "kandinsky-community/kandinsky-2-2-prior"
PRIOR_REVISION = "40cd65123bb828e5641b118b77b38be1aee69891"
DIFFUSERS_VERSION = "0.18.0.dev0"
DIFFUSERS_REVISION = "746215670a61af1034c470d0b6555be9c60cb7b6"
PRIOR_PIPELINE_GIT_BLOB_SHA1 = "3b9974a5dd70e8b775caa01efab6b637ff22d9e5"
EXPECTED_PIPELINE_CLASS = "KandinskyV22PriorPipeline"
EXPECTED_INTENT = "GARMENT_APPEARANCE_REFINEMENT_RESEARCH_ONLY"

CANDIDATE_CONTRACT_SHA256 = {
    "A_NEUTRAL_ZERO_NEGATIVE": "85bea25dc00c2e23c4c2cf9e41a2a0531e93a19059d4dc3fa0c9208c766217e4",
    "B_REALISM_ZERO_NEGATIVE": "d0dc3f97e84e7439c063f5fbcb1c3eae9b668c3d84dd8adfa1ed116837e3f175",
    "C_PRESERVATION_EXPLICIT_NEGATIVE": "804544da31ad9765793d830225fcad7119058965b665349170f2123474541f30",
}
POSITIVE_SOURCE_BY_CANDIDATE = {
    "A_NEUTRAL_ZERO_NEGATIVE": None,
    "B_REALISM_ZERO_NEGATIVE": None,
    "C_PRESERVATION_EXPLICIT_NEGATIVE": "B_REALISM_ZERO_NEGATIVE",
}
NEGATIVE_MODE_BY_CANDIDATE = {
    "A_NEUTRAL_ZERO_NEGATIVE": "HISTORICAL_ZERO_IMAGE",
    "B_REALISM_ZERO_NEGATIVE": "HISTORICAL_ZERO_IMAGE",
    "C_PRESERVATION_EXPLICIT_NEGATIVE": "EXPLICIT_NEGATIVE_PRIOR",
}


def main() -> int:
    args = parse_args()
    force_offline_environment()

    d1 = read_json(real_file(Path(args.d1_manifest), "D1 manifest"), "D1 manifest")
    prompt_contract = read_json(real_file(Path(args.prompt_contract), "conditioning prompt contract"), "conditioning prompt contract")
    toolchain_lock = read_json(real_file(Path(args.toolchain_lock), "builder toolchain lock"), "builder toolchain lock")

    validate_d1(d1)
    candidate_id = validate_prompt_contract(prompt_contract)
    contract_sha = canonical_sha256(prompt_contract)
    accepted_sha = CANDIDATE_CONTRACT_SHA256[candidate_id]
    if contract_sha != accepted_sha or args.expected_contract_sha256 != accepted_sha:
        fail("conditioning prompt contract SHA-256 is not the accepted D2b candidate identity")
    validate_toolchain_lock_shape(toolchain_lock)

    source_paths = resolve_positive_source_arguments(args, prompt_contract)
    prior_root = sealed_directory(Path(args.prior_root), "prior root")
    verify_prior_tree(prior_root, d1)

    torch, diffusers, transformers, numpy, safetensors = import_pinned_runtime(toolchain_lock)
    verify_historical_prior_source(diffusers, toolchain_lock)
    configure_torch_determinism(torch, args.seed)

    positive_source = None
    if source_paths is not None:
        positive_source = load_positive_source(
            torch=torch,
            manifest_path=source_paths[0],
            bundle_path=source_paths[1],
            expected_candidate_id=prompt_contract["positiveEmbeddingSourceCandidateId"],
        )

    if args.verify_only:
        payload = {
            "status": "VERIFIED",
            "candidateId": candidate_id,
            "conditioningContractSha256": contract_sha,
            "positiveEmbeddingSourceCandidateId": prompt_contract["positiveEmbeddingSourceCandidateId"],
        }
        print(json.dumps(payload, sort_keys=True))
        return 0

    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    assert_empty_or_evidence_only(output_dir)

    pipeline = build_prior_pipeline(diffusers, torch, prior_root)
    result = run_prior(pipeline, torch, prompt_contract, args.seed)
    generated_image = normalize_tensor(torch, result.image_embeds, "generated image_embeds")
    negative_image = normalize_tensor(torch, result.negative_image_embeds, "negative_image_embeds")

    if positive_source is None:
        image = generated_image
    else:
        image = positive_source["imageTensor"]
        if tuple(image.shape) != tuple(generated_image.shape):
            fail("reused B image_embeds shape differs from C generated positive shape")

    if tuple(image.shape) != tuple(negative_image.shape):
        fail("positive and negative conditioning shapes differ")

    bundle_path = output_dir / f"{candidate_id}.conditioning.safetensors"
    write_safetensors_atomic(bundle_path, image, negative_image)
    verify_safetensors_roundtrip(torch, bundle_path, image, negative_image)

    evidence = build_evidence(
        args=args,
        d1=d1,
        prompt_contract=prompt_contract,
        conditioning_contract_sha256=contract_sha,
        toolchain_lock=toolchain_lock,
        bundle_path=bundle_path,
        image_embeds=image,
        negative_image_embeds=negative_image,
        positive_source=positive_source,
    )
    evidence_path = output_dir / f"{candidate_id}.builder-evidence.json"
    write_canonical_json_atomic(evidence_path, evidence)
    print(json.dumps({
        "status": "BUILT",
        "candidateId": candidate_id,
        "bundle": str(bundle_path),
        "evidence": str(evidence_path),
        "sha256": evidence["bundle"]["sha256"],
    }, sort_keys=True))
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prior-root", required=True)
    parser.add_argument("--d1-manifest", required=True)
    parser.add_argument("--prompt-contract", required=True)
    parser.add_argument("--expected-contract-sha256", required=True, type=canonical_sha_arg)
    parser.add_argument("--toolchain-lock", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--seed", required=True, type=non_negative_int)
    parser.add_argument("--positive-source-manifest")
    parser.add_argument("--positive-source-bundle")
    parser.add_argument("--verify-only", action="store_true")
    return parser.parse_args()


def force_offline_environment() -> None:
    for name in ("HF_HUB_OFFLINE", "TRANSFORMERS_OFFLINE", "DIFFUSERS_OFFLINE"):
        os.environ[name] = "1"
    for name in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS", "NUMEXPR_NUM_THREADS", "VECLIB_MAXIMUM_THREADS"):
        os.environ[name] = "1"
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

    original_connect = socket.socket.connect

    def blocked_connect(self: socket.socket, address: Any) -> Any:  # pragma: no cover - defense in depth
        raise RuntimeError(f"network access is forbidden in Kandinsky D2c builder: {address!r}")

    socket.socket.connect = blocked_connect  # type: ignore[assignment]
    globals()["_ORIGINAL_SOCKET_CONNECT"] = original_connect


def validate_d1(value: Mapping[str, Any]) -> None:
    if value.get("modelId") != D1_MODEL_ID or value.get("version") != D1_VERSION:
        fail("D1 model identity mismatch")
    if value.get("status") != "CANDIDATE" or value.get("productionExecutable") is not False or value.get("runtimeAuthorityGranted") is not False:
        fail("D1 trust root is no longer research-only")
    prior = require_mapping(value.get("offlinePrior"), "offlinePrior")
    if prior.get("repository") != PRIOR_REPOSITORY or prior.get("revision") != PRIOR_REVISION or prior.get("runtimeDependencyAllowed") is not False:
        fail("offline prior identity or runtime prohibition mismatch")
    security = require_mapping(value.get("securityPolicy"), "securityPolicy")
    if security.get("pickleWeightsAllowed") is not False or security.get("safetensorsRequired") is not True or security.get("hashBeforeUseRequired") is not True:
        fail("D1 weight security policy mismatch")


def validate_prompt_contract(value: Mapping[str, Any]) -> str:
    required = {
        "schemaVersion", "stage", "candidateId", "positivePrompt", "negativePrompt", "negativeMode",
        "positiveEmbeddingSourceCandidateId", "prior", "decoder", "intent",
    }
    if set(value) != required:
        fail("D2b conditioning prompt contract keys are open or incomplete")
    if value.get("schemaVersion") != 1 or value.get("stage") != "F5B1_D2B_PROMPT_SEMANTICS_RESEARCH":
        fail("D2b conditioning prompt contract version/stage mismatch")

    candidate_id = value.get("candidateId")
    if candidate_id not in CANDIDATE_CONTRACT_SHA256:
        fail("D2b candidate identity is unknown")
    if value.get("negativeMode") != NEGATIVE_MODE_BY_CANDIDATE[candidate_id]:
        fail("D2b negative conditioning mode drift")
    if value.get("positiveEmbeddingSourceCandidateId") != POSITIVE_SOURCE_BY_CANDIDATE[candidate_id]:
        fail("D2b positive embedding source policy drift")

    negative = value.get("negativePrompt")
    if value["negativeMode"] == "HISTORICAL_ZERO_IMAGE" and negative is not None:
        fail("historical zero-image mode must use negativePrompt=null")
    if value["negativeMode"] == "EXPLICIT_NEGATIVE_PRIOR" and (not isinstance(negative, str) or not negative):
        fail("explicit-negative mode requires a non-empty negative prompt")
    if not isinstance(value.get("positivePrompt"), str) or not value["positivePrompt"]:
        fail("positive prompt is invalid")

    prior = require_mapping(value.get("prior"), "prior")
    if prior != {
        "diffusersRevision": DIFFUSERS_REVISION,
        "pipelineClass": EXPECTED_PIPELINE_CLASS,
        "numImagesPerPrompt": 1,
        "numInferenceSteps": 25,
        "guidanceScale": 4,
        "outputType": "pt",
    }:
        fail("D2b historical prior semantics mismatch")

    decoder = require_mapping(value.get("decoder"), "decoder")
    if decoder != {
        "pipelineClass": "KandinskyV22InpaintPipeline",
        "guidanceScale": 4,
        "embeddingOrder": ["negative_image_embeds", "image_embeds"],
    }:
        fail("D2b historical decoder semantics mismatch")
    if value.get("intent") != EXPECTED_INTENT:
        fail("D2b research intent mismatch")
    return candidate_id


def resolve_positive_source_arguments(args: argparse.Namespace, contract: Mapping[str, Any]) -> tuple[Path, Path] | None:
    expected = contract.get("positiveEmbeddingSourceCandidateId")
    manifest_arg = args.positive_source_manifest
    bundle_arg = args.positive_source_bundle
    if expected is None:
        if manifest_arg is not None or bundle_arg is not None:
            fail("A/B candidates forbid positive source manifest/bundle arguments")
        return None
    if not manifest_arg or not bundle_arg:
        fail("C candidate requires both --positive-source-manifest and --positive-source-bundle")
    return (
        real_file(Path(manifest_arg), "positive source manifest"),
        real_file(Path(bundle_arg), "positive source bundle"),
    )


def validate_toolchain_lock_shape(lock: Mapping[str, Any]) -> None:
    expected = {
        "schemaVersion", "status", "containerImageDigest", "pythonVersion", "diffusersVersion", "torchVersion",
        "transformersVersion", "numpyVersion", "safetensorsVersion", "platformMachine",
    }
    if set(lock) != expected or lock.get("schemaVersion") != 1 or lock.get("status") != "TESTED_EXACT":
        fail("toolchain lock is not an exact tested D2c lock")
    digest = lock.get("containerImageDigest")
    if not isinstance(digest, str) or not CONTAINER_DIGEST.fullmatch(digest):
        fail("toolchain containerImageDigest is invalid")
    for key in expected - {"schemaVersion", "status", "containerImageDigest"}:
        value = lock.get(key)
        if not isinstance(value, str) or not value or value.strip() != value or any(token in value.lower() for token in ("latest", "*", ">", "<", "~", "^")):
            fail(f"toolchain {key} is not an exact identity")


def verify_prior_tree(root: Path, d1: Mapping[str, Any]) -> None:
    prior = require_mapping(d1.get("offlinePrior"), "offlinePrior")
    weights = prior.get("safeWeights")
    configs = require_mapping(prior.get("requiredConfigIdentity"), "requiredConfigIdentity").get("files")
    if not isinstance(weights, list) or not isinstance(configs, list) or not weights or not configs:
        fail("D1 prior file identity is incomplete")
    expected_paths: set[str] = set()
    for entry in [*weights, *configs]:
        item = require_mapping(entry, "prior file identity")
        rel = item.get("path")
        size = item.get("size")
        sha = item.get("sha256")
        if not isinstance(rel, str) or rel in expected_paths or not isinstance(size, int) or size < 1 or not isinstance(sha, str) or not SHA256.fullmatch(sha):
            fail("D1 prior file identity is malformed or duplicated")
        expected_paths.add(rel)
        path = sealed_file(root, rel)
        if path.stat().st_size != size or sha256_file(path) != sha:
            fail(f"prior file identity mismatch: {rel}")


def import_pinned_runtime(lock: Mapping[str, Any]):
    if platform.python_version() != lock["pythonVersion"]:
        fail("Python version does not match tested toolchain lock")
    if os.environ.get("BERS_CONTAINER_IMAGE_DIGEST") != lock["containerImageDigest"]:
        fail("container digest attestation does not match tested toolchain lock")
    modules = {
        "torch": importlib.import_module("torch"),
        "diffusers": importlib.import_module("diffusers"),
        "transformers": importlib.import_module("transformers"),
        "numpy": importlib.import_module("numpy"),
        "safetensors": importlib.import_module("safetensors"),
    }
    versions = {
        "torchVersion": modules["torch"].__version__,
        "diffusersVersion": modules["diffusers"].__version__,
        "transformersVersion": modules["transformers"].__version__,
        "numpyVersion": modules["numpy"].__version__,
        "safetensorsVersion": modules["safetensors"].__version__,
        "platformMachine": platform.machine(),
    }
    for key, actual in versions.items():
        if actual != lock[key]:
            fail(f"toolchain {key} mismatch: {actual!r} != {lock[key]!r}")
    if modules["diffusers"].__version__ != DIFFUSERS_VERSION:
        fail("historical Diffusers version mismatch")
    return modules["torch"], modules["diffusers"], modules["transformers"], modules["numpy"], modules["safetensors"]


def verify_historical_prior_source(diffusers: Any, lock: Mapping[str, Any]) -> None:
    module = importlib.import_module("diffusers.pipelines.kandinsky2_2.pipeline_kandinsky2_2_prior")
    source_path = Path(module.__file__).resolve()
    if git_blob_sha1(source_path) != PRIOR_PIPELINE_GIT_BLOB_SHA1:
        fail("installed KandinskyV22PriorPipeline source is not the pinned historical Git blob")
    if lock["diffusersVersion"] != DIFFUSERS_VERSION:
        fail("toolchain lock Diffusers version is not the D2 historical version")


def configure_torch_determinism(torch: Any, seed: int) -> None:
    if torch.cuda.is_available():
        fail("D2c authoritative builder must execute CPU-only; visible CUDA is rejected")
    torch.set_num_threads(1)
    torch.set_num_interop_threads(1)
    torch.use_deterministic_algorithms(True)
    torch.set_default_dtype(torch.float32)
    torch.manual_seed(seed)


def build_prior_pipeline(diffusers: Any, torch: Any, prior_root: Path) -> Any:
    pipeline_class = getattr(diffusers, EXPECTED_PIPELINE_CLASS, None)
    if pipeline_class is None:
        fail("historical KandinskyV22PriorPipeline is unavailable")
    pipeline = pipeline_class.from_pretrained(
        str(prior_root), local_files_only=True, use_safetensors=True, torch_dtype=torch.float32,
    )
    pipeline.to("cpu")
    for component_name in ("prior", "image_encoder", "text_encoder"):
        component = getattr(pipeline, component_name, None)
        if component is None:
            fail(f"prior pipeline component {component_name} is unavailable")
        for parameter in component.parameters():
            if parameter.device.type != "cpu" or parameter.dtype != torch.float32:
                fail(f"prior pipeline component {component_name} is not CPU FP32")
    return pipeline


def run_prior(pipeline: Any, torch: Any, contract: Mapping[str, Any], seed: int) -> Any:
    generator = torch.Generator(device="cpu")
    generator.manual_seed(seed)
    return pipeline(
        prompt=contract["positivePrompt"],
        negative_prompt=contract["negativePrompt"],
        num_images_per_prompt=1,
        num_inference_steps=25,
        guidance_scale=4.0,
        generator=generator,
        latents=None,
        output_type="pt",
        return_dict=True,
    )


def load_positive_source(torch: Any, manifest_path: Path, bundle_path: Path, expected_candidate_id: str) -> Mapping[str, Any]:
    manifest = read_json(manifest_path, "positive source manifest")
    if manifest.get("schemaVersion") != 1 or manifest.get("stage") != "F5B1_D2_CONDITIONING_RESEARCH" or manifest.get("status") != "RESEARCH_CANDIDATE":
        fail("positive source manifest stage/status mismatch")
    conditioning = require_mapping(manifest.get("conditioning"), "positive source conditioning")
    if conditioning.get("candidateId") != expected_candidate_id:
        fail("positive source manifest candidate mismatch")
    if conditioning.get("conditioningContractSha256") != CANDIDATE_CONTRACT_SHA256[expected_candidate_id]:
        fail("positive source manifest contract SHA mismatch")
    if conditioning.get("negativeMode") != NEGATIVE_MODE_BY_CANDIDATE[expected_candidate_id]:
        fail("positive source manifest negative mode mismatch")

    bundle = require_mapping(manifest.get("bundle"), "positive source bundle identity")
    expected_size = bundle.get("size")
    expected_sha = bundle.get("sha256")
    if not isinstance(expected_size, int) or expected_size < 1 or not isinstance(expected_sha, str) or not SHA256.fullmatch(expected_sha):
        fail("positive source bundle identity is malformed")
    if bundle_path.stat().st_size != expected_size or sha256_file(bundle_path) != expected_sha:
        fail("positive source bundle bytes do not match source manifest")

    torch_api = importlib.import_module("safetensors.torch")
    loaded = torch_api.load_file(str(bundle_path), device="cpu")
    if set(loaded) != {"image_embeds", "negative_image_embeds"}:
        fail("positive source bundle tensor set is invalid")
    image = normalize_tensor(torch, loaded["image_embeds"], "positive source image_embeds")
    negative = normalize_tensor(torch, loaded["negative_image_embeds"], "positive source negative_image_embeds")
    if tuple(image.shape) != tuple(negative.shape):
        fail("positive source bundle tensor shapes differ")

    tensors = require_mapping(bundle.get("tensors"), "positive source manifest tensors")
    image_identity = require_mapping(tensors.get("image_embeds"), "positive source image tensor identity")
    if image_identity.get("dtype") != "F32" or image_identity.get("shape") != list(image.shape):
        fail("positive source image tensor does not match source manifest")

    return {
        "candidateId": expected_candidate_id,
        "conditioningContractSha256": conditioning["conditioningContractSha256"],
        "manifestSha256": sha256_file(manifest_path),
        "bundleSize": bundle_path.stat().st_size,
        "bundleSha256": sha256_file(bundle_path),
        "imageEmbedsSha256": tensor_bytes_sha256(image),
        "imageTensor": image,
    }


def normalize_tensor(torch: Any, tensor: Any, name: str) -> Any:
    if not isinstance(tensor, torch.Tensor):
        fail(f"{name} is not a torch.Tensor")
    value = tensor.detach().to(device="cpu", dtype=torch.float32).contiguous()
    if value.ndim < 1 or value.numel() < 1 or not torch.isfinite(value).all().item():
        fail(f"{name} is empty, malformed or non-finite")
    return value


def tensor_bytes_sha256(tensor: Any) -> str:
    return hashlib.sha256(tensor.detach().cpu().contiguous().numpy().tobytes(order="C")).hexdigest()


def write_safetensors_atomic(destination: Path, image_embeds: Any, negative_image_embeds: Any) -> None:
    torch_api = importlib.import_module("safetensors.torch")
    destination.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{destination.name}.", suffix=".tmp", dir=str(destination.parent))
    os.close(fd)
    temp = Path(temp_name)
    try:
        torch_api.save_file({"image_embeds": image_embeds, "negative_image_embeds": negative_image_embeds}, str(temp), metadata=None)
        os.replace(temp, destination)
    finally:
        temp.unlink(missing_ok=True)


def verify_safetensors_roundtrip(torch: Any, path: Path, image_embeds: Any, negative_image_embeds: Any) -> None:
    torch_api = importlib.import_module("safetensors.torch")
    loaded = torch_api.load_file(str(path), device="cpu")
    if set(loaded) != {"image_embeds", "negative_image_embeds"}:
        fail("conditioning bundle contains unexpected tensors")
    image = normalize_tensor(torch, loaded["image_embeds"], "round-trip image_embeds")
    negative = normalize_tensor(torch, loaded["negative_image_embeds"], "round-trip negative_image_embeds")
    if not image_embeds.equal(image) or not negative_image_embeds.equal(negative):
        fail("conditioning safetensors round-trip changed tensor bytes")


def build_evidence(**values: Any) -> Mapping[str, Any]:
    args = values["args"]
    d1 = values["d1"]
    contract = values["prompt_contract"]
    lock = values["toolchain_lock"]
    bundle_path = values["bundle_path"]
    image = values["image_embeds"]
    negative = values["negative_image_embeds"]
    source = values["positive_source"]
    positive_source = None if source is None else {
        key: source[key] for key in (
            "candidateId", "conditioningContractSha256", "manifestSha256", "bundleSize", "bundleSha256", "imageEmbedsSha256"
        )
    }
    return {
        "schemaVersion": 1,
        "stage": "F5B1_D2C_CONDITIONING_BUILD",
        "status": "BUILT_NOT_ADMITTED",
        "candidateId": contract["candidateId"],
        "conditioningContractSha256": values["conditioning_contract_sha256"],
        "positiveEmbeddingSource": positive_source,
        "sourceTrust": {
            "d1ModelId": d1["modelId"],
            "d1Version": d1["version"],
            "priorRepository": PRIOR_REPOSITORY,
            "priorRevision": PRIOR_REVISION,
            "priorPipelineGitBlobSha1": PRIOR_PIPELINE_GIT_BLOB_SHA1,
        },
        "toolchain": dict(lock),
        "determinism": {
            "device": "cpu",
            "outputDtype": "float32",
            "torchDeterministicAlgorithms": True,
            "numThreads": 1,
            "numInteropThreads": 1,
            "ompNumThreads": 1,
            "mklNumThreads": 1,
            "seed": args.seed,
            "generatorPolicy": "TORCH_CPU_GENERATOR_SINGLE_SEED",
            "latentPolicy": "NO_EXTERNAL_LATENTS_PIPELINE_RANDN",
            "networkPolicy": "CONTAINER_NETWORK_NONE_PLUS_LIBRARY_OFFLINE_GUARD",
        },
        "bundle": {
            "format": "safetensors",
            "metadataPolicy": "NONE",
            "tensorOrder": ["image_embeds", "negative_image_embeds"],
            "tensors": {
                "image_embeds": {"dtype": "F32", "shape": list(image.shape), "sha256": tensor_bytes_sha256(image)},
                "negative_image_embeds": {"dtype": "F32", "shape": list(negative.shape), "sha256": tensor_bytes_sha256(negative)},
            },
            "size": bundle_path.stat().st_size,
            "sha256": sha256_file(bundle_path),
        },
    }


def sealed_directory(path: Path, label: str) -> Path:
    if path.is_symlink() or not path.exists() or not path.is_dir():
        fail(f"{label} must be a real non-symlink directory")
    return path.resolve(strict=True)


def real_file(path: Path, label: str) -> Path:
    if path.is_symlink() or not path.exists() or not path.is_file():
        fail(f"{label} must be a real non-symlink regular file")
    return path.resolve(strict=True)


def sealed_file(root: Path, relative: str) -> Path:
    rel = Path(relative)
    if rel.is_absolute() or ".." in rel.parts:
        fail(f"unsafe prior path: {relative}")
    candidate = root / rel
    if candidate.is_symlink() or not candidate.exists() or not candidate.is_file():
        fail(f"prior file must be a real non-symlink regular file: {relative}")
    resolved = candidate.resolve(strict=True)
    if root not in resolved.parents:
        fail(f"prior file escapes sealed root: {relative}")
    return resolved


def assert_empty_or_evidence_only(directory: Path) -> None:
    allowed_suffixes = (".builder-evidence.json", ".conditioning.safetensors")
    unexpected = [entry.name for entry in directory.iterdir() if not entry.name.endswith(allowed_suffixes)]
    if unexpected:
        fail(f"output directory contains unrelated files: {unexpected}")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def git_blob_sha1(path: Path) -> str:
    data = path.read_bytes()
    return hashlib.sha1(f"blob {len(data)}\0".encode("ascii") + data).hexdigest()


def canonical_sha256(value: Any) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def read_json(path: Path, label: str) -> Mapping[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        fail(f"{label} is invalid JSON: {exc}")
    return require_mapping(value, label)


def write_canonical_json_atomic(path: Path, value: Mapping[str, Any]) -> None:
    payload = (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, path)
    finally:
        Path(temp_name).unlink(missing_ok=True)


def require_mapping(value: Any, label: str) -> Mapping[str, Any]:
    if not isinstance(value, dict):
        fail(f"{label} must be an object")
    return value


def canonical_sha_arg(value: str) -> str:
    if not SHA256.fullmatch(value):
        raise argparse.ArgumentTypeError("must be lowercase SHA-256")
    return value


def non_negative_int(value: str) -> int:
    parsed = int(value)
    if parsed < 0:
        raise argparse.ArgumentTypeError("must be non-negative")
    return parsed


def fail(message: str) -> None:
    raise RuntimeError(message)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"KANDINSKY_D2C_BUILD_FAILED: {exc}", file=sys.stderr)
        raise
