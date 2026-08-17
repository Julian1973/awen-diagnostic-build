#!/usr/bin/env python3
"""test_domain.py — the production rules, tested without a database or a network.

    python3 studio/test_domain.py

Each test names the incident it protects. If one of these ever goes red, a shot
that cost real money to discover is about to be shot again.
"""
from __future__ import annotations
import json, pathlib, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import domain

REG = json.loads((pathlib.Path(__file__).resolve().parent / "providers.json").read_text())
PASS, FAIL = [], []


def check(name: str, cond: bool, why: str = "") -> None:
    (PASS if cond else FAIL).append(name)
    print(f"  {'✓' if cond else '✗'} {name}" + (f"\n      {why}" if not cond and why else ""))


def stack_of(video: str, lipsync: str = "sync-v2") -> dict:
    return domain.resolve_stack(REG, {**REG["house"], "video": video, "lipsync": lipsync})


BASE = dict(boards=[{"name": "style", "decision": "approved"}],
            settings={"audit_floor": 9.5})


# ── capability derivation ───────────────────────────────────────────────────
print("\ncapability drives behaviour, not configuration")

d = domain.derive(stack_of("minimax-h3-ref"))
check("a route that invents speech keeps dialogue OUT of the prompt",
      d["prompt_carries_dialogue"] is False)
check("a composing route must be told to reproduce the frame",
      d["must_assert_composition"] is True)
check("a lipsync route with no face selector demands a speaker box",
      d["needs_speaker_box_when_multi_face"] is True)

d2 = domain.derive(stack_of("minimax-h3-i2v"))
check("a literal-first-frame route need not assert composition",
      d2["must_assert_composition"] is False)
check("its reference ceiling follows the route, not the house",
      d2["refs_max"] == 1 and d["refs_max"] == 8)


# ── the gates ───────────────────────────────────────────────────────────────
print("\nthe gates refuse")

g = domain.evaluate_gates(
    shot={"code": "S1", "speaker": "tom", "seconds": 9},
    assets=[{"tag": "tom", "type": "character", "status": "draft"}],
    prompt={"hash": "H"}, audits=[{"hash": "H", "score": 9.7}],
    stack=stack_of("minimax-h3-ref"), **BASE)
by = {x["id"]: x for x in g}
check("B refuses a draft asset", by["B"]["passed"] is False)
check("B names it", "tom" in by["B"]["detail"])
check("B carries a machine code", by["B"]["code"] == "LOCKED_ASSETS_REQUIRED")

# THE ONE THAT COST A TAKE: a prompt rewritten after its audit
g = domain.evaluate_gates(
    shot={"code": "S1", "seconds": 9},
    assets=[{"tag": "tom", "type": "character", "status": "locked"}],
    prompt={"hash": "NEWHASH"}, audits=[{"hash": "OLDHASH", "score": 9.7}],
    stack=stack_of("minimax-h3-ref"), **BASE)
by = {x["id"]: x for x in g}
check("C refuses a 9.7 that belongs to a DIFFERENT text",
      by["C"]["passed"] is False,
      "a prompt was once rewritten materially and fired on the audit of the version before it")
check("C says the text has no round of its own",
      "no round of its own" in by["C"]["detail"])

# THE ONE THAT PUT A LINE ON THE WRONG MOUTH
g = domain.evaluate_gates(
    shot={"code": "S1", "speaker": "tom", "seconds": 9},
    assets=[{"tag": "tom", "type": "character", "status": "locked"},
            {"tag": "rich", "type": "character", "status": "locked"}],
    prompt={"hash": "H"}, audits=[{"hash": "H", "score": 9.7}],
    stack=stack_of("minimax-h3-ref"), **BASE)
by = {x["id"]: x for x in g}
check("D refuses two faces, a line and no box", by["D"]["passed"] is False)

g = domain.evaluate_gates(
    shot={"code": "S1", "speaker": "tom", "seconds": 9, "speaker_box": [0, 0, 1, 1]},
    assets=[{"tag": "tom", "type": "character", "status": "locked"},
            {"tag": "rich", "type": "character", "status": "locked"}],
    prompt={"hash": "H"}, audits=[{"hash": "H", "score": 9.7}],
    stack=stack_of("minimax-h3-ref"), **BASE)
by = {x["id"]: x for x in g}
check("D passes once the speaker is boxed", by["D"]["passed"] is True)
check("and every other gate is clear, so the shot fires", by == by and
      all(x["passed"] for x in g))

# a single face needs no box — the rule must not over-fire
g = domain.evaluate_gates(
    shot={"code": "S1", "speaker": "tom", "seconds": 9},
    assets=[{"tag": "tom", "type": "character", "status": "locked"}],
    prompt={"hash": "H"}, audits=[{"hash": "H", "score": 9.7}],
    stack=stack_of("minimax-h3-ref"), **BASE)
check("D does not demand a box on a single", {x["id"]: x for x in g}["D"]["passed"] is True)

# the reference budget is the ROUTE's, not a preference
g = domain.evaluate_gates(
    shot={"code": "S1", "seconds": 9},
    assets=[{"tag": f"a{i}", "type": "character", "status": "locked"} for i in range(9)],
    prompt={"hash": "H"}, audits=[{"hash": "H", "score": 9.7}],
    stack=stack_of("minimax-h3-ref"), **BASE)
check("E refuses a reference set over the route's ceiling",
      {x["id"]: x for x in g}["E"]["passed"] is False)

