"""domain.py — the production rules, as pure functions.

**No database. No filesystem. No network.** State arrives as plain dicts and
decisions come back as plain dicts, which is what lets this be a separately
testable service instead of a second source of truth sitting next to Supabase.

Everything in here was earned on a real production. The comments name what each
rule cost, because a rule with a scar attached gets followed and an invented
best-practice does not.

The SaaS owns persistence, auth, tenancy and queueing. This owns the answer to
one question: *given this state of the world, what is true, and what refuses?*
"""
from __future__ import annotations
import hashlib
from typing import Any, Literal, TypedDict


# ─────────────────────────────────────────────────────────────────────────────
# capability resolution — nothing above this layer names a model
# ─────────────────────────────────────────────────────────────────────────────

class Derived(TypedDict):
    prompt_carries_dialogue: bool
    must_assert_composition: bool
    needs_speaker_box_when_multi_face: bool
    refs_max: int
    dur: list[int]
    discard_generated_audio: bool


def resolve_stack(registry: dict, house: dict) -> dict:
    """Turn provider NAMES into capability dicts, once, at the top."""
    return {
        kind: {"key": house[kind], **registry[kind][house[kind]]}
        for kind in ("image", "video", "voice", "lipsync")
    }


def derive(stack: dict) -> Derived:
    """Pipeline behaviour that falls out of CAPABILITY rather than configuration.

    This is the whole agnostic argument. A new provider inherits the correct
    behaviour without anyone remembering its quirks, because these are branched
    on rather than written in a wiki.
    """
    v, l = stack["video"], stack["lipsync"]
    return {
        # A route that invents speech from the prompt will animate the mouth to
        # what it invented; our recording then plays over the top and the two can
        # never agree. So the words stay out entirely.
        "prompt_carries_dialogue": v["speech"] == "none",
        # A composing route must be TOLD to reproduce the supplied frame. A route
        # with a literal first frame need not be.
        "must_assert_composition": not v["first_frame"],
        # No lipsync route measured accepts a face selector. On a two-shot it
        # finds a face and drives it — and the first time it ran it put one man's
        # line on the other man's mouth.
        "needs_speaker_box_when_multi_face": not l["face_select"],
        "refs_max": v["refs_max"],
        "dur": v["dur"],
        "discard_generated_audio": v["audio_out"],
    }


# ─────────────────────────────────────────────────────────────────────────────
# the gates — they refuse, or they are not gates
# ─────────────────────────────────────────────────────────────────────────────

class Gate(TypedDict):
    id: str
    name: str
    passed: bool
    detail: str
    code: str


