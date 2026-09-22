import hashlib
import importlib.util
import pathlib
import tempfile
import types
import unittest
from unittest import mock

ROOT=pathlib.Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location("hsme_foundation_executor",ROOT/"scripts/hsme-foundation-benchmark-executor.py")
runner=importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(runner)


def base_plan(candidate="tiny-sd-control-v1"):
    return {
        "schemaVersion":runner.PLAN_SCHEMA,
        "disposition":"EXECUTE",
        "campaignId":"campaign",
        "candidateId":candidate,
        "capability":"TEXT_TO_IMAGE",
        "immutableRevision":"a"*40,
        "executionProfile":{
            "state":"PINNED",
            "remoteCodePolicy":"NO_MODEL_REPOSITORY_RUNTIME_CODE",
            "hardwareBackendClass":"CUDA_FP16_REFERENCE_GPU",
        },
        "runtimeArtifacts":[
            {
                "relativePath":"model/file.bin",
                "contentSha256":hashlib.sha256(b"abc").hexdigest(),
                "bytes":3,
            }
        ],
        "fixtures":[{"fixtureId":"fixture","references":[]}],
        "requiredSeeds":[1,2],
        "ordinaryCiModelExecutionAllowed":False,
        "productionAuthorityGranted":False,
        "providerAuthorityGranted":False,
        "billingAuthorityGranted":False,
        "projectArtifactMutationAllowed":False,
        "aeeExecutionAuthorityGranted":False,
        "durableModelFleetPromotionAllowed":False,
        "trainingOrDistillationAllowed":False,
        "winnerSelectionAllowed":False,
    }


