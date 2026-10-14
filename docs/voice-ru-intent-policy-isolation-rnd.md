# Isolated LOCAL_ONLY Russian voice intent policy — research only

This PR copies **six unmodified original files** from feature Draft #1001
at source SHA `6b17dcce0caf2d9ec2369e25e5b791a1cbd2f33d`:
five pure policy/text modules and the original `voice-ru-eval-v1.test.mjs`
suite. Blob identity must match the source PR for each copied path.

- Capability routing allows a locally verified Russian pack, OS on-device
  recognition or a verified multilingual pack. The policy does not attest
  that such a pack is actually available on a real device.
- Deterministic Russian command and Fashion phrase parsing proposes
  bounded **editable, confirmation-required** intent drafts. It does not
  recognize audio or execute Editor actions.
- Canonical Wardrobe filtering ranks provided local records only, never
  supplies tenant/Project/garment authority or fabricated identities.
- Tests are deterministic text and policy fixtures, **not** microphone,
  recording, ASR accuracy, browser privacy, WER, signed model, network
  egress, human voice accessibility or product acceptance.
- The exact-head workflow runs the original suite, typecheck, build and
  diff hygiene. A green run only validates this isolated software contract.

**No production wiring**: does not import into the active Editor,
does not change `Editor.jsx`, Core, Project, Artifact, VoiceInputPanel,
runtime audio endpoints, model packages, provider routing, payments,
schema, deployment, releases or feature flags. The entire voice UX,
local microphone lifecycle and signed RU language-pack admission in #1001
remain Draft pending independent real-device testing, explicit browser
privacy verification and combined Editor integration with #1003/#1009,
#997/#998. A LOCAL_ONLY label or synthetic test is not proof of
physical on-device processing.

This is inert research content only. Leave #365, Fashion and all
production release gates blocked. A research-only merge requires a
fully successful exact-head CI run, reviewed file diff and compliance
with GitHub branch protection/review rules. Neither a repository merge
nor policy tests attest physical on-device ASR or product readiness.