def evaluate_gates(*, shot: dict, assets: list[dict], boards: list[dict],
                   prompt: dict | None, audits: list[dict], stack: dict,
                   settings: dict) -> list[Gate]:
    """Every gate, evaluated against supplied state. Nothing is read; nothing is
    written. The caller decides what to do with a refusal."""
    d = derive(stack)
    g: list[Gate] = []

    pending = [b["name"] for b in boards if b.get("decision") == "pending"]
    g.append({"id": "A", "name": "boards decided", "passed": not pending,
              "code": "BOARDS_PENDING",
              "detail": ("pending: " + ", ".join(pending)) if pending
                        else "every board carries a written decision"})

    unlocked = [f"{a['tag']}({a.get('status')})" for a in assets
                if a.get("required", True) and a.get("status") != "locked"]
    g.append({"id": "B", "name": "rows locked", "passed": not unlocked,
              "code": "LOCKED_ASSETS_REQUIRED",
              "detail": ("not locked: " + ", ".join(unlocked)) if unlocked
                        else "every required asset is locked"})

    # GATE C — the audit must belong to THIS text.
    #
    # Rounds are stamped against a hash of the exact words they scored. A
    # correction produces a prompt that has never been scored, and that is the
    # entire point: a prompt was once rewritten materially — seven new reference
    # bindings and a different route — and fired against the audit of the version
    # before the change.
    floor = settings.get("audit_floor", 9.5)
    if not prompt:
        g.append({"id": "C", "name": "prompt audited", "passed": False,
                  "code": "NO_PROMPT", "detail": "nothing compiled yet"})
    else:
        mine = [a["score"] for a in audits if a.get("hash") == prompt.get("hash")]
        best = max(mine) if mine else None
        g.append({"id": "C", "name": "prompt audited",
                  "passed": bool(best is not None and best >= floor),
                  "code": "AUDIT_INVALIDATED" if mine else "AUDIT_MISSING",
                  "detail": (f"cleared at {best} on the current text"
                             if best is not None and best >= floor
                             else (f"best round on this text is {best}, floor is {floor}"
                                   if best is not None
                                   else "the current text has no round of its own"))})

    # GATE D — a mouth cannot be driven onto the right face by hope.
    faces = sum(1 for a in assets if a.get("type") == "character")
    has_line = bool(shot.get("speaker"))
    needs = d["needs_speaker_box_when_multi_face"] and faces > 1 and has_line
    g.append({"id": "D", "name": "speaker assigned",
              "passed": (not needs) or bool(shot.get("speaker_box")),
              "code": "SPEAKER_BOX_REQUIRED",
              "detail": (f"{faces} faces and a line, and the sync route cannot choose "
                         f"— a speaker box is required"
                         if needs and not shot.get("speaker_box")
                         else ("boxed to " + str(shot.get("speaker"))
                               if shot.get("speaker_box")
                               else "single face or no line; nothing to disambiguate"))})

    # GATE E — the reference budget is a capability, not a preference.
    n_refs = 1 + len(assets)
    g.append({"id": "E", "name": "reference budget", "passed": n_refs <= d["refs_max"],
              "code": "REFERENCE_BUDGET_EXCEEDED",
              "detail": f"{n_refs} references against a ceiling of {d['refs_max']}"})

    # GATE G — wrapper density. An establish or button is ONE image with one
    # camera action and an explicit held end frame. Dialogue, a second camera
    # verb, or a missing end frame means someone is smuggling a scene into a
    # beat, and the gate exists so that drift is refused rather than reviewed.
    role = shot.get("shot_role", "coverage")
    if role in ("establish", "button"):
        problems = []
        if shot.get("speaker") or (shot.get("card", {}).get("identity", {})
                                       .get("dialogue")):
            problems.append("dialogue attached — wrapper beats play on ambience alone")
        verbs = [v for v in ("crane", "pan", "push", "pull", "rise", "drift",
                             "dolly", "orbit", "track", "zoom", "tilt", "glide")
                 if v in str(shot.get("camera_action", "")).lower()]
        if len(verbs) > 1:
            problems.append(f"more than one camera verb ({', '.join(verbs)}) — one action only")
        if not shot.get("end_frame"):
            problems.append("no explicit end-frame description — nothing to hold or inherit")
        if shot.get("characters_visible", True) and not shot.get("character_blocking") \
                and any(a.get("type") == "character" for a in assets):
            problems.append("characters marked visible with no blocking — position, scale "
                            "and one quiet action, or declare the frame character-free")
        # the hold is validated as a NUMBER, not by hunting for wording in prose
        if float(shot.get("end_hold_seconds", 1)) < 1:
            problems.append("end_hold_seconds under 1 — the held second is what the edit "
                            "cuts on and the next shot inherits")
        g.append({"id": "G", "name": "wrapper density", "passed": not problems,
                  "code": "WRAPPER_OVERLOADED",
                  "detail": "; ".join(problems) if problems else
                            "one job, one camera action, a held end frame"})

        # GATE I — reference authority conflict. A technically good prompt still
        # fails if its references tell the model competing stories. The wording
        # itself is compiled from frame_source so it cannot conflict; what CAN
        # conflict is the attachment list.
        conflicts = []
        if not shot.get("characters_visible", True) \
                and any(a.get("type") == "character" for a in assets):
            conflicts.append("character sheets attached to a declared character-free frame "
                             "— the reference is the invitation to invent someone")
        g.append({"id": "I", "name": "reference authority", "passed": not conflicts,
                  "code": "REFERENCE_AUTHORITY_CONFLICT",
                  "detail": "; ".join(conflicts) if conflicts else
                            "attachments agree with the declared frame"})

        # GATE J — a wrapper is 3–5 seconds by definition. Longer is a scene
        # wearing a wrapper's clothes; shorter cannot hold its end frame. Rare
        # exceptions go through an explicit override with a written reason,
        # never through drift.
        wsec = float(shot.get("seconds", shot.get("duration_seconds", 4)))
        ov = shot.get("wrapper_duration_override") or {}
        dur_ok = 3 <= wsec <= 5 or (ov.get("approved") and ov.get("reason"))
        g.append({"id": "J", "name": "wrapper duration", "passed": bool(dur_ok),
                  "code": "WRAPPER_DURATION_INVALID",
                  "detail": (f"{wsec}s within 3–5s" if 3 <= wsec <= 5 else
                             (f"{wsec}s by override: {ov.get('reason')}"
                              if dur_ok else
                              f"{wsec}s outside 3–5s — a longer wrapper is a scene "
                              f"wearing a wrapper's clothes; override with a written "
                              f"reason if the exception is real"))})

    # GATE H — a chain must name its sacred facts. "Preserve continuity" is too
    # broad: the system needs to know which visual facts are sacred and which it
    # is free to redesign.
    if shot.get("frame_source") in ("chain_cut", "chain_continue"):
        missing = []
        if not shot.get("chain_from"):
            missing.append("no predecessor shot named")
        if not (shot.get("continuity_requirements") or []):
            missing.append("no continuity_requirements — name the sacred facts, at least one")
        if float(shot.get("predecessor_end_hold_seconds", 1)) < 1:
            missing.append("the predecessor's end frame was not held for a full second — "
                           "there is no stable frame to inherit")
        g.append({"id": "H", "name": "chain specified", "passed": not missing,
                  "code": "CHAIN_UNDERSPECIFIED",
                  "detail": "; ".join(missing) if missing else
                            f"chained from {shot.get('chain_from')} with "
                            f"{len(shot.get('continuity_requirements', []))} sacred facts"})

    # GATE F — the clock the route actually honours.
    lo, hi = d["dur"]
    sec = shot.get("seconds", lo)
    g.append({"id": "F", "name": "duration in range", "passed": lo <= sec <= hi,
              "code": "DURATION_OUT_OF_RANGE",
              "detail": f"{sec}s against {lo}–{hi}s"})
    return g


