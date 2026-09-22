#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import hmac
import importlib
import importlib.metadata
import json
import pathlib
import shutil
import subprocess
import sys
import time
import traceback
import zlib
import struct
from typing import Any

PLAN_SCHEMA="BERS_HSME_FOUNDATION_BENCHMARK_EXECUTION_PLAN_V1"
RUN_SCHEMA="BERS_HSME_FOUNDATION_BENCHMARK_CANDIDATE_RUN_V1"
INVENTORY_SCHEMA="BERS_HSME_FOUNDATION_RUNTIME_INVENTORY_V1"
REVIEW_SCHEMA="BERS_HSME_FOUNDATION_BLINDED_REVIEW_PACKAGE_V1"
FAILURE_SCHEMA="BERS_HSME_FOUNDATION_BENCHMARK_FAILURE_EVIDENCE_V1"
RESOURCE_FRAGMENT_SCHEMA="BERS_HSME_FOUNDATION_RESOURCE_MEASUREMENT_FRAGMENT_V1"
HARDWARE_PROFILE_SCHEMA="BERS_HSME_FOUNDATION_RESOURCE_HARDWARE_PROFILE_V1"
MEASUREMENT_METHOD_SCHEMA="BERS_HSME_FOUNDATION_RESOURCE_MEASUREMENT_METHOD_V1"
MEASUREMENT_EVIDENCE_SCHEMA="BERS_HSME_FOUNDATION_RESOURCE_MEASUREMENT_EVIDENCE_V1"
OUTPUT_DOMAIN=b"bers:hsme:foundation-benchmark-output-set:v1\0"


class RunnerError(RuntimeError):
    pass


def stable_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2, separators=(",", ": ")) + "\n").encode("utf-8")


def write_json(path: pathlib.Path, value: Any) -> str:
    payload=stable_bytes(value)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    return hashlib.sha256(payload).hexdigest()


def sha256_stable(value: Any) -> str:
    return hashlib.sha256(stable_bytes(value)).hexdigest()


def validate_cost_inputs(kind: str,cost_raw: Any,evidence_sha256: str) -> tuple[str,int,str]:
    if kind not in ("MEASURED_METERED","PROVEN_UNMETERED_LOCAL"):
        raise RunnerError("resource cost kind invalid")
    text=str(cost_raw)
    if not text.isdigit():
        raise RunnerError("accepted output cost must be a non-negative integer microusd")
    cost=int(text)
    if cost>9_007_199_254_740_991:
        raise RunnerError("accepted output cost exceeds safe integer range")
    if len(evidence_sha256)!=64 or any(ch not in "0123456789abcdef" for ch in evidence_sha256):
        raise RunnerError("cost evidence sha256 must be lowercase SHA-256")
    if kind=="PROVEN_UNMETERED_LOCAL" and cost!=0:
        raise RunnerError("PROVEN_UNMETERED_LOCAL requires zero microusd")
    if kind=="MEASURED_METERED" and cost<1:
        raise RunnerError("MEASURED_METERED requires positive microusd")
    return kind,cost,evidence_sha256


def median_half_up(values: list[int]) -> int:
    if not values:
        raise RunnerError("warm latency sample set must not be empty")
    ordered=sorted(values)
    mid=len(ordered)//2
    if len(ordered)%2:
        return ordered[mid]
    return (ordered[mid-1]+ordered[mid]+1)//2