class ExecutorTests(unittest.TestCase):
    def test_safe_relative_path_rejects_escape(self):
        self.assertEqual(str(runner.safe_rel("a/b.bin")),"a/b.bin")
        for value in ("../x","/tmp/x","a/../x","."):
            with self.assertRaises(runner.RunnerError):
                runner.safe_rel(value)

    def test_plan_authority_is_fail_closed(self):
        plan=base_plan()
        runner.validate_plan(plan)
        plan["winnerSelectionAllowed"]=True
        with self.assertRaises(runner.RunnerError):
            runner.validate_plan(plan)

    def test_blind_id_is_candidate_scoped_and_opaque(self):
        key=b"k"*32
        a=runner.blind_id(base_plan("candidate-a"),"fixture",1,key)
        b=runner.blind_id(base_plan("candidate-b"),"fixture",1,key)
        self.assertRegex(a,r"^blind_[0-9a-f]{24}$")
        self.assertNotEqual(a,b)

    def test_output_digest_is_order_stable_and_contract_shaped(self):
        outputs=[
            {"fixtureId":"b","seed":2,"blindId":"blind_"+"b"*24,"imageSha256":"2"*64},
            {"fixtureId":"a","seed":1,"blindId":"blind_"+"a"*24,"imageSha256":"1"*64},
        ]
        first=runner.output_set_digest(outputs)
        second=runner.output_set_digest(list(reversed(outputs)))
        self.assertEqual(first,second)
        self.assertRegex(first,r"^[0-9a-f]{64}$")

    def test_copy_verified_streams_exact_bytes_without_symlink(self):
        with tempfile.TemporaryDirectory() as td:
            root=pathlib.Path(td)
            source=root/"source.bin"
            dest=root/"sealed"/"file.bin"
            source.write_bytes(b"abc")
            runner.copy_verified(source,dest,hashlib.sha256(b"abc").hexdigest(),3)
            self.assertEqual(dest.read_bytes(),b"abc")
            self.assertFalse(dest.is_symlink())

    def test_copy_verified_removes_mismatch(self):
        with tempfile.TemporaryDirectory() as td:
            root=pathlib.Path(td)
            source=root/"source.bin"
            dest=root/"sealed"/"file.bin"
            source.write_bytes(b"abc")
            with self.assertRaises(runner.RunnerError):
                runner.copy_verified(source,dest,"0"*64,3)
            self.assertFalse(dest.exists())

    def test_partial_inventory_never_claims_complete(self):
        plan=base_plan()
        with tempfile.TemporaryDirectory() as td:
            root=pathlib.Path(td)
            p=root/"model"/"file.bin"
            p.parent.mkdir(parents=True)
            p.write_bytes(b"abc")
            inventory=runner.partial_inventory(plan,root)
            self.assertFalse(inventory["complete"])
            self.assertEqual(len(inventory["artifacts"]),1)

    def test_stable_json_digest_is_reproducible(self):
        with tempfile.TemporaryDirectory() as td:
            path=pathlib.Path(td)/"value.json"
            a=runner.write_json(path,{"a":1,"b":False})
            b=hashlib.sha256(path.read_bytes()).hexdigest()
            self.assertEqual(a,b)


    def test_resource_cost_inputs_are_explicit_and_fail_closed(self):
        self.assertEqual(
            runner.validate_cost_inputs("PROVEN_UNMETERED_LOCAL","0","a"*64),
            ("PROVEN_UNMETERED_LOCAL",0,"a"*64),
        )
        self.assertEqual(
            runner.validate_cost_inputs("MEASURED_METERED","123","b"*64),
            ("MEASURED_METERED",123,"b"*64),
        )
        for kind,cost,digest in (
            ("PROVEN_UNMETERED_LOCAL","1","a"*64),
            ("MEASURED_METERED","0","a"*64),
            ("UNKNOWN","1","a"*64),
            ("MEASURED_METERED","abc","a"*64),
            ("MEASURED_METERED","1","A"*64),
        ):
            with self.assertRaises(runner.RunnerError):
                runner.validate_cost_inputs(kind,cost,digest)

    def test_warm_latency_median_is_integer_half_up(self):
        self.assertEqual(runner.median_half_up([9,1,5]),5)
        self.assertEqual(runner.median_half_up([1,2]),2)
        self.assertEqual(runner.median_half_up([1,2,100,101]),51)
        with self.assertRaises(runner.RunnerError):
            runner.median_half_up([])

    def test_measurement_method_freezes_cuda_latency_and_memory_semantics(self):
        method=runner.measurement_method()
        self.assertEqual(method["coldLatencyDefinition"],"PIPELINE_LOAD_PLUS_FIRST_FROZEN_INFERENCE")
        self.assertEqual(method["warmAggregation"],"MEDIAN_EVEN_ARITHMETIC_MEAN_HALF_UP")
        self.assertEqual(method["workingMemoryKind"],"CUDA_PEAK_RESERVED_BYTES")
        self.assertFalse(method["artifactAcquisitionIncludedInLatency"])
        self.assertFalse(method["pngEncodingIncludedInLatency"])
        self.assertFalse(method["reviewPackageReceivesResourceMetadata"])

    def test_hardware_profile_is_content_addressable_cuda_identity(self):
        class Props:
            name="Synthetic GPU"
            total_memory=12_345
        class Cuda:
            @staticmethod
            def current_device(): return 0
            @staticmethod
            def get_device_properties(device):
                self.assertEqual(device,0)
                return Props()
            @staticmethod
            def get_device_capability(device):
                self.assertEqual(device,0)
                return (8,0)
        fake=types.SimpleNamespace(cuda=Cuda(),__version__="2.0.1+cu118",version=types.SimpleNamespace(cuda="11.8"))
        with mock.patch.object(runner.subprocess,"check_output",return_value="550.54.15\n"):
            profile=runner.hardware_profile(fake)
        self.assertEqual(profile["gpuName"],"Synthetic GPU")
        self.assertEqual(profile["totalMemoryBytes"],12_345)
        self.assertEqual(profile["nvidiaDriverVersion"],"550.54.15")
        self.assertEqual(profile["workingMemoryKind"],"CUDA_PEAK_RESERVED_BYTES")
        self.assertRegex(runner.sha256_stable(profile),r"^[0-9a-f]{64}$")

    def test_driver_version_query_fails_closed_on_inconsistent_visible_gpus(self):
        with mock.patch.object(runner.subprocess,"check_output",return_value="550.54.15\n555.42.02\n"):
            with self.assertRaises(runner.RunnerError):
                runner.nvidia_driver_version()

    def test_cuda_requirement_fails_closed_without_gpu(self):
        fake=types.ModuleType("torch")
        fake.cuda=types.SimpleNamespace(is_available=lambda:False)
        with mock.patch.dict("sys.modules",{"torch":fake}):
            with self.assertRaises(runner.RunnerError):
                runner.require_cuda(base_plan())


if __name__=="__main__":
    unittest.main()