def blocking(gates: list[Gate]) -> list[Gate]:
    return [g for g in gates if not g["passed"]]


# ─────────────────────────────────────────────────────────────────────────────
# the prompt
# ─────────────────────────────────────────────────────────────────────────────

def prompt_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def compile_prompt(*, shot: dict, assets: list[dict], project: dict,
                   stack: dict) -> dict:
    """Compile one shot into the resolved provider's grammar.

    Receives ONLY a validated shot, immutable asset snapshots, and project
    settings. It never looks up "latest asset by tag" — that is what keeps a
    prompt version reproducible after the asset moves on.
    """
    d = derive(stack)
    card = shot.get("card", {})
    ident = card.get("identity", {})
    lines: list[str] = []
    manifest: list[dict] = []

    # ── Image 1: where the first frame comes from ───────────────────────────
    # The authority wording is COMPILED from frame_source, never a static block —
    # a generic "Image 1 is the location authority" line is wrong the moment a
    # chained end frame takes the first slot, and references telling the model
    # competing stories is one of the highest-leverage failure modes there is.
    src = shot.get("frame_source", "keyframe")
    if src == "keyframe":
        manifest.append({"order": 1, "role": "first frame",
                         "path": shot.get("keyframe_path", ""),
                         "controls": "the complete opening composition"})
        lines.append(
            "Image 1 is the first frame. It defines the complete opening composition: every "
            "subject's position and pose, the prop state, the room, the lighting and the "
            "camera direction. Reproduce it exactly as the shot's opening frame and animate "
            "forward from there; do not restage it and do not recompose it."
            if d["must_assert_composition"] else
            "Image 1 is the first frame of this shot.")
    elif src == "scene_plate":
        # a location plate is NOT a literal first frame: the shot composes fresh
        manifest.append({"order": 1, "role": "location authority",
                         "path": shot.get("plate_path", ""),
                         "controls": "architecture, layout, palette, motivated lighting"})
        lines.append(
            "Image 1 is the location authority. Take its architecture, layout, palette and "
            "motivated lighting only. Do not copy any incidental framing, character pose or "
            "action from it — this shot composes its own frame, described below.")
    else:
        cont = src == "chain_continue"
        prev = shot.get("chain_from", "the preceding shot")
        manifest.append({"order": 1, "role": "previous last frame",
                         "path": shot.get("continuity_path", ""),
                         "controls": "continuity" + (" and composition" if cont else "")})
        lines.append(
            f"Image 1 is the final frame of the preceding shot, {prev}. " +
            ("It is the continuity AND composition authority: begin from its held "
             "composition and preserve camera direction, spatial layout, props, character "
             "state and lighting state."
             if cont else
             "It is the continuity authority: preserve its relevant props, character state, "
             "lighting state and spatial relationships, but compose a NEW shot — it does not "
             "define this shot's framing, which the description below does."))
        if shot.get("plate_path") or shot.get("scene_plate_attached"):
            manifest.append({"order": 2, "role": "location appearance",
                             "path": shot.get("plate_path", ""),
                             "controls": "architecture, material, palette, lighting design"})
            lines.append(
                "Image 2 is the location appearance authority only. Take its architecture, "
                "materials, palette and lighting design; do not take framing, character "
                "placement, pose, action or a camera direction from it.")
        # continuity is a LIST of sacred facts, not a mood. "Preserve continuity"
        # is too broad — the model must know which facts are sacred and which it
        # is free to redesign.
        reqs = shot.get("continuity_requirements") or []
        if reqs:
            lines.append("Sacred continuity facts, preserved exactly: "
                         + "; ".join(reqs)
                         + ". Everything not named here may be freely recomposed.")

    # ── the sheets: one role each, and what they must NOT contribute ────────
    ref_assets = ([a for a in assets if a.get("type") != "character"]
                  if (shot.get("shot_role") in ("establish", "button")
                      and not shot.get("characters_visible", True)) else assets)
    for i, a in enumerate(ref_assets, start=len(manifest) + 1):
        if len(manifest) >= d["refs_max"]:
            break
        manifest.append({"order": i, "role": f"{a['tag']} appearance",
                         "path": a.get("hero_path", ""),
                         "controls": a.get("descriptor", ""),
                         "must_not_touch": a.get("must_not_contribute", "")})
        lines.append(f"Image {i} defines {a.get('name', a['tag'])}'s appearance only — "
                     f"{a.get('descriptor','')}. "
                     + (a.get("must_not_contribute")
                        or "Do not use its background or layout."))
    lines.append("")

    # ── scene wrapper: establish / coverage / button ────────────────────────
    #
    # An establisher has ONE declared job (location, scale, threat or emotion)
    # and no dialogue; a button shows the consequence in the wider frame and
    # holds its final composition so the next scene can inherit it. Both are
    # generated as their own short clips and cut in the edit — never asked of
    # one long generation.
    role = shot.get("shot_role", "coverage")
    wrapper = role in ("establish", "button")
    chars_visible = shot.get("characters_visible", True)
    if role == "establish":
        job = shot.get("establish_job", "orient the audience in the location")
        lines.append(f"This is the scene's opening establishing shot, and it has one job: "
                     f"{job}. Nothing else competes with that job.")
        lines.append("")
    elif role == "button":
        change = shot.get("button_change", "what the scene has changed")
        lines.append(f"This is the scene's closing shot — its full stop. The wider frame now "
                     f"shows {change}. One camera action only, then the final composition is "
                     f"HELD, completely stable, for the last full second, so the edit can cut "
                     f"or the next scene can inherit this exact image.")
        lines.append("")
    if wrapper:
        if not chars_visible:
            lines.append("Character-free frame: no characters enter or appear at any point — "
                         "no silhouettes, reflections, shadows or background figures. No "
                         "character references are attached.")
        elif shot.get("character_blocking"):
            lines.append(f"Characters in frame: {shot['character_blocking']} — position, "
                         f"scale and one quiet action only; no performance, no story beat.")
        if shot.get("end_frame"):
            lines.append(f"The shot ends on: {shot['end_frame']} — held completely stable "
                         f"for the final full second.")
        lines.append("")

    # ── room scope: describe the FRAME, not the location ────────────────────
    #
    # A prompt is a list of things the model may draw, so anything it names that
    # is not in the frame is a gap the model will fill. A counter-top insert was
    # once handed the whole shop and built a bright kitchen with a window in it.
    scope = shot.get("room_scope", "full")
    where = ident.get("location", "the location")
    desc = ident.get("description", "")
    if scope == "none":
        lines.append(f"In {where}, of which this frame shows only what Image 1 already "
                     f"contains, {desc}")
        lines.append("The framing stays exactly as tight as the first frame for the whole "
                     "take. It never widens and never pulls back, and no further part of the "
                     "location becomes visible at any point.")
    elif scope == "partial":
        lines.append(f"In {where}, of which only a shallow soft slice is visible behind the "
                     f"figure, {desc}")
    else:
        lines.append(f"In {where}, {desc}")
    lines.append("")

    if card.get("direction", {}).get("acting"):
        lines.append(card["direction"]["acting"]); lines.append("")

    # ── the mouth ───────────────────────────────────────────────────────────
    spk = None if role in ("establish", "button") else shot.get("speaker")
    if role in ("establish", "button") and shot.get("speaker"):
        # the wrapper beats are ambience-only; a line here belongs to coverage
        lines.append("Nobody speaks in this shot; it plays on ambience alone.")
        lines.append("")
    if spk:
        name = next((a.get("name", a["tag"]) for a in assets if a["tag"] == spk), spk)
        if d["prompt_carries_dialogue"]:
            lines.append(f'{name} says: "{ident.get("dialogue","")}"')
        else:
            lines.append(
                f"{name} is the only person who speaks. Animate the mouth as natural "
                f"conversational speech, the jaw and head carrying a talking rhythm, but do "
                f"NOT attempt specific words or lip shapes — the articulation is replaced from "
                f"a separate recording afterwards, and guessing at words here only fights that "
                f"pass.")
        for a in assets:
            if a.get("type") == "character" and a["tag"] != spk:
                n = a.get("name", a["tag"])
                lines.append(f"{n} does not speak: the mouth stays closed, though {n} is never "
                             f"frozen — the body keeps living and reacting.")
        lines.append("")

    # ── expression: the channel that gets filled in with 'pleasant' ─────────
    faces = {a["tag"]: (shot.get("expressions", {}).get(a["tag"])
                        or a.get("default_expression"))
             for a in assets if a.get("type") == "character"}
    faces = {k: v for k, v in faces.items() if v}
    if faces:
        lines.append("The performances read as follows: " + "; ".join(
            f"{next((a.get('name', k) for a in assets if a['tag'] == k), k)} is {v}"
            for k, v in faces.items()) + ".")
        lines.append("")

    if project.get("style_lock"):
        lines.append(f"The visuals feature {project['style_lock']}"); lines.append("")

    cam = card.get("cameraEdit", {})
    if cam:
        lines.append(" ".join(x for x in [
            f"Use a {cam.get('size','')}".strip(), cam.get("angle", ""),
            cam.get("movement", "locked off"),
            f"on a {cam.get('lens')}" if cam.get("lens") else "",
            "in one continuous take with no cuts."] if x))
        lines.append("")

    if card.get("audio"):
        lines.append(f"Audio includes {card['audio']}"); lines.append("")

    keep = ["Keep every character's identity, face, hair and clothing, the number of "
            "characters, the layout, the lighting and the screen direction consistent from "
            "the first frame to the last."]
    props = [a.get("name", a["tag"]) for a in assets if a.get("type") == "prop"]
    if props:
        keep.append("The prop count never changes: exactly one " + ", one ".join(props) + ".")
    lines.append("[Maintain Consistency]")
    lines.append(" ".join(keep))

    text = "\n".join(lines).strip() + "\n"
    return {"text": text, "hash": prompt_hash(text), "manifest": manifest,
            "reference_count": len(manifest)}


