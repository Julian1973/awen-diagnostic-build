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
      "Begin by reproducing its exact camera framing" in out["text"])

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
      "It is the continuity authority" in out3["text"]
      and "compose a NEW shot" in out3["text"])

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



# ── the stress RUN: cells, review, staleness ────────────────────────────────
print("\nthe stress run")

cells = domain.stress_cells(
    asset={"tag": "tom", "type": "character", "version": 2, "descriptor": "navy parka"},
    co_stars=["Richard"], scene_lights=["amber lamplight"])
dims = {c["dimension"] for c in cells}
check("a character run covers angle, size, scene light and two-shots",
      {"angle", "shot_size", "scene_light", "two_shot"} <= dims)
check("the rear angle is in it — the view nobody tests and every walk-away shot needs",
      any("rear" in c["id"] for c in cells))
check("every cell is frozen to the asset revision",
      all(c["asset_revision"] == 2 for c in cells))

prop_dims = {c["dimension"] for c in domain.stress_cells(
    asset={"tag": "box", "type": "prop", "version": 1, "descriptor": "walnut box"})}
check("a prop is tested at scale WITH its character and in the held state",
      {"scale_with_character", "held_state"} <= prop_dims)

reviews_all = {c["id"]: {"passed": True} for c in cells}
check("a fully passed run of enough cells locks",
      domain.stress_run_verdict(cells=cells, reviews=reviews_all,
                                asset_revision=2, required=10)["verdict"] == "pass")
check("an unreviewed cell is NOT a pass — the verdict is incomplete",
      domain.stress_run_verdict(cells=cells, reviews={cells[0]["id"]: {"passed": True}},
                                asset_revision=2, required=10)["verdict"] == "incomplete")
one_fail = {**reviews_all, cells[3]["id"]: {"passed": False, "notes": "smiling again"}}
check("ONE failed cell fails the whole run — 10/10 means no cell may fail",
      domain.stress_run_verdict(cells=cells, reviews=one_fail,
                                asset_revision=2, required=10)["verdict"] == "fail")
check("a revised asset makes the run STALE, not merely failed",
      domain.stress_run_verdict(cells=cells, reviews=reviews_all,
                                asset_revision=3, required=10)["verdict"] == "stale")


# ── passport validation ─────────────────────────────────────────────────────
print("\npassport validation")

v = domain.validate_asset(asset={"tag": "t", "type": "character",
    "descriptor": "a man", "scale_landmark": "118cm tall",
    "default_expression": "warm"})
check("centimetres for a body are refused (NEG-008)",
      any(p["code"] == "SCALE_BY_NUMBER" for p in v["problems"]))
v = domain.validate_asset(asset={"tag": "t", "type": "character",
    "descriptor": "a man", "scale_landmark": "her head reaches his shoulder",
    "default_expression": "warm"})
check("a landmark passes", v["valid"])
v = domain.validate_asset(asset={"tag": "t", "type": "character",
    "descriptor": "a man", "scale_landmark": "head at his shoulder"})
check("a character with no default expression is flagged (NEG-002)",
      any(p["code"] == "NO_DEFAULT_EXPRESSION" for p in v["problems"]))


# ── the scene wrapper ───────────────────────────────────────────────────────
print("\nthe scene wrapper")

est = domain.compile_prompt(
    shot={**shot, "shot_role": "establish",
          "establish_job": "reveal the scale of the shop against the arcade"},
    assets=assets, project={}, stack=stack_of("minimax-h3-ref"))
check("an establisher declares its ONE job",
      "one job: reveal the scale" in est["text"])
check("an establisher carries no dialogue even when a speaker is set",
      "only person who speaks" not in est["text"]
      and "plays on ambience alone" in est["text"])

btn = domain.compile_prompt(
    shot={**shot, "shot_role": "button",
          "button_change": "the box now sits alone on the counter, the shop empty"},
    assets=assets, project={}, stack=stack_of("minimax-h3-ref"))
check("a button shows the consequence in the wider frame",
      "the box now sits alone" in btn["text"])
check("a button HOLDS its final composition for the next scene to inherit",
      "HELD, completely stable" in btn["text"])


# ── wrapper density + character absence ─────────────────────────────────────
print("\nwrapper density")

wrap = {**shot, "seconds": 4, "frame_source": "scene_plate",
        "plate_path": "plate.png", "shot_role": "establish", "speaker": None,
        "establish_job": "location", "camera_action": "slow crane down",
        "end_frame": "the shop small at centre, arcade glass above",
        "characters_visible": False,
        "card": {"identity": {"location": "the arcade", "description": "dawn light."}}}
