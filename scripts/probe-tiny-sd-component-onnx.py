#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gc
import inspect
import json
from pathlib import Path
from typing import Any

import diffusers
import numpy as np
import onnx
import onnxruntime as ort
import safetensors
import torch
import transformers

from tiny_sd_d2_common import (
    deterministic_text_inputs,
    deterministic_unet_inputs,
    deterministic_vae_input,
    load_manifest,
    load_text_encoder,
    load_unet,
    load_vae,
    numeric_metrics,
    sha256_file,
)

EXPECTED = {
    "numpy": "2.4.6",
    "diffusers": "0.39.0",
    "transformers": "4.57.6",
    "safetensors": "0.8.0",
    "onnx": "1.22.0",
    "onnxruntime": "1.27.0",
}
OPSET = 18
REFERENCE_TOLERANCE = {
    "text_encoder": {"maxAbs": 5e-4, "rmse": 5e-5},
    "unet": {"maxAbs": 1e-3, "rmse": 1e-4},
    "vae_decoder": {"maxAbs": 1e-3, "rmse": 1e-4},
}
ORT_TOLERANCE = {
    "text_encoder": {"maxAbs": 5e-4, "rmse": 5e-5},
    "unet": {"maxAbs": 2e-3, "rmse": 2e-4},
    "vae_decoder": {"maxAbs": 2e-3, "rmse": 2e-4},
}