# ─────────────────────────────────────────────────────────────────────────────
# downstream invalidation
# ─────────────────────────────────────────────────────────────────────────────

def impact(*, asset_tag: str, shots: list[dict], prompts: list[dict],
           jobs: list[dict], selects: list[dict]) -> dict:
    """What does revising this asset make provisional?

    An approval is stamped against a state of the world, not against a file.
    Nothing is deleted; approved becomes provisional, and provisional needs a
    human to look again.

    Earned: an approved take was the one shot nobody rebuilt when the room
    changed, precisely because it was the one shot everybody trusted. Sixteen
    individual reviews missed it; one contact sheet caught it in seconds.
    """
    touched = [s["code"] for s in shots if asset_tag in s.get("asset_tags", [])]
    return {
        "asset": asset_tag,
        "shots": touched,
        "prompt_versions": [{"shot": p["shot"], "version": p["version"]}
                            for p in prompts if p["shot"] in touched],
        "audits_invalidated": [p["hash"] for p in prompts if p["shot"] in touched],
        "takes": [{"shot": j["shot"], "attempt": j["attempt"]}
                  for j in jobs if j["shot"] in touched],
        "selects_needing_review": [s["shot"] for s in selects if s["shot"] in touched],
        "rule": ("Nothing is deleted. Approved becomes provisional, because an approval is "
                 "stamped against a state of the world and the world moved."),
    }