cf = domain.compile_prompt(shot=wrap, assets=assets, project={},
                           stack=stack_of("minimax-h3-ref"))
check("a character-free wrapper says so in words",
      "Character-free frame: no characters enter or appear" in cf["text"])
check("and EXCLUDES the character sheets — the reference is the invitation",
      cf["reference_count"] == 1)

g = domain.evaluate_gates(shot=wrap, assets=assets, prompt={"hash": "H"},
                          audits=[{"hash": "H", "score": 9.7}],
                          stack=stack_of("minimax-h3-ref"), **BASE)
check("a clean wrapper passes the density gate",
      {x["id"]: x for x in g}["G"]["passed"] is True)

g = domain.evaluate_gates(shot={**wrap, "speaker": "tom"}, assets=assets,
                          prompt={"hash": "H"}, audits=[{"hash": "H", "score": 9.7}],
                          stack=stack_of("minimax-h3-ref"), **BASE)
check("G refuses dialogue on a wrapper beat",
      {x["id"]: x for x in g}["G"]["passed"] is False)

g = domain.evaluate_gates(shot={**wrap, "camera_action": "crane down then pan left"},
                          assets=assets, prompt={"hash": "H"},
                          audits=[{"hash": "H", "score": 9.7}],
                          stack=stack_of("minimax-h3-ref"), **BASE)
check("G refuses a second camera verb — someone is smuggling a scene into a beat",
      {x["id"]: x for x in g}["G"]["passed"] is False)

g = domain.evaluate_gates(shot={k: v for k, v in wrap.items() if k != "end_frame"},
                          assets=assets, prompt={"hash": "H"},
                          audits=[{"hash": "H", "score": 9.7}],
                          stack=stack_of("minimax-h3-ref"), **BASE)
check("G refuses a wrapper with no explicit end frame",
      {x["id"]: x for x in g}["G"]["passed"] is False)


# ── conditional authority + the chain contract ──────────────────────────────
print("\nreference authority and the chain contract")

sp = domain.compile_prompt(
    shot={**shot, "frame_source": "scene_plate", "plate_path": "plate.png"},
    assets=assets, project={}, stack=stack_of("minimax-h3-ref"))
check("a scene plate is a location authority, not a first frame",
      "Do not copy any incidental framing" in sp["text"]
      and "first frame" not in sp["text"].split("\n")[0].lower())

ch = domain.compile_prompt(
    shot={**shot, "frame_source": "chain_cut", "chain_from": "S0",
          "plate_path": "plate.png",
          "continuity_requirements": ["the den remains dark",
                                       "the lantern stays at upper-left distance"]},
    assets=assets, project={}, stack=stack_of("minimax-h3-ref"))
check("a chained shot demotes the plate to appearance-only at Image 2",
      "Image 2 is the location appearance authority only" in ch["text"])
check("sacred continuity facts are named, and everything else is freed",
      "Sacred continuity facts, preserved exactly: the den remains dark" in ch["text"]
      and "may be freely recomposed" in ch["text"])

cfree = domain.compile_prompt(
    shot={**wrap}, assets=assets, project={}, stack=stack_of("minimax-h3-ref"))
check("absolute absence forbids silhouettes, reflections and shadows",
      "no silhouettes, reflections, shadows or background figures" in cfree["text"])

g = domain.evaluate_gates(
    shot={**wrap, "frame_source": "chain_cut", "chain_from": "S0"},
    assets=assets, prompt={"hash": "H"}, audits=[{"hash": "H", "score": 9.7}],
    stack=stack_of("minimax-h3-ref"), **BASE)
check("H refuses a chain with no sacred facts named",
      {x["id"]: x for x in g}["H"]["passed"] is False)

g = domain.evaluate_gates(
    shot={**wrap, "frame_source": "chain_cut", "chain_from": "S0",
          "continuity_requirements": ["den stays dark"]},
    assets=assets, prompt={"hash": "H"}, audits=[{"hash": "H", "score": 9.7}],
    stack=stack_of("minimax-h3-ref"), **BASE)
check("H passes once the sacred facts exist",
      {x["id"]: x for x in g}["H"]["passed"] is True)

g = domain.evaluate_gates(
    shot={**wrap, "frame_source": "chain_cut", "chain_from": "S0",
          "continuity_requirements": ["x"], "predecessor_end_hold_seconds": 0},
    assets=assets, prompt={"hash": "H"}, audits=[{"hash": "H", "score": 9.7}],
    stack=stack_of("minimax-h3-ref"), **BASE)