g = domain.evaluate_gates(
    shot={"code": "S1", "seconds": 30},
    assets=[{"tag": "tom", "type": "character", "status": "locked"}],
    prompt={"hash": "H"}, audits=[{"hash": "H", "score": 9.7}],
    stack=stack_of("minimax-h3-ref"), **BASE)
check("F refuses 30s on a route that stops at 15",
      {x["id"]: x for x in g}["F"]["passed"] is False)


# ── the compiler ────────────────────────────────────────────────────────────
print("\nthe compiler")

shot = {"code": "S1", "speaker": "tom", "seconds": 9, "room_scope": "full",
        "frame_source": "keyframe", "keyframe_path": "kf.png",
        "card": {"identity": {"location": "a shop", "description": "Tom speaks.",
                              "dialogue": "Are you Mr Thistlewood?"}}}
assets = [{"tag": "tom", "type": "character", "name": "Tom", "status": "locked",
           "descriptor": "navy parka", "hero_path": "tom.jpg"},
          {"tag": "rich", "type": "character", "name": "Richard", "status": "locked",
           "descriptor": "white beard", "hero_path": "rich.jpg"}]

out = domain.compile_prompt(shot=shot, assets=assets, project={},
                            stack=stack_of("minimax-h3-ref"))
check("no dialogue words reach a generated-speech route",
      "Are you Mr Thistlewood" not in out["text"],
      "H3 animates the mouth to what it invents; our recording can never agree with it")
check("it says WHY, so nobody helpfully puts the line back",
      "replaced from a separate recording" in out["text"])
check("the silent character is closed but not frozen",
      "Richard does not speak" in out["text"] and "never frozen" in out["text"])
check("every reference is told what not to contribute",
      out["text"].count("Do not use its background") >= 2)
check("composition is asserted on a composing route",
      "do not restage it" in out["text"])

out2 = domain.compile_prompt(shot={**shot, "room_scope": "none"}, assets=assets,
                             project={}, stack=stack_of("minimax-h3-ref"))
check("an insert is told the frame never widens",
      "never widens and never pulls back" in out2["text"],
      "a counter-top insert once built a bright kitchen with a window in it")
check("and it is NOT told about the rest of the room",
      "of which this frame shows only what Image 1 already contains" in out2["text"])

out3 = domain.compile_prompt(
    shot={**shot, "frame_source": "chain_cut", "chain_from": "S0"},
    assets=assets, project={}, stack=stack_of("minimax-h3-ref"))
check("a cut carries continuity, explicitly NOT composition",
      "Carry its continuity, not its composition" in out3["text"])

out4 = domain.compile_prompt(
    shot={**shot, "expressions": {"tom": "not smiling, embarrassed"}},
    assets=assets, project={}, stack=stack_of("minimax-h3-ref"))
check("an expression can be directed, because an unstated one becomes 'pleasant'",
      "not smiling, embarrassed" in out4["text"])

check("the hash changes when one word does",
      out["hash"] != out4["hash"])
check("and is stable for identical text",
      domain.prompt_hash(out["text"]) == out["hash"])


# ── iteration policy ────────────────────────────────────────────────────────
print("\niteration policy")

check("a pass proceeds",
      domain.iteration_advice(round_n=1, score=9.7, settings={})["action"] == "proceed")
check("an early fail asks for a correction",
      domain.iteration_advice(round_n=2, score=8.4, settings={})["action"] == "correct")
check("past the simplify point it says the SHOT is wrong, not the words",
      domain.iteration_advice(round_n=9, score=8.4, settings={})["action"] == "simplify")
check("at the cap it blocks the framing entirely",
      domain.iteration_advice(round_n=15, score=8.4, settings={})["action"] == "blocked")


# ── downstream invalidation ─────────────────────────────────────────────────
print("\ndownstream invalidation")

imp = domain.impact(
    asset_tag="tom",
    shots=[{"code": "S1", "asset_tags": ["tom", "rich"]},
           {"code": "S2", "asset_tags": ["rich"]}],
    prompts=[{"shot": "S1", "version": 3, "hash": "H1"},
             {"shot": "S2", "version": 1, "hash": "H2"}],
    jobs=[{"shot": "S1", "attempt": 2}],
    selects=[{"shot": "S1"}])
check("only shots that USE the asset are touched", imp["shots"] == ["S1"])
check("their prompt versions go provisional", imp["prompt_versions"][0]["shot"] == "S1")
check("their audits stop counting", imp["audits_invalidated"] == ["H1"])
check("an accepted take is flagged for re-review", imp["selects_needing_review"] == ["S1"])
check("nothing is deleted", "Nothing is deleted" in imp["rule"])


# ── the stress gate ─────────────────────────────────────────────────────────
print("\nthe stress gate")

check("9 of 10 is a fail",
      domain.stress_verdict(runs=10, passed=9, required=10)["verdict"] == "fail")
check("10 of 10 passes",
      domain.stress_verdict(runs=10, passed=10, required=10)["verdict"] == "pass")
m = domain.stress_matrix(asset={"tag": "tom"}, co_stars=["Richard"], scene_light="amber lamplight")
check("the matrix includes a two-shot beside every co-star", m["two_shots"] == ["Richard"],
      "a character who holds up alone often breaks the moment he shares a frame")
check("and tests in the SCENE's light, not the sheet's", "amber" in m["light"])


print(f"\n  {len(PASS)} passed · {len(FAIL)} failed")
if FAIL:
    print("  FAILED: " + ", ".join(FAIL))
sys.exit(1 if FAIL else 0)