# ─────────────────────────────────────────────────────────────────────────────
# the stress matrix
# ─────────────────────────────────────────────────────────────────────────────

def stress_matrix(*, asset: dict, co_stars: list[str], scene_light: str) -> dict:
    """The conditions an asset must survive before it may lock.

    Cheap stills, before one expensive video render. A passport built on one
    lucky image is a false victory — and our sheets travel as references on
    EVERY shot, so an untested sheet is a fault multiplied by every shot the
    character appears in.
    """
    return {
        "asset": asset["tag"],
        "angles": ["front", "three-quarter", "profile", "back"],
        "sizes": ["wide", "mid", "close"],
        "light": scene_light or "the actual scene light, not the sheet's neutral ground",
        "two_shots": co_stars or [],
        "note": ("A character who holds up alone often breaks the moment he shares a frame, "
                 "which is why the two-shots are not optional."),
    }


def stress_verdict(*, runs: int, passed: int, required: int) -> dict:
    ok = runs >= required and passed >= required
    return {"verdict": "pass" if ok else "fail", "runs": runs, "passed": passed,
            "required": required,
            "detail": ("locked" if ok else
                       f"below {required}/{required} — the row stays draft and the scenes it "
                       f"blocks stay closed")}


# ─────────────────────────────────────────────────────────────────────────────
# iteration policy
# ─────────────────────────────────────────────────────────────────────────────