check("H refuses a predecessor with no held end frame to inherit",
      {x["id"]: x for x in g}["H"]["passed"] is False)

g = domain.evaluate_gates(shot=wrap, assets=assets, prompt={"hash": "H"},
                          audits=[{"hash": "H", "score": 9.7}],
                          stack=stack_of("minimax-h3-ref"), **BASE)
check("I refuses character sheets attached to a character-free frame",
      {x["id"]: x for x in g}["I"]["passed"] is False)

g = domain.evaluate_gates(shot=wrap, assets=[a for a in assets
                                             if a["type"] != "character"],
                          prompt={"hash": "H"}, audits=[{"hash": "H", "score": 9.7}],
                          stack=stack_of("minimax-h3-ref"), **BASE)
check("I passes when the attachments agree with the declared frame",
      {x["id"]: x for x in g}["I"]["passed"] is True)

g = domain.evaluate_gates(shot={**wrap, "end_hold_seconds": 0.5},
                          assets=[], prompt={"hash": "H"},
                          audits=[{"hash": "H", "score": 9.7}],
                          stack=stack_of("minimax-h3-ref"), **BASE)
check("G validates the hold as a NUMBER, not prose",
      {x["id"]: x for x in g}["G"]["passed"] is False)


# ── dynamic character index + the duration gate ─────────────────────────────
print("\ndynamic reference index and wrapper duration")

sp2 = domain.compile_prompt(
    shot={**shot, "frame_source": "scene_plate", "plate_path": "plate.png"},
    assets=assets, project={}, stack=stack_of("minimax-h3-ref"))
check("on a scene plate, the first character sheet is Image 2",
      "Image 2 defines Tom's appearance only" in sp2["text"])

ch2 = domain.compile_prompt(
    shot={**shot, "frame_source": "chain_cut", "chain_from": "S0",
          "plate_path": "plate.png", "continuity_requirements": ["x"]},
    assets=assets, project={}, stack=stack_of("minimax-h3-ref"))
check("on a chain with a plate, the first character sheet is Image 3 — no slot collision",
      "Image 3 defines Tom's appearance only" in ch2["text"]
      and "Image 2 defines Tom" not in ch2["text"])

g = domain.evaluate_gates(shot={**wrap, "seconds": 6}, assets=[],
                          prompt={"hash": "H"}, audits=[{"hash": "H", "score": 9.7}],
                          stack=stack_of("minimax-h3-ref"), **BASE)
check("J refuses a 6-second wrapper — a scene wearing a wrapper's clothes",
      {x["id"]: x for x in g}["J"]["passed"] is False)

g = domain.evaluate_gates(
    shot={**wrap, "seconds": 6, "wrapper_duration_override":
          {"approved": True, "reason": "slow dawn reveal to land a music transition"}},
    assets=[], prompt={"hash": "H"}, audits=[{"hash": "H", "score": 9.7}],
    stack=stack_of("minimax-h3-ref"), **BASE)
check("J accepts an explicit override WITH a written reason",
      {x["id"]: x for x in g}["J"]["passed"] is True)

g = domain.evaluate_gates(
    shot={**wrap, "seconds": 6, "wrapper_duration_override": {"approved": True}},
    assets=[], prompt={"hash": "H"}, audits=[{"hash": "H", "score": 9.7}],
    stack=stack_of("minimax-h3-ref"), **BASE)
check("J refuses an override with no reason — drift needs a signature",
      {x["id"]: x for x in g}["J"]["passed"] is False)

g = domain.evaluate_gates(shot=wrap, assets=[], prompt={"hash": "H"},
                          audits=[{"hash": "H", "score": 9.7}],
                          stack=stack_of("minimax-h3-ref"), **BASE)
check("J passes a 4-second wrapper", {x["id"]: x for x in g}["J"]["passed"] is True)


# ── gate K: keyframe means exact reconstruction ─────────────────────────────
print("\nkeyframe means exact reconstruction")

kf = {**wrap, "frame_source": "keyframe"}
g = domain.evaluate_gates(shot=kf, assets=[], prompt={"hash": "H"},
                          audits=[{"hash": "H", "score": 9.7}],
                          stack=stack_of("minimax-h3-ref"), **BASE)
check("K refuses a wrapper keyframe with no id and no immutable facts",
      {x["id"]: x for x in g}["K"]["passed"] is False)