def ns_to_positive_micros(elapsed_ns: int) -> int:
    if elapsed_ns<=0:
        raise RunnerError("non-positive timing sample")
    return max(1,(elapsed_ns+999)//1000)


def nvidia_driver_version() -> str:
    try:
        output=subprocess.check_output(
            ["nvidia-smi","--query-gpu=driver_version","--format=csv,noheader,nounits"],
            text=True,
            timeout=10,
        )
    except Exception as exc:
        raise RunnerError("unable to query NVIDIA driver version") from exc
    versions={line.strip() for line in output.splitlines() if line.strip()}
    if len(versions)!=1:
        raise RunnerError("NVIDIA driver version must be present and identical across visible GPUs")
    version=next(iter(versions))
    if len(version)>64 or any(ord(ch)<32 or ord(ch)==127 for ch in version):
        raise RunnerError("invalid NVIDIA driver version")
    return version


def hardware_profile(torch) -> dict[str,Any]:
    device=int(torch.cuda.current_device())
    props=torch.cuda.get_device_properties(device)
    major,minor=torch.cuda.get_device_capability(device)
    return {
        "schemaVersion":HARDWARE_PROFILE_SCHEMA,
        "deviceIndex":device,
        "gpuName":str(props.name),
        "computeCapabilityMajor":int(major),
        "computeCapabilityMinor":int(minor),
        "totalMemoryBytes":int(props.total_memory),
        "nvidiaDriverVersion":nvidia_driver_version(),
        "torchVersion":str(torch.__version__),
        "torchCudaVersion":str(torch.version.cuda or "UNKNOWN"),
        "workingMemoryKind":"CUDA_PEAK_RESERVED_BYTES",
    }


def measurement_method() -> dict[str,Any]:
    return {
        "schemaVersion":MEASUREMENT_METHOD_SCHEMA,
        "clock":"PYTHON_TIME_PERF_COUNTER_NS",
        "cudaSynchronization":"BEFORE_AND_AFTER_TIMED_INFERENCE",
        "coldLatencyDefinition":"PIPELINE_LOAD_PLUS_FIRST_FROZEN_INFERENCE",
        "warmLatencyDefinition":"FROZEN_INFERENCE_AFTER_PIPELINE_LOAD",
        "warmAggregation":"MEDIAN_EVEN_ARITHMETIC_MEAN_HALF_UP",
        "nanosecondsToMicroseconds":"POSITIVE_CEILING",
        "workingMemoryKind":"CUDA_PEAK_RESERVED_BYTES",
        "workingMemoryMetric":"TORCH_CUDA_MAX_MEMORY_RESERVED",
        "artifactAcquisitionIncludedInLatency":False,
        "pngEncodingIncludedInLatency":False,
        "reviewPackageReceivesResourceMetadata":False,
    }


def sha256_file(path: pathlib.Path) -> tuple[str,int]:
    h=hashlib.sha256()
    size=0
    with path.open("rb") as handle:
        while True:
            chunk=handle.read(1024*1024)
            if not chunk:
                break
            h.update(chunk)
            size+=len(chunk)
    return h.hexdigest(),size


def safe_rel(value: str) -> pathlib.PurePosixPath:
    p=pathlib.PurePosixPath(value)
    if p.is_absolute() or not p.parts or any(part in ("",".","..") for part in p.parts):
        raise RunnerError("unsafe relative path: "+repr(value))
    return p


def validate_plan(plan: dict[str,Any]) -> None:
    if plan.get("schemaVersion")!=PLAN_SCHEMA:
        raise RunnerError("execution plan schema mismatch")
    if plan.get("disposition")!="EXECUTE":
        raise RunnerError("runner accepts EXECUTE plans only")
    for field in (
        "ordinaryCiModelExecutionAllowed","productionAuthorityGranted","providerAuthorityGranted",
        "billingAuthorityGranted","projectArtifactMutationAllowed","aeeExecutionAuthorityGranted",
        "durableModelFleetPromotionAllowed","trainingOrDistillationAllowed","winnerSelectionAllowed",
    ):
        if plan.get(field) is not False:
            raise RunnerError(field+" must remain false")
    profile=plan.get("executionProfile") or {}
    if profile.get("state")!="PINNED" or profile.get("remoteCodePolicy")!="NO_MODEL_REPOSITORY_RUNTIME_CODE":
        raise RunnerError("PINNED no-remote-code profile required")
    if not plan.get("runtimeArtifacts"):
        raise RunnerError("EXECUTE plan has no runtime artifacts")
    if not plan.get("fixtures") or not plan.get("requiredSeeds"):
        raise RunnerError("EXECUTE plan missing frozen fixtures/seeds")


def validate_runtime_versions(plan: dict[str,Any]) -> None:
    lock=plan["runtimeLock"]
    actual_python=f"{sys.version_info.major}.{sys.version_info.minor}"
    if actual_python!=str(lock["python"]):
        raise RunnerError(f"python mismatch actual={actual_python} expected={lock['python']}")
    for package,expected in lock["packages"].items():
        try:
            actual=importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError as exc:
            raise RunnerError("required package missing: "+package) from exc
        if actual!=expected:
            raise RunnerError(f"package mismatch {package}: actual={actual} expected={expected}")


def copy_verified(source: pathlib.Path,destination: pathlib.Path,expected_sha: str,expected_bytes: int) -> None:
    destination.parent.mkdir(parents=True,exist_ok=True)
    if destination.exists() or destination.is_symlink():
        raise RunnerError("sealed destination already exists: "+str(destination))
    h=hashlib.sha256()
    count=0
    with source.open("rb") as src,destination.open("xb") as dst:
        while True:
            chunk=src.read(1024*1024)
            if not chunk:
                break
            h.update(chunk)
            count+=len(chunk)
            dst.write(chunk)
    digest=h.hexdigest()
    if destination.is_symlink() or not destination.is_file() or digest!=expected_sha or count!=expected_bytes:
        destination.unlink(missing_ok=True)
        raise RunnerError(f"runtime artifact mismatch {destination} bytes={count}/{expected_bytes} sha={digest}/{expected_sha}")


def acquire_runtime(plan: dict[str,Any],model_root: pathlib.Path) -> dict[str,Any]:
    from huggingface_hub import hf_hub_download

    model_root.mkdir(parents=True,exist_ok=False)
    observed=[]
    for artifact in sorted(plan["runtimeArtifacts"],key=lambda x:x["relativePath"]):
        if artifact["role"]=="RUNTIME_CODE":
            raise RunnerError("model repository runtime code is forbidden")
        rel=safe_rel(artifact["relativePath"])
        cached=pathlib.Path(hf_hub_download(
            repo_id=artifact["sourceRoot"],
            revision=artifact["immutableRevision"],
            filename=artifact["relativePath"],
        ))
        destination=model_root.joinpath(*rel.parts)
        copy_verified(cached,destination,artifact["contentSha256"],artifact["bytes"])
        observed.append({
            "relativePath":artifact["relativePath"],
            "bytes":artifact["bytes"],
            "contentSha256":artifact["contentSha256"],
        })
    return {
        "schemaVersion":INVENTORY_SCHEMA,
        "candidateId":plan["candidateId"],
        "immutableRevision":plan["immutableRevision"],
        "complete":True,
        "artifacts":observed,
    }


def partial_inventory(plan: dict[str,Any],model_root: pathlib.Path) -> dict[str,Any]:
    expected={x["relativePath"]:x for x in plan.get("runtimeArtifacts",[])}
    observed=[]
    if model_root.exists():
        for rel,item in sorted(expected.items()):
            p=model_root.joinpath(*safe_rel(rel).parts)
            if not p.is_file() or p.is_symlink():
                continue
            digest,size=sha256_file(p)
            if digest==item["contentSha256"] and size==item["bytes"]:
                observed.append({"relativePath":rel,"bytes":size,"contentSha256":digest})
    return {
        "schemaVersion":INVENTORY_SCHEMA,
        "candidateId":plan["candidateId"],
        "immutableRevision":plan["immutableRevision"],
        "complete":False,
        "artifacts":observed,
    }


def require_cuda(plan: dict[str,Any]):
    import torch
    if not torch.cuda.is_available():
        raise RunnerError("CUDA required by frozen benchmark profile")
    major,minor=torch.cuda.get_device_capability()
    backend=plan["executionProfile"]["hardwareBackendClass"]
    if "SM80_PLUS" in backend and (major,minor)<(8,0):
        raise RunnerError(f"CUDA capability {major}.{minor} does not satisfy SM80+ profile")
    return torch


def load_pipeline(plan: dict[str,Any],model_root: pathlib.Path,torch=None):
    if torch is None:
        torch=require_cuda(plan)
    diffusers=importlib.import_module("diffusers")
    pipeline_class=plan["executionProfile"]["pipelineClass"]
    try:
        cls=getattr(diffusers,pipeline_class)
    except AttributeError as exc:
        raise RunnerError("pinned pipeline class unavailable: "+pipeline_class) from exc
    precision=plan["executionProfile"]["precisionPolicy"]
    dtype=torch.float16 if precision.startswith("FP16_") else torch.bfloat16
    pipe=cls.from_pretrained(str(model_root),torch_dtype=dtype,local_files_only=True)
    if plan["candidateId"]=="tiny-sd-control-v1":
        scheduler_cls=getattr(diffusers,"DPMSolverMultistepScheduler")
        pipe.scheduler=scheduler_cls.from_config(
            pipe.scheduler.config,algorithm_type="dpmsolver++",solver_order=2,solver_type="midpoint"
        )
    return pipe.to("cuda"),torch


def load_rgb_reference(repo_root: pathlib.Path,relative_path: str):
    from PIL import Image,ImageOps
    path=repo_root/"tests/fixtures/hsme-foundation-generated-editing-v1"/relative_path
    image=Image.open(path)
    image=ImageOps.exif_transpose(image)
    return image.convert("RGB")


def verify_fixture_references(plan: dict[str,Any],repo_root: pathlib.Path) -> None:
    base=repo_root/"tests/fixtures/hsme-foundation-generated-editing-v1"
    seen={}
    for fixture in plan["fixtures"]:
        for ref in fixture["references"]:
            rel=safe_rel(ref["relativePath"])
            path=base.joinpath(*rel.parts)
            if not path.is_file() or path.is_symlink():
                raise RunnerError("fixture reference missing or symlinked: "+ref["relativePath"])
            digest,_=sha256_file(path)
            if digest!=ref["contentSha256"]:
                raise RunnerError("fixture reference digest mismatch: "+ref["relativePath"])
            prior=seen.setdefault(ref["relativePath"],digest)
            if prior!=digest:
                raise RunnerError("fixture reference changed during run")


def flux_resize(pipe,image,spec: dict[str,Any]):
    policy=spec["resolutionAspect"]["imageEditing"]
    if policy.get("longEdge")!=1024 or policy.get("multiple")!=8 or policy.get("aspectPolicy")!="PRESERVE_INPUT":
        raise RunnerError("FLUX editing resize policy drift")
    w,h=image.size
    scale=1024.0/max(w,h)
    tw=max(8,int(round((w*scale)/8.0))*8)
    th=max(8,int(round((h*scale)/8.0))*8)
    if w>=h:
        tw=1024
    else:
        th=1024
    return pipe.image_processor.resize(image,height=th,width=tw)


def execute_one(pipe,torch,plan: dict[str,Any],fixture: dict[str,Any],seed: int,repo_root: pathlib.Path):
    candidate=plan["candidateId"]
    capability=plan["capability"]
    spec=plan["sourceSpec"]
    generator=torch.Generator(device="cuda").manual_seed(seed)

    if candidate=="tiny-sd-control-v1":
        if capability!="TEXT_TO_IMAGE":
            raise RunnerError("Tiny-SD adapter supports T2I only")
        r=spec["resolutionAspect"]["textToImage"]
        return pipe(
            prompt=fixture["prompt"],negative_prompt="",num_inference_steps=spec["stepCount"],
            guidance_scale=spec["guidance"]["guidanceScale"],width=r["width"],height=r["height"],generator=generator
        ).images[0]

    if candidate.startswith("flux2-klein-"):
        guidance=spec["guidance"]["guidanceScale"]
        if capability=="TEXT_TO_IMAGE":
            r=spec["resolutionAspect"]["textToImage"]
            return pipe(image=None,prompt=fixture["prompt"],height=r["height"],width=r["width"],
                        num_inference_steps=spec["stepCount"],guidance_scale=guidance,generator=generator).images[0]
        refs=[flux_resize(pipe,load_rgb_reference(repo_root,x["relativePath"]),spec) for x in fixture["references"]]
        w,h=refs[0].size
        return pipe(image=refs,prompt=fixture["instruction"],height=h,width=w,
                    num_inference_steps=spec["stepCount"],guidance_scale=guidance,generator=generator).images[0]

    if candidate=="qwen-image-t2i-reference-v1":
        if capability!="TEXT_TO_IMAGE":
            raise RunnerError("Qwen T2I adapter supports T2I only")
        r=spec["resolutionAspect"]["textToImage"]
        return pipe(
            prompt=fixture["prompt"],negative_prompt=" ",true_cfg_scale=spec["guidance"]["trueCfgScale"],
            guidance_scale=spec["guidance"]["guidanceScale"],height=r["defaultHeight"],width=r["defaultWidth"],
            num_inference_steps=spec["stepCount"],generator=generator
        ).images[0]

    if candidate=="qwen-image-edit-2511-reference-v1":
        if capability!="IMAGE_EDITING":
            raise RunnerError("Qwen Edit adapter supports editing only")
        refs=[load_rgb_reference(repo_root,x["relativePath"]) for x in fixture["references"]]
        return pipe(
            image=refs,prompt=fixture["instruction"],negative_prompt=" ",
            true_cfg_scale=spec["guidance"]["trueCfgScale"],guidance_scale=spec["guidance"]["guidanceScale"],
            num_inference_steps=spec["stepCount"],generator=generator
        ).images[0]

    if candidate=="sana-sprint-0.6b-split-v1":
        if capability!="TEXT_TO_IMAGE" or not plan.get("sanaParity",{}).get("exactParityAccepted"):
            raise RunnerError("SANA reference execution requires accepted exact parity binding")
        r=spec["resolutionAspect"]["textToImage"]
        return pipe(
            prompt=fixture["prompt"],num_inference_steps=spec["stepCount"],
            guidance_scale=spec["guidance"]["guidanceScale"],height=r["height"],width=r["width"],generator=generator
        ).images[0]

    raise RunnerError("no adapter for candidate "+candidate)


def blind_id(plan: dict[str,Any],fixture_id: str,seed: int,key: bytes) -> str:
    message="\0".join([plan["campaignId"],plan["candidateId"],plan["capability"],fixture_id,str(seed)]).encode("utf-8")
    return "blind_"+hmac.new(key,message,hashlib.sha256).hexdigest()[:24]


def png_bytes(image) -> bytes:
    # PIL output is used only as a deterministic transport encoding for review/evidence.
    import io
    buffer=io.BytesIO()
    image.save(buffer,format="PNG",optimize=False,compress_level=9)
    return buffer.getvalue()


def output_set_digest(outputs: list[dict[str,Any]]) -> str:
    normalized=[{
        "fixtureId":x["fixtureId"],"seed":x["seed"],"blindId":x["blindId"],"imageSha256":x["imageSha256"]
    } for x in sorted(outputs,key=lambda x:(x["fixtureId"],x["seed"],x["blindId"]))]
    payload=json.dumps(normalized,ensure_ascii=False,separators=(",",":")).encode("utf-8")
    return hashlib.sha256(OUTPUT_DOMAIN+payload).hexdigest()


def execute(plan: dict[str,Any],repo_root: pathlib.Path,model_root: pathlib.Path,review_dir: pathlib.Path,key: bytes):
    validate_plan(plan)
    validate_runtime_versions(plan)
    verify_fixture_references(plan,repo_root)
    inventory=acquire_runtime(plan,model_root)
    tasks=[(fixture,seed) for fixture in plan["fixtures"] for seed in plan["requiredSeeds"]]
    if len(tasks)<2:
        raise RunnerError("resource measurement requires at least two frozen outputs for cold/warm evidence")

    torch=require_cuda(plan)
    torch.cuda.synchronize()
    torch.cuda.empty_cache()
    torch.cuda.reset_peak_memory_stats()
    method=measurement_method()
    hardware=hardware_profile(torch)
    cold_start=time.perf_counter_ns()
    pipe,_=load_pipeline(plan,model_root,torch)
    outputs=[]
    review_outputs=[]
    warm_samples=[]
    review_dir.mkdir(parents=True,exist_ok=False)

    def capture(fixture: dict[str,Any],seed: int):
        image=execute_one(pipe,torch,plan,fixture,seed,repo_root)
        encoded=png_bytes(image)
        image_sha=hashlib.sha256(encoded).hexdigest()
        opaque=blind_id(plan,fixture["fixtureId"],seed,key)
        rel=opaque+".png"
        (review_dir/rel).write_bytes(encoded)
        outputs.append({"fixtureId":fixture["fixtureId"],"seed":seed,"blindId":opaque,"imageSha256":image_sha})
        review_outputs.append({"fixtureId":fixture["fixtureId"],"seed":seed,"blindId":opaque,"imageSha256":image_sha,"relativePath":rel})

    try:
        first_fixture,first_seed=tasks[0]
        image=execute_one(pipe,torch,plan,first_fixture,first_seed,repo_root)
        torch.cuda.synchronize()
        cold_latency=ns_to_positive_micros(time.perf_counter_ns()-cold_start)
        encoded=png_bytes(image)
        image_sha=hashlib.sha256(encoded).hexdigest()
        opaque=blind_id(plan,first_fixture["fixtureId"],first_seed,key)
        rel=opaque+".png"
        (review_dir/rel).write_bytes(encoded)
        outputs.append({"fixtureId":first_fixture["fixtureId"],"seed":first_seed,"blindId":opaque,"imageSha256":image_sha})
        review_outputs.append({"fixtureId":first_fixture["fixtureId"],"seed":first_seed,"blindId":opaque,"imageSha256":image_sha,"relativePath":rel})

        for fixture,seed in tasks[1:]:
            torch.cuda.synchronize()
            started=time.perf_counter_ns()
            image=execute_one(pipe,torch,plan,fixture,seed,repo_root)
            torch.cuda.synchronize()
            warm_samples.append(ns_to_positive_micros(time.perf_counter_ns()-started))
            encoded=png_bytes(image)
            image_sha=hashlib.sha256(encoded).hexdigest()
            opaque=blind_id(plan,fixture["fixtureId"],seed,key)
            rel=opaque+".png"
            (review_dir/rel).write_bytes(encoded)
            outputs.append({"fixtureId":fixture["fixtureId"],"seed":seed,"blindId":opaque,"imageSha256":image_sha})
            review_outputs.append({"fixtureId":fixture["fixtureId"],"seed":seed,"blindId":opaque,"imageSha256":image_sha,"relativePath":rel})

        peak_working_memory=int(torch.cuda.max_memory_reserved())
        if peak_working_memory<1:
            raise RunnerError("CUDA peak reserved memory must be positive")
    finally:
        del pipe
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    outputs.sort(key=lambda x:(x["fixtureId"],x["seed"],x["blindId"]))
    review_outputs.sort(key=lambda x:(x["fixtureId"],x["seed"],x["blindId"]))
    expected=len(tasks)
    if len(outputs)!=expected:
        raise RunnerError(f"output cardinality mismatch {len(outputs)}/{expected}")
    warm_latency=median_half_up(warm_samples)
    review={
        "schemaVersion":REVIEW_SCHEMA,
        "campaignId":plan["campaignId"],
        "capability":plan["capability"],
        "outputs":review_outputs,
        "candidateIdentityIncluded":False,
        "latencyIncluded":False,
        "sizeIncluded":False,
        "costIncluded":False,
    }
    measurement={
        "hardwareProfile":hardware,
        "measurementMethod":method,
        "coldEndToEndLatencyMicros":cold_latency,
        "warmEndToEndLatencyMicros":warm_latency,
        "warmLatencySamplesMicros":warm_samples,
        "peakWorkingMemoryBytes":peak_working_memory,
    }
    return inventory,outputs,review,measurement

def main() -> int:
    parser=argparse.ArgumentParser()
    parser.add_argument("--plan",required=True)
    parser.add_argument("--repo-root",required=True)
    parser.add_argument("--model-root",required=True)
    parser.add_argument("--cache-root",required=True)
    parser.add_argument("--review-dir",required=True)
    parser.add_argument("--run-out",required=True)
    parser.add_argument("--inventory-out",required=True)
    parser.add_argument("--review-package-out",required=True)
    parser.add_argument("--failure-out",required=True)
    parser.add_argument("--resource-out",required=True)
    parser.add_argument("--hardware-profile-out",required=True)
    parser.add_argument("--measurement-method-out",required=True)
    parser.add_argument("--measurement-evidence-out",required=True)
    parser.add_argument("--cost-kind",required=True)
    parser.add_argument("--accepted-output-cost-microusd",required=True)
    parser.add_argument("--cost-evidence-sha256",required=True)
    args=parser.parse_args()

    plan=json.load(open(args.plan,encoding="utf-8"))
    repo_root=pathlib.Path(args.repo_root).resolve()
    model_root=pathlib.Path(args.model_root).resolve()
    cache_root=pathlib.Path(args.cache_root).resolve()
    review_dir=pathlib.Path(args.review_dir).resolve()
    run_out=pathlib.Path(args.run_out)
    inventory_out=pathlib.Path(args.inventory_out)
    review_out=pathlib.Path(args.review_package_out)
    failure_out=pathlib.Path(args.failure_out)
    resource_out=pathlib.Path(args.resource_out)
    hardware_profile_out=pathlib.Path(args.hardware_profile_out)
    measurement_method_out=pathlib.Path(args.measurement_method_out)
    measurement_evidence_out=pathlib.Path(args.measurement_evidence_out)
    key_text=os.environ.get("HSME_FOUNDATION_BLIND_HMAC_KEY","")
    if len(key_text)<32:
        raise RunnerError("HSME_FOUNDATION_BLIND_HMAC_KEY must contain at least 32 characters")
    key=key_text.encode("utf-8")
    try:
        cost_kind,cost_microusd,cost_evidence_sha=validate_cost_inputs(
            args.cost_kind,args.accepted_output_cost_microusd,args.cost_evidence_sha256
        )
        inventory,outputs,review,measurement=execute(plan,repo_root,model_root,review_dir,key)
        inventory_sha=write_json(inventory_out,inventory)
        review_sha=write_json(review_out,review)
        run={
            "candidateId":plan["candidateId"],"capability":plan["capability"],"status":"COMPLETE",
            "immutableRevision":plan["immutableRevision"],"modelContentSha256":plan["modelContentSha256"],
            "executionProfileSha256":plan["executionProfileSha256"],"rightsEvidenceSha256":plan["rightsEvidenceSha256"],
            "runtimeInventorySha256":inventory_sha,"outputSetSha256":output_set_digest(outputs),
            "reviewPackageSha256":review_sha,"failureEvidenceSha256":"UNKNOWN","outputs":outputs,
        }
        write_json(run_out,run)
        hardware=measurement["hardwareProfile"]
        method=measurement["measurementMethod"]
        hardware_sha=write_json(hardware_profile_out,hardware)
        method_sha=write_json(measurement_method_out,method)
        measurement_evidence={
            "schemaVersion":MEASUREMENT_EVIDENCE_SCHEMA,
            "candidateId":plan["candidateId"],
            "capability":plan["capability"],
            "runtimeInventorySha256":inventory_sha,
            "hardwareProfileSha256":hardware_sha,
            "measurementMethodSha256":method_sha,
            "workingMemoryKind":"CUDA_PEAK_RESERVED_BYTES",
            "peakWorkingMemoryBytes":measurement["peakWorkingMemoryBytes"],
            "coldEndToEndLatencyMicros":measurement["coldEndToEndLatencyMicros"],
            "warmEndToEndLatencyMicros":measurement["warmEndToEndLatencyMicros"],
            "warmLatencySamplesMicros":measurement["warmLatencySamplesMicros"],
            "acceptedOutputCostMicrousd":cost_microusd,
            "costKind":cost_kind,
            "costEvidenceSha256":cost_evidence_sha,
            "productionAuthorityGranted":False,
            "winnerSelectionAllowed":False,
        }
        measurement_sha=write_json(measurement_evidence_out,measurement_evidence)
        resource_fragment={
            "schemaVersion":RESOURCE_FRAGMENT_SCHEMA,
            "campaignId":plan["campaignId"],
            "record":{
                "candidateId":plan["candidateId"],
                "capability":plan["capability"],
                "immutableRevision":plan["immutableRevision"],
                "modelContentSha256":plan["modelContentSha256"],
                "executionProfileSha256":plan["executionProfileSha256"],
                "runtimeInventory":inventory,
                "hardwareProfileSha256":hardware_sha,
                "measurementMethodSha256":method_sha,
                "workingMemoryKind":"CUDA_PEAK_RESERVED_BYTES",
                "peakWorkingMemoryBytes":measurement["peakWorkingMemoryBytes"],
                "coldEndToEndLatencyMicros":measurement["coldEndToEndLatencyMicros"],
                "warmEndToEndLatencyMicros":measurement["warmEndToEndLatencyMicros"],
                "acceptedOutputCostMicrousd":cost_microusd,
                "costKind":cost_kind,
                "costEvidenceSha256":cost_evidence_sha,
                "measurementEvidenceSha256":measurement_sha,
            },
            "productionAuthorityGranted":False,
            "winnerSelectionAllowed":False,
        }
        write_json(resource_out,resource_fragment)
        return 0
    except Exception as exc:
        for transient in (resource_out,hardware_profile_out,measurement_method_out,measurement_evidence_out):
            transient.unlink(missing_ok=True)
        inventory=partial_inventory(plan,model_root)
        inventory_sha=write_json(inventory_out,inventory)
        failure={
            "schemaVersion":FAILURE_SCHEMA,
            "candidateId":plan.get("candidateId","UNKNOWN"),"capability":plan.get("capability","UNKNOWN"),
            "errorType":type(exc).__name__,"errorMessage":str(exc)[:2000],
            "tracebackSha256":hashlib.sha256(traceback.format_exc().encode("utf-8")).hexdigest(),
            "productionAuthorityGranted":False,"winnerSelectionAllowed":False,
        }
        failure_sha=write_json(failure_out,failure)
        run={
            "candidateId":plan["candidateId"],"capability":plan["capability"],"status":"FAILED",
            "immutableRevision":plan["immutableRevision"],"modelContentSha256":plan["modelContentSha256"],
            "executionProfileSha256":plan["executionProfileSha256"],"rightsEvidenceSha256":plan["rightsEvidenceSha256"],
            "runtimeInventorySha256":inventory_sha,"outputSetSha256":"UNKNOWN","reviewPackageSha256":"UNKNOWN",
            "failureEvidenceSha256":failure_sha,"outputs":[],
        }
        write_json(run_out,run)
        return 1
    finally:
        shutil.rmtree(model_root,ignore_errors=True)
        shutil.rmtree(cache_root,ignore_errors=True)


if __name__=="__main__":
    import os
    raise SystemExit(main())
