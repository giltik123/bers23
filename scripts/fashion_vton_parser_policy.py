"""Research-only parser routing for a future local FASHN VTON v1.5 adapter.

No production admission, model invocation, artifact storage, or provider authority.
Mirror the published upstream dataflow: maskless person + flat-lay garment
does not consume semantic parsing outputs, although upstream calls its parser.
"""
from dataclasses import dataclass
from typing import Literal


class ParserPolicyRejected(ValueError):
    """The requested VTON parsing route has not been admitted."""


@dataclass(frozen=True)
class ParserPlan:
    person: Literal["NONE"]
    garment: Literal["NONE", "APPROVED_MASK", "ADMITTED_SEMANTIC_PARSER"]
    person_masking_disabled: bool
    garment_masking_disabled: bool


def plan_parser_route(
    *,
    category: str,
    garment_photo_type: str,
    segmentation_free: bool,
    approved_garment_mask: bool = False,
    admitted_semantic_parser: bool = False,
) -> ParserPlan:
    """Choose preprocessor requirements, never a model or trusted artifact.

    Boolean inputs must originate from a future canonical Core capability/
    evidence decision, not from an untrusted browser assertion. A model-worn
    garment requires approved, lineage-bound masking evidence or a separately
    admitted parser. Masked person preprocessing is intentionally unsupported.
    """
    if category not in ("tops", "bottoms", "one-pieces"):
        raise ParserPolicyRejected("unsupported garment category")
    if garment_photo_type not in ("flat-lay", "model"):
        raise ParserPolicyRejected("unsupported garment photo type")
    if type(segmentation_free) is not bool or not segmentation_free:
        raise ParserPolicyRejected("person masked inference is not admitted")
    if type(approved_garment_mask) is not bool or type(admitted_semantic_parser) is not bool:
        raise ParserPolicyRejected("invalid parser evidence flags")

    if garment_photo_type == "flat-lay":
        return ParserPlan(
            person="NONE", garment="NONE",
            person_masking_disabled=True, garment_masking_disabled=True,
        )

    if approved_garment_mask:
        return ParserPlan(
            person="NONE", garment="APPROVED_MASK",
            person_masking_disabled=True, garment_masking_disabled=False,
        )

    if admitted_semantic_parser:
        return ParserPlan(
            person="NONE", garment="ADMITTED_SEMANTIC_PARSER",
            person_masking_disabled=True, garment_masking_disabled=False,
        )

    raise ParserPolicyRejected("model-worn garment needs approved mask or admitted parser")