g = domain.evaluate_gates(
    shot={**kf, "keyframe_id": "scene_07_establish_comp_v03",
          "continuity_requirements": ["den centred in lower third",
                                       "blue pre-dawn lighting"]},
    assets=[], prompt={"hash": "H"}, audits=[{"hash": "H", "score": 9.7}],
    stack=stack_of("minimax-h3-ref"), **BASE)
check("K passes an approved frame with named immutable facts",
      {x["id"]: x for x in g}["K"]["passed"] is True)

g = domain.evaluate_gates(shot=wrap, assets=[], prompt={"hash": "H"},
                          audits=[{"hash": "H", "score": 9.7}],
                          stack=stack_of("minimax-h3-ref"), **BASE)
check("K does not fire on a scene_plate wrapper — the normal establish case",
      "K" not in {x["id"] for x in g})

kfp = domain.compile_prompt(
    shot={**shot, "keyframe_path": "kf.png"}, assets=assets, project={},
    stack=stack_of("minimax-h3-ref"))
check("the keyframe branch declares start-frame authority and forbids off-frame imports",
      "start-frame and composition authority" in kfp["text"]
      and "off-frame elements" in kfp["text"])

# ── the ensemble manifest: multi-character keyframes bind every subject ─────
print("\nthe ensemble manifest")

# the documented failure driver on multi-character keyframes is an unbound
# subject, not headcount — ByteDance's own flagship examples bind 18 subjects
# one-to-one; practitioner drift reports all trace back to unmanaged binding
ekf = {**wrap, "frame_source": "keyframe", "characters_visible": True,
       "keyframe_id": "scene_07_establish_comp_v03",
       "continuity_requirements": ["den centred in lower third"]}
g = domain.evaluate_gates(shot=ekf, assets=assets, prompt={"hash": "H"},
                          audits=[{"hash": "H", "score": 9.7}],
                          stack=stack_of("minimax-h3-ref"), **BASE)
by = {x["id"]: x for x in g}
check("K refuses a two-character keyframe with no ensemble manifest",
      by["K"]["passed"] is False)
check("and the refusal names the fallback, not just the failure",
      "scene_plate or chain_cut" in by["K"]["detail"])

manifest = [{"character": "tom", "screen_zone": "left third",
             "pose": "standing, bundle held at chest"},
            {"character": "rich", "screen_zone": "right third",
             "pose": "one hand resting on the counter"}]
g = domain.evaluate_gates(
    shot={**ekf, "ensemble_manifest": [manifest[0],
          {"character": "rich", "screen_zone": "right third"}]},
    assets=assets, prompt={"hash": "H"}, audits=[{"hash": "H", "score": 9.7}],
    stack=stack_of("minimax-h3-ref"), **BASE)
check("K refuses a manifest entry with a zone but no declared pose",
      {x["id"]: x for x in g}["K"]["passed"] is False)

g = domain.evaluate_gates(shot={**ekf, "ensemble_manifest": manifest},
                          assets=assets, prompt={"hash": "H"},
                          audits=[{"hash": "H", "score": 9.7}],
                          stack=stack_of("minimax-h3-ref"), **BASE)
by = {x["id"]: x for x in g}
check("K passes when every visible character is bound to a zone and pose",
      by["K"]["passed"] is True)
check("and the manifest satisfies G's blocking requirement — no double demand",
      by["G"]["passed"] is True)

g = domain.evaluate_gates(
    shot={**ekf, "character_blocking": "Tom small at lower-right"},
    assets=[assets[0]], prompt={"hash": "H"},
    audits=[{"hash": "H", "score": 9.7}],
    stack=stack_of("minimax-h3-ref"), **BASE)
check("a single-character keyframe needs no manifest — the rule must not over-fire",
      {x["id"]: x for x in g}["K"]["passed"] is True)

em = domain.compile_prompt(
    shot={**ekf, "keyframe_path": "kf.png", "ensemble_manifest": manifest},
    assets=assets, project={}, stack=stack_of("minimax-h3-ref"))
check("the compiler binds each character to their named zone and pose",
      "Tom holds the left third of frame, standing, bundle held at chest."
      in em["text"]
      and "Richard holds the right third of frame" in em["text"])
check("and locks the zones — no unnamed movement or contact",
      "No character leaves their named zone" in em["text"])


# ── gate L: an extension knows what is already true ─────────────────────────
print("\nthe extension contract")

exs = {"code": "S9", "seconds": 9, "frame_source": "scene_plate",
       "plate_path": "plate.png", "room_scope": "partial",
       "card": {"identity": {"location": "the shop", "description": "dawn."}}}
