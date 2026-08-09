# BEAT ENGINE — beat in, AAA Seedance 2.5 prompt out

One job: take an approved beat and deliver a AAA prompt that brings the magic of
the beat through. Structure and pattern enforced by code; your comments on the
outcome boil back into the rules. No LLM writes prompts here.

```
approved direction (shot .json)          ← the Beat-to-Frame contract, typed
        │
        ▼
   COMPILER  (beat_engine.py + grammar_pack.json)   deterministic emission
        │
        ▼
   PREFLIGHT (round-trip: re-parses the prompt, diffs it against the shot file)
        │
        ├── BLOCK → prompt withheld. DO NOT FIRE. Fix the shot file or file a
        │            defect against the compiler.
        └── PASS  → two stamps → fire (Codex wires the render call + keys)
        ▼
   WATCH → verdict good / retake --layer --class "your words"
        │
        ▼
   lessons → repeated failure classes auto-propose grammar-pack rules
             (Julian ratifies → version bump → the excellence boils down)
```

## Commands

```bash
python3 engine/beat_engine.py compile  engine/shots/S1_SH1A.json   # stamped AAA prompt
python3 engine/beat_engine.py payload  engine/shots/S1_SH1A.json   # fire-ready request JSON
python3 engine/beat_engine.py verdict  S1.SH1A good "the button lands"
python3 engine/beat_engine.py verdict  S1.SH1A retake --layer take --class flat_comedy "hold too short"
python3 engine/beat_engine.py lessons                              # the boil-down
python3 engine/beat_engine.py selftest                             # proves the brain catches the sins
```

## The pieces

- **`grammar_pack.json`** — all knowledge as versioned DATA: the canonical style
  paragraph (v1-DRAFT awaiting Julian's sign-off), route envelopes, character
  motion vocabularies + tics, brand blocklist, camera families, farmed
  negatives, canon blocks. The AAA Prompt Standard (docs/AAA_PROMPT_STANDARD.md)
  is its citation source.
- **`beat_engine.py`** — compiler (emission in the AAA block grammar), preflight
  (16 mechanical check families incl. round-trip), verdict loop, selftest.
- **`shots/S1_SH1A.json`** — the golden fixture: Julian's locked spine beats 1-2
  (chase chaos → crash → gymnastic finish → the "Nailed it" button) as a typed
  shot file. This file IS the direction; edit it, recompile, never edit prompts.

## Laws enforced (each check names its law at refusal time)

Identity from references only · voice lives in the render (@Audio1, no quoted
dialogue) · reference scopes (defines-only + ignore, both required) · route
envelope (duration/refs/chars) · one camera policy (family budget 2, vague terms
banned) · no brand names ever · geography ledger required on SEC shots · numeric
holds on comedy buttons ("briefly" is not a duration) · no duplicate action
sentences (the LLM-draft fingerprint) · character motion vocabulary (banned verb
near a name blocks) · canon (bees have no crystal) · music kill-switch present ·
round-trip: timeline stages must tile the exact duration, every stage and the
shot must declare an end state, the style paragraph must appear verbatim.

## Porting to studioai (Codex)

This folder is self-contained Python 3 stdlib — drop `engine/` next to the
existing `dailies/` lane. `payload` emits the fal request shape (roles:
first_frame / reference_image / reference_audio); Codex wires it to `cb_gen`'s
route registry and keys. The dailies verdict commands and this engine's verdict
loop share the same philosophy — merge ledgers when porting.
