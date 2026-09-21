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
import sys
import traceback
import zlib
import struct
from typing import Any

PLAN_SCHEMA="BERS_HSME_FOUNDATION_BENCHMARK_EXECUTION_PLAN_V1"
RUN_SCHEMA="BERS_HSME_FOUNDATION_BENCHMARK_CANDIDATE_RUN_V1"
INVENTORY_SCHEMA="BERS_HSME_FOUNDATION_RUNTIME_INVENTORY_V1"
REVIEW_SCHEMA="BERS_HSME_FOUNDATION_BLINDED_REVIEW_PACKAGE_V1"
FAILURE_SCHEMA="BERS_HSME_FOUNDATION_BENCHMARK_FAILURE_EVIDENCE_V1"
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


def load_pipeline(plan: dict[str,Any],model_root: pathlib.Path):
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
    pipe,torch=load_pipeline(plan,model_root)
    outputs=[]
    review_outputs=[]
    review_dir.mkdir(parents=True,exist_ok=False)
    try:
        for fixture in plan["fixtures"]:
            for seed in plan["requiredSeeds"]:
                image=execute_one(pipe,torch,plan,fixture,seed,repo_root)
                encoded=png_bytes(image)
                image_sha=hashlib.sha256(encoded).hexdigest()
                opaque=blind_id(plan,fixture["fixtureId"],seed,key)
                rel=opaque+".png"
                (review_dir/rel).write_bytes(encoded)
                outputs.append({"fixtureId":fixture["fixtureId"],"seed":seed,"blindId":opaque,"imageSha256":image_sha})
                review_outputs.append({"fixtureId":fixture["fixtureId"],"seed":seed,"blindId":opaque,"imageSha256":image_sha,"relativePath":rel})
    finally:
        del pipe
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    outputs.sort(key=lambda x:(x["fixtureId"],x["seed"],x["blindId"]))
    review_outputs.sort(key=lambda x:(x["fixtureId"],x["seed"],x["blindId"]))
    expected=len(plan["fixtures"])*len(plan["requiredSeeds"])
    if len(outputs)!=expected:
        raise RunnerError(f"output cardinality mismatch {len(outputs)}/{expected}")
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
    return inventory,outputs,review


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
    key_text=os.environ.get("HSME_FOUNDATION_BLIND_HMAC_KEY","")
    if len(key_text)<32:
        raise RunnerError("HSME_FOUNDATION_BLIND_HMAC_KEY must contain at least 32 characters")
    key=key_text.encode("utf-8")
    try:
        inventory,outputs,review=execute(plan,repo_root,model_root,review_dir,key)
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
        return 0
    except Exception as exc:
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