good_ext = {"mode": "forward", "source_clip": "S8_take3",
            "source_approved": True, "task_type": "extend",
            "already_true": ["the door is already closed",
                             "Tom holds the bundle in both hands"],
            "identity_anchors": ["rust-red crewneck jumper",
                                 "grey checked collar"],
            "lighting": "warm amber lamplight from screen-left, soft shadows."}

g = domain.evaluate_gates(shot={**exs, "extension": {"mode": "forward"}},
                          assets=assets, prompt={"hash": "H"},
                          audits=[{"hash": "H", "score": 9.7}],
                          stack=stack_of("minimax-h3-ref"), **BASE)
by = {x["id"]: x for x in g}
check("L refuses an extension with no source, no facts and no anchors",
      by["L"]["passed"] is False)
check("and names the replay failure — completed actions will replay at the cut",
      "replay at the cut" in by["L"]["detail"])

g = domain.evaluate_gates(
    shot={**exs, "extension": {**good_ext,
          "identity_anchors": ["a", "b", "c", "d"]}},
    assets=assets, prompt={"hash": "H"}, audits=[{"hash": "H", "score": 9.7}],
    stack=stack_of("minimax-h3-ref"), **BASE)
check("L refuses four identity anchors — over-specifying invites contradictions",
      {x["id"]: x for x in g}["L"]["passed"] is False)

g = domain.evaluate_gates(
    shot={**exs, "extension": {**good_ext, "mode": "bridge"}},
    assets=assets, prompt={"hash": "H"}, audits=[{"hash": "H", "score": 9.7}],
    stack=stack_of("minimax-h3-ref"), **BASE)
check("L refuses a bridge with no declared geography master",
      {x["id"]: x for x in g}["L"]["passed"] is False)

g = domain.evaluate_gates(
    shot={**exs, "extension": {**good_ext, "task_type": "auto"}},
    assets=assets, prompt={"hash": "H"}, audits=[{"hash": "H", "score": 9.7}],
    stack=stack_of("minimax-h3-ref"), **BASE)
check("L refuses task type left on Auto — a continuation read as a new clip",
      {x["id"]: x for x in g}["L"]["passed"] is False)

g = domain.evaluate_gates(
    shot={**exs, "extension": {**good_ext, "source_approved": False}},
    assets=assets, prompt={"hash": "H"}, audits=[{"hash": "H", "score": 9.7}],
    stack=stack_of("minimax-h3-ref"), **BASE)
check("L refuses extending an unapproved master — drift compounds downstream",
      {x["id"]: x for x in g}["L"]["passed"] is False)

g = domain.evaluate_gates(shot={**exs, "extension": good_ext},
                          assets=assets, prompt={"hash": "H"},
                          audits=[{"hash": "H", "score": 9.7}],
                          stack=stack_of("minimax-h3-ref"), **BASE)
check("L passes a complete forward extension",
      {x["id"]: x for x in g}["L"]["passed"] is True)

g = domain.evaluate_gates(shot=exs, assets=assets, prompt={"hash": "H"},
                          audits=[{"hash": "H", "score": 9.7}],
                          stack=stack_of("minimax-h3-ref"), **BASE)
check("L stays silent on a shot with no extension — the rule must not over-fire",
      "L" not in {x["id"] for x in g})

ep = domain.compile_prompt(shot={**exs, "extension": good_ext},
                           assets=assets, project={},
                           stack=stack_of("minimax-h3-ref"))
check("the compiler asserts direct audiovisual continuation and no scene reset",
      "Extend the video forward from @Video1." in ep["text"]
      and "audiovisual continuation" in ep["text"]
      and "Do not reset the scene." in ep["text"]
      and "reference @Video1" not in ep["text"])
check("already-true facts are stated as do-not-repeat",
      "ALREADY TRUE" in ep["text"]
      and "the door is already closed" in ep["text"]
      and "do not repeat" in ep["text"].lower())
check("lighting is carried as literal text",
      "Lighting, carried exactly: warm amber lamplight" in ep["text"])

bp = domain.compile_prompt(
    shot={**exs, "extension": {**good_ext, "mode": "bridge",
          "geography_master": "@Video1"}},
    assets=assets, project={}, stack=stack_of("minimax-h3-ref"))
check("a bridge names its sole geography master",
      "sole geography" in bp["text"] and "@Video1" in bp["text"])


print(f"\n  {len(PASS)} passed · {len(FAIL)} failed")
if FAIL:
    print("  FAILED: " + ", ".join(FAIL))
sys.exit(1 if FAIL else 0)