def iteration_advice(*, round_n: int, score: float, settings: dict) -> dict:
    """Past a point, a failing shot does not need better words.

    Earned: three rounds on one shot, and the fix that landed on the third was
    structural — scope the room — not verbal.
    """
    floor = settings.get("audit_floor", 9.5)
    simplify = settings.get("simplify_at", 8)
    cap = settings.get("attempt_cap", 15)
    if score >= floor:
        return {"action": "proceed", "message": f"clears {floor}"}
    if round_n >= cap:
        return {"action": "blocked",
                "message": f"attempt cap {cap} reached on this framing — this shot must be "
                           f"re-designed, not re-worded"}
    if round_n >= simplify:
        return {"action": "simplify",
                "message": f"past round {simplify} the SHOT is wrong, not the sentence — "
                           f"split the beat, drop an action, or change the angle"}
    return {"action": "correct",
            "message": "correct the prompt, then audit the corrected text: it is a new prompt "
                       "that has never been scored"}


def stress_cells(*, asset: dict, co_stars: list[str] | None = None,
                 scene_lights: list[str] | None = None,
                 variants: list[str] | None = None) -> list[dict]:
    """The full combat matrix as individually reviewable CELLS.

    Each cell is one cheap still with its own generation spec, provenance slot
    and pass/fail. The dimensions are per asset type, and they are counted from
    working productions rather than guessed. A cell list is a plan; nothing here
    generates or stores anything.
    """
    tag, kind = asset["tag"], asset.get("type", "character")
    lights = scene_lights or ["the actual scene light, not a neutral studio ground"]
    cells: list[dict] = []

    def cell(cid: str, dim: str, spec: str) -> None:
        cells.append({"id": f"{tag}:{cid}", "dimension": dim, "spec": spec,
                      "asset": tag, "asset_revision": asset.get("version", 1)})

    if kind == "character":
        for a in ("front", "three-quarter", "profile", "rear", "close"):
            cell(f"angle-{a}", "angle",
                 f"{asset.get('descriptor','')} — a full study from the {a} view, under "
                 f"{lights[0]}, matching the reference sheet exactly")
        for s in ("wide", "medium", "close"):
            cell(f"size-{s}", "shot_size",
                 f"{asset.get('descriptor','')} — a {s} shot in the scene's own setting, "
                 f"under {lights[0]}")
        for i, l in enumerate(lights):
            cell(f"light-{i+1}", "scene_light",
                 f"{asset.get('descriptor','')} — standing in {l}; the light is the test")
        for co in (co_stars or []):
            cell(f"two-shot-{co.lower().replace(' ', '-')}", "two_shot",
                 f"{asset.get('descriptor','')} together with {co}, both exactly as their "
                 f"sheets define them — a character who holds up alone often breaks the "
                 f"moment he shares a frame")
        for v in (variants or []):
            cell(f"variant-{v}", "state_variant",
                 f"the {v} state variant, exactly as its own passport defines it")
    elif kind == "location":
        for c, d, s in (("wide", "geography", "the whole space, wide, establishing the "
                         "geography and every fixed feature"),
                        ("angles", "working_angles", "the working camera angles the "
                         "breakdown actually uses"),
                        ("light", "light_states", "every lighting state its scenes need"),
                        ("bounds", "camera_bounds", "the boundaries the camera never "
                         "crosses, checked visually"),
                        ("props", "hero_props", "its known hero props in place")):
            cell(c, d, f"{asset.get('descriptor','')} — {s}")
    elif kind == "prop":
        for c, d, s in (("hero", "hero", "the hero view"),
                        ("side", "side", "the side view"),
                        ("scale", "scale_with_character", "held by its owner so the scale "
                         "reads off the body, never off a measurement"),
                        ("held", "held_state", "in use, in the hands that use it"),
                        ("light", "scene_light", f"under {lights[0]}")):
            cell(c, d, f"{asset.get('descriptor','')} — {s}")
        for v in (variants or []):
            cell(f"variant-{v}", "state_variant", f"the {v} state, as its passport defines it")
    else:  # style board
        for c in ("palette", "lighting-direction", "optics", "texture",
                  "camera-movement", "edit-tempo"):
            cell(c, "style", f"the locked style's {c.replace('-', ' ')}, demonstrated")
    return cells