class TextEncoderWrapper(torch.nn.Module):
    def __init__(self, model: torch.nn.Module):
        super().__init__()
        self.model = model

    def forward(self, input_ids: torch.Tensor, attention_mask: torch.Tensor) -> torch.Tensor:
        return self.model(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state


class UNetWrapper(torch.nn.Module):
    def __init__(self, model: torch.nn.Module):
        super().__init__()
        self.model = model

    def forward(
        self,
        sample: torch.Tensor,
        timestep: torch.Tensor,
        encoder_hidden_states: torch.Tensor,
    ) -> torch.Tensor:
        return self.model(sample, timestep, encoder_hidden_states=encoder_hidden_states).sample


class VaeDecoderWrapper(torch.nn.Module):
    def __init__(self, model: torch.nn.Module, scaling_factor: float):
        super().__init__()
        self.model = model
        self.scaling_factor = float(scaling_factor)

    def forward(self, stable_diffusion_latent: torch.Tensor) -> torch.Tensor:
        return self.model.decode(stable_diffusion_latent / self.scaling_factor).sample


def environment() -> dict[str, Any]:
    import onnxscript

    values = {
        "torch": torch.__version__,
        "numpy": np.__version__,
        "diffusers": diffusers.__version__,
        "transformers": transformers.__version__,
        "safetensors": safetensors.__version__,
        "onnx": onnx.__version__,
        "onnxscript": onnxscript.__version__,
        "onnxruntime": ort.__version__,
        "dynamoDefault": inspect.signature(torch.onnx.export).parameters["dynamo"].default,
    }
    if not values["torch"].startswith("2.13.0"):
        raise RuntimeError(f"unexpected modern PyTorch: {values['torch']}")
    for key, expected in EXPECTED.items():
        if values[key] != expected:
            raise RuntimeError(f"Tiny-SD D2 exporter environment drift: {key}={values[key]!r}, expected={expected!r}")
    if values["onnxscript"] != "0.7.1":
        raise RuntimeError(f"unexpected ONNXScript: {values['onnxscript']}")
    if values["dynamoDefault"] is not True:
        raise RuntimeError("PyTorch 2.13 ONNX dynamo exporter is no longer the default")
    return values


def require_metrics(label: str, metrics: dict[str, float], tolerance: dict[str, float]) -> None:
    if metrics["maxAbs"] > tolerance["maxAbs"] or metrics["rmse"] > tolerance["rmse"]:
        raise RuntimeError(
            f"{label} parity failed: maxAbs={metrics['maxAbs']:.8g} rmse={metrics['rmse']:.8g} "
            f"limits={tolerance}"
        )


def require_state_load(label: str, evidence: dict[str, Any]) -> None:
    if evidence.get("allLearnedParametersExactFromD1Bridge") is not True:
        raise RuntimeError(f"{label} does not prove exact learned-parameter loading from D1")
    if evidence.get("unexpectedBridgeKeys") != []:
        raise RuntimeError(f"{label} has unexpected bridge keys")
    if evidence.get("derivedBufferPolicy") != "EXACT_CLOSED_ALLOWLIST":
        raise RuntimeError(f"{label} derived-buffer policy drift")
    derived = evidence.get("derivedNonLearnedBuffers")
    if not isinstance(derived, list):
        raise RuntimeError(f"{label} derived-buffer evidence is malformed")
    for item in derived:
        if item.get("key") != "text_model.embeddings.position_ids":
            raise RuntimeError(f"{label} contains unapproved derived buffer: {item!r}")
        if item.get("authority") != "DERIVED_FROM_PINNED_CONFIG_NOT_D1_WEIGHT":
            raise RuntimeError(f"{label} derived buffer authority drift")
        if item.get("learnedParameter") is not False:
            raise RuntimeError(f"{label} derived buffer unexpectedly became learned")


def graph_inventory(path: Path) -> dict[str, Any]:
    model = onnx.load(path, load_external_data=True)
    onnx.checker.check_model(model, full_check=True)
    domains = sorted({node.domain or "ai.onnx" for node in model.graph.node})
    custom_nodes = sorted({
        f"{node.domain or 'ai.onnx'}::{node.op_type}"
        for node in model.graph.node
        if (node.domain or "ai.onnx") not in ("ai.onnx", "")
    })
    aten_like = sorted({
        f"{node.domain or 'ai.onnx'}::{node.op_type}"
        for node in model.graph.node
        if "aten" in (node.domain or "").lower() or "aten" in node.op_type.lower()
    })
    if custom_nodes:
        raise RuntimeError(f"custom-domain ONNX nodes rejected: {custom_nodes[:20]}")
    if aten_like:
        raise RuntimeError(f"ATen-like ONNX nodes rejected: {aten_like[:20]}")
    return {
        "nodeCount": len(model.graph.node),
        "domains": domains,
        "opsetImports": sorted({(item.domain or "ai.onnx", int(item.version)) for item in model.opset_import}),
        "functionCount": len(model.functions),
    }


def classify_export_failure(error: BaseException) -> tuple[str, str]:
    message = f"{type(error).__name__}: {error}"
    lowered = message.lower()
    if "unsupported" in lowered or "not implemented" in lowered or "no onnx function" in lowered:
        return "BLOCKED_UNSUPPORTED_OPERATOR", message[:6000]
    if "translation" in lowered or "conversion" in lowered or "dispatch" in lowered:
        return "BLOCKED_ONNX_TRANSLATION", message[:6000]
    if "export" in lowered and ("graph" in lowered or "torch.export" in lowered):
        return "BLOCKED_TORCH_EXPORT_CAPTURE", message[:6000]
    raise RuntimeError(f"unexpected Tiny-SD D2 exporter failure: {message[:6000]}") from error


def export_and_ort(
    *,
    name: str,
    wrapper: torch.nn.Module,
    torch_inputs: tuple[torch.Tensor, ...],
    input_names: list[str],
    output_name: str,
    reference: np.ndarray,
    onnx_path: Path,
    state_load: dict[str, Any],
) -> dict[str, Any]:
    require_state_load(f"{name} modern state-load", state_load)
    wrapper.eval()
    with torch.inference_mode():
        modern = wrapper(*torch_inputs).detach().cpu().float().numpy()
    reference_metrics = numeric_metrics(reference, modern)
    require_metrics(f"{name} historical-reference", reference_metrics, REFERENCE_TOLERANCE[name])

    onnx_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        torch.onnx.export(
            wrapper,
            torch_inputs,
            str(onnx_path),
            dynamo=True,
            opset_version=OPSET,
            input_names=input_names,
            output_names=[output_name],
            external_data=False,
            verify=False,
            report=False,
        )
    except Exception as error:
        result, message = classify_export_failure(error)
        return {
            "result": result,
            "error": message,
            "stateLoad": state_load,
            "referenceParity": reference_metrics,
            "referenceParityPassed": True,
            "artifactProduced": False,
        }

    if not onnx_path.is_file() or onnx_path.stat().st_size <= 0:
        raise RuntimeError(f"{name} exporter produced no ONNX bytes")
    inventory = graph_inventory(onnx_path)
    size = onnx_path.stat().st_size
    digest = sha256_file(onnx_path)

    del wrapper
    gc.collect()

    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    expected_inputs = [value.name for value in session.get_inputs()]
    if expected_inputs != input_names:
        raise RuntimeError(f"{name} ORT input contract changed: {expected_inputs!r}")
    if [value.name for value in session.get_outputs()] != [output_name]:
        raise RuntimeError(f"{name} ORT output contract changed")
    feeds = {
        input_name: tensor.detach().cpu().numpy()
        for input_name, tensor in zip(input_names, torch_inputs, strict=True)
    }
    actual = session.run([output_name], feeds)[0]
    ort_metrics = numeric_metrics(modern, actual)
    require_metrics(f"{name} ORT", ort_metrics, ORT_TOLERANCE[name])
    del session
    gc.collect()

    return {
        "result": "PASS",
        "stateLoad": state_load,
        "referenceParity": reference_metrics,
        "referenceParityPassed": True,
        "ortParity": ort_metrics,
        "ortParityPassed": True,
        "artifactProduced": True,
        "artifact": {"size": size, "sha256": digest, "releaseIdentityPinned": False},
        "graph": inventory,
        "inputNames": input_names,
        "outputName": output_name,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--bridge-dir", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--reference", type=Path, required=True)
    parser.add_argument("--reference-report", type=Path, required=True)
    parser.add_argument("--onnx-dir", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()

    env = environment()
    snapshot = args.snapshot.resolve(strict=True)
    bridge_dir = args.bridge_dir.resolve(strict=True)
    manifest = load_manifest(args.manifest.resolve(strict=True))
    reference_path = args.reference.resolve(strict=True)
    reference_report = json.loads(args.reference_report.resolve(strict=True).read_text(encoding="utf-8"))
    if reference_report.get("stage") != "D2_REFERENCE_SEMANTICS":
        raise RuntimeError("unexpected Tiny-SD D2 reference evidence")
    if reference_report.get("referenceBundle", {}).get("sha256") != sha256_file(reference_path):
        raise RuntimeError("Tiny-SD D2 reference bundle SHA mismatch")
    if reference_report.get("runtimeAuthorityGranted") is not False or reference_report.get("productionApproval") is not False:
        raise RuntimeError("Tiny-SD D2 reference evidence unexpectedly grants authority")
    if reference_report.get("stateLoadPolicy") != "ALL_LEARNED_PARAMETERS_EXACT_FROM_D1; ONLY_CLOSED_DERIVED_NONLEARNED_BUFFERS_ALLOWED":
        raise RuntimeError("Tiny-SD D2 historical state-load policy drift")
    historical_semantics = reference_report.get("semantics") or {}
    for key in ("textEncoder", "unet", "vaeDecoder"):
        state_load = (historical_semantics.get(key) or {}).get("stateLoad")
        if not isinstance(state_load, dict):
            raise RuntimeError(f"Tiny-SD D2 historical state-load evidence missing: {key}")
        require_state_load(f"historical {key}", state_load)

    with np.load(reference_path, allow_pickle=False) as bundle:
        reference = {key: np.ascontiguousarray(bundle[key].astype(np.float32, copy=False)) for key in bundle.files}
    if set(reference) != {"text_encoder", "unet", "vae_decoder"}:
        raise RuntimeError(f"Tiny-SD D2 reference component set changed: {sorted(reference)}")

    components: dict[str, Any] = {}

    text_encoder, text_config, text_load = load_text_encoder(snapshot, bridge_dir, manifest)
    text_inputs = deterministic_text_inputs(int(text_config.vocab_size))
    components["text_encoder"] = export_and_ort(
        name="text_encoder",
        wrapper=TextEncoderWrapper(text_encoder),
        torch_inputs=text_inputs,
        input_names=["input_ids", "attention_mask"],
        output_name="last_hidden_state",
        reference=reference["text_encoder"],
        onnx_path=args.onnx_dir / "text_encoder.onnx",
        state_load=text_load,
    )
    del text_encoder
    gc.collect()

    unet, unet_config, unet_load = load_unet(snapshot, bridge_dir, manifest)
    unet_inputs = deterministic_unet_inputs(int(unet_config["cross_attention_dim"]))
    components["unet"] = export_and_ort(
        name="unet",
        wrapper=UNetWrapper(unet),
        torch_inputs=unet_inputs,
        input_names=["sample", "timestep", "encoder_hidden_states"],
        output_name="noise_prediction",
        reference=reference["unet"],
        onnx_path=args.onnx_dir / "unet.onnx",
        state_load=unet_load,
    )
    del unet
    gc.collect()

    vae, vae_config, vae_load = load_vae(snapshot, bridge_dir, manifest)
    scaling_factor = float(vae_config.get("scaling_factor", 0.18215))
    vae_inputs = (deterministic_vae_input(),)
    components["vae_decoder"] = export_and_ort(
        name="vae_decoder",
        wrapper=VaeDecoderWrapper(vae, scaling_factor),
        torch_inputs=vae_inputs,
        input_names=["stable_diffusion_latent"],
        output_name="decoded_rgb",
        reference=reference["vae_decoder"],
        onnx_path=args.onnx_dir / "vae_decoder.onnx",
        state_load=vae_load,
    )
    del vae
    gc.collect()

    pass_count = sum(value["result"] == "PASS" for value in components.values())
    blocked = {key: value["result"] for key, value in components.items() if value["result"] != "PASS"}
    report = {
        "schemaVersion": 1,
        "status": "CANDIDATE",
        "stage": "D2_COMPONENT_ONNX_CPU_FEASIBILITY",
        "environment": env,
        "opset": OPSET,
        "d1TrustRootReused": True,
        "historicalReferenceVerifiedBeforeExport": True,
        "referenceEnvironment": reference_report["environment"],
        "stateLoadPolicy": reference_report["stateLoadPolicy"],
        "components": components,
        "passCount": pass_count,
        "blockedComponents": blocked,
        "allComponentsPass": pass_count == 3,
        "onnxArtifactsRunnerLocalOnly": True,
        "releaseIdentityPinned": False,
        "runtimeAuthorityGranted": False,
        "productionApproval": False,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"TINY-SD D2 COMPONENT ONNX: pass={pass_count}/3 blocked={blocked}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
