# Provider standards

Controlled documents translating **official provider documentation** into the
rules this pipeline fires under. One file per provider surface. Each claim is
labelled OFFICIAL / HOUSE / UNVERIFIED so a provider fact is never confused
with a house preference — and nothing unverified is ever presented as a
capability.

| Document | Covers | Enforced by |
|---|---|---|
| `SEEDANCE_25_STANDARD.md` | Seedance 2.5 video: task families, parameter locks, reference limits, stability envelope, binding law, prompt foundation | Gates A–K in `studio/domain.py` |
| `SEEDREAM_50_PRO_STANDARD.md` | Seedream 5.0 Pro images: layer decomposition, interactive editing, derived staging data. **Confidential — repo-internal.** | Gate D input, Gate K verification (planned) |
| `SEEDANCE_FIELD_NOTES.md` | Practitioner evidence, accumulating — each claim tagged ALIGNS / NEW / REFINES against the official standards, with an adoption queue. Everything UNVERIFIED until our own runs confirm | Feeds HOUSE rules and the lessons bank |
| `SEEDANCE_PROMPT_STRUCTURE.md` | The official prompt template, bad-prompt triage, element table, gold video-template anatomy (motion slider, reference weights, per-shot dialogue/SFX), effectiveness playbook, quality policy. 2.0-era structure, provider-endorsed for 2.5; technical numbers defer to the 2.5 standard | Audit loop, compile order, gates C/G/K |
| `SCENE_ENTRY_PREFLIGHT.md` | Cast-before-direction: classify every staged role as named cast or unnamed presence, lock the packs, then direct. The ordering rule and the scene-level stub report | Gate M in `studio/domain.py` |

Rule of precedence: engine code > these standards > memory. When a provider
guide changes, the standard and the code move in the same commit, with the
test that proves it.