def stress_run_verdict(*, cells: list[dict], reviews: dict,
                       asset_revision: int, required: int) -> dict:
    """The verdict over a reviewed run. Pure; the caller persists it.

    - every cell must be reviewed — an unreviewed cell is not a pass
    - one failed cell fails the run: 10/10 means NO cell may fail
    - a run made against an older asset revision is STALE, not merely failed —
      any revision invalidates prior stress results outright
    """
    stale = [c["id"] for c in cells if c.get("asset_revision") != asset_revision]
    if stale:
        return {"verdict": "stale", "detail": f"run was made against an older revision "
                f"of the asset ({len(stale)} cells) — re-plan and re-run", "stale": stale}
    unreviewed = [c["id"] for c in cells if c["id"] not in reviews]
    if unreviewed:
        return {"verdict": "incomplete",
                "detail": f"{len(unreviewed)} of {len(cells)} cells unreviewed",
                "unreviewed": unreviewed}
    failed = [cid for cid, r in reviews.items() if not r.get("passed")]
    if failed or len(cells) < required:
        return {"verdict": "fail", "failed": failed,
                "detail": (f"{len(failed)} cells failed" if failed else
                           f"only {len(cells)} cells against a floor of {required}")
                          + " — the row stays draft and its scenes stay closed"}
    return {"verdict": "pass", "cells": len(cells),
            "detail": f"{len(cells)}/{len(cells)} — clear to lock"}


def validate_asset(*, asset: dict) -> dict:
    """Passport validation, before an asset may even enter the stress test.

    The scale check is NEG-008: heights in centimetres rendered a height ladder
    inverted. Models cannot see 118cm; they can see a shoulder.
    """
    import re
    problems = []
    if not asset.get("descriptor"):
        problems.append({"code": "NO_DESCRIPTOR",
                         "message": "an asset with no descriptor is a different "
                                    "asset in every generation"})
    if re.search(r"\b\d+\s?(cm|centimetres?|centimeters?|inches|in\.|ft|feet|metres?"
                 r"|meters?|m tall)\b", (asset.get("scale_landmark", "")
                                          + " " + asset.get("descriptor", "")).lower()):
        problems.append({"code": "SCALE_BY_NUMBER",
                         "message": "body scale uses a measurement — state it as a "
                                    "landmark: 'her head reaches his shoulder'"})
    if asset.get("type") == "character" and not asset.get("scale_landmark"):
        problems.append({"code": "NO_SCALE_LANDMARK",
                         "message": "a character with no scale landmark gets a "
                                    "different height whenever he shares a frame"})
    if asset.get("type") == "character" and not asset.get("default_expression"):
        problems.append({"code": "NO_DEFAULT_EXPRESSION",
                         "message": "an unstated face is filled in with 'pleasant' "
                                    "(NEG-002)"})
    return {"valid": not problems, "problems": problems}
