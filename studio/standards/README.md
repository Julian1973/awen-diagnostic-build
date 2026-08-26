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

Rule of precedence: engine code > these standards > memory. When a provider
guide changes, the standard and the code move in the same commit, with the
test that proves it.
