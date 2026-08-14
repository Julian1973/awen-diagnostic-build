#!/usr/bin/env python3
"""shoot.py — the shooting engine. Shot table in, gated emissions and takes out.

The pipeline this implements, in Julian's words: script → scenes → shots →
keyframe → references → audio → a prompt that scores above 9.5 → fired on
minimax, maximum fifteen seconds a shot.

    python3 engine/shoot.py keyframe --shot FR01     # keyframe prompt, for Julian
    python3 engine/shoot.py compile  --shot FR01     # write + gate the animation prompt
    python3 engine/shoot.py brief    --shot FR01     # SHOW IT ALL BEFORE ANYTHING FIRES
    python3 engine/shoot.py fire     --scene FR      # fire everything gated
    python3 engine/shoot.py assemble --scene FR      # picture + our own sound
    python3 engine/shoot.py cut      --scene FR      # join into a sequence

Nothing fires below the floor. The gate is not advisory.

WHY THE SHOT TABLE HAS A CAST BLOCK
-----------------------------------
Identity drift was never a model problem. It was that FR01 named <Tom> and
bound him to a reference sheet, while FR04 said "the man in the navy parka"
and bound him to nothing. Two shots, two different people, and the route did
exactly as it was told. Every character is now defined ONCE in shots.json's
cast block and every shot resolves against it, so a shot cannot describe a
character in its own words even if someone wants it to.
"""
from __future__ import annotations
import argparse, json, pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
P = ROOT / "projects/thistlewood/production"
SHOTS = P / "shots.json"
EM, TK, AS = P / "emissions", P / "takes", P / "assembled"
KF = ROOT / "projects/thistlewood/assets/keyframes"
SFX, VOICE = P / "sfx", P / "voice"
FLOOR = 9.5
MAX_TAKE = 15          # minimax H3 ceiling
MIN_TAKE = 5           # minimax H3 floor — shorter beats are shot at 5 and trimmed


# ─────────────────────────────────────────────────────────────────────────────
# COMPILE — resolve references, then emit the sd25-pe multi-reference template
# ─────────────────────────────────────────────────────────────────────────────

def resolve_refs(s: dict, T: dict) -> tuple[list[str], dict]:
    """Allocate image indices. Room first, cast next, props that carry their own
    sheet, blocking LAST. Returns the ordered file list and a name→index map.

    A file used twice gets ONE index. Sending Tom's sheet as both Image 2 and
    Image 5 tells the route there are two men who look identical, and it will
    occasionally draw both.
    """
    files: list[str] = []
    idx: dict[str, int] = {}

    def slot(name: str, filename: str) -> int:
        if filename in files:
            i = files.index(filename) + 1
        else:
            files.append(filename)
            i = len(files)
        idx[name] = i
        return i

    slot("__scene__", T["scene_plate"]["file"])
    for who in s.get("cast", []):
        slot(who, T["cast"][who]["file"])
    for pr in s.get("props", []):
        slot(pr, T["hero_props"][pr]["file"])
    slot("__blocking__", s["blocking"])
    return files, idx


def humans(s: dict, T: dict) -> list[str]:
    """Cast members who have a mouth. The cat does not take the speaker law."""
    return [c for c in s.get("cast", []) if c != "Macsen"]


def compile_motion(s: dict, T: dict) -> str:
    """Compile the shot's animation prompt on Seedance 2.5's ACTUAL Core Prompt
    Formula — subject and action, scene and environment, visual style, camera,
    audio — written as flowing prose.

    An earlier version of this function invented its own section labels:
    [First Frame], [Performance], [Secondary Life], [Speech], [Physics]. None of
    those exist in the guide. The skill is explicit that the descriptive content
    reads as PROSE, and that bracketed labels are only the ones its own templates
    define — [Characters]/[Props]/[Scenes]/[Motion and Audio] for multi-reference,
    [Generation Goal]/[Stage N]/[Maintain Consistency] for staged video. A single
    keyframe driving one continuous beat is the core formula, not a template, so
    the only label that survives here is [Maintain Consistency].

    The reference-role declaration up front is the guide's first-frame form.
    """
    spk = s.get("speaker")
    sp = T["scene_plate"]
    out: list[str] = []

    # Reference role, in the guide's first-frame wording.
    out.append("The supplied image is the first frame. It defines the opening composition, "
               "every subject's position and pose, the prop state, the scene and the camera "
               "direction. Animate forward from it; do not redraw it, do not restage it, and "
               "do not alter any face, hair or clothing it already contains.")
    out.append("")

    # Subject + primary action + scene, as one prose paragraph.
    where = ("the front room of Thistlewood's, an old antique restorer's shop, with its long "
             "wooden counter, its cabinets of brass and glass, and the lit workshop showing "
             "through the arch behind")
    out.append(f"In {where}, {primary_event(s)}")
    out.append("")

    # Secondary life, as prose rather than a bullet list.
    life = "; ".join(f"for {who}, {act}" for who, act in s["life"].items() if who != "the room")
    room = s["life"].get("the room")
    para = (f"Nobody in the frame is a still image, and these small movements run continuously "
            f"underneath the main action without ever competing with it: {life}.")
    if room:
        para += f" In the room itself, {room}."
    out.append(para)
    out.append("")

    # Performance, folded into prose.
    if s.get("faces"):
        out.append("The performances read as follows: "
                   + "; ".join(f"{who} is {face}" for who, face in s["faces"].items()) + ".")
        out.append("")

    # Mouths. Prose, and it says why.
    if spk:
        mouth = (f"{spk} is the only person who speaks, and the delivery is {s['delivery']}. "
                 f"Animate the mouth as natural conversational speech, the jaw and cheeks and "
                 f"head carrying a talking rhythm, but do not attempt specific words or specific "
                 f"lip shapes — the articulation is replaced from a separate recording "
                 f"afterwards and guessing at words here only fights that pass.")
    else:
        mouth = "Nobody speaks in this shot."
    others = [w for w in humans(s, T) if w != spk]
    if others and not s.get("no_faces"):
        mouth += (" " + " ".join(f"{w} does not speak: the mouth stays closed with no lip or jaw "
                                 f"movement, though {w} is never frozen — the body keeps living "
                                 f"and reacting." for w in others))
    out.append(mouth)
    out.append("")

    # Visual style — the guide's third element. Short, because the frame carries it.
    out.append(f"The visuals feature {T['style'][0].lower()}{T['style'][1:]} Weight is real "
               "throughout: a shift of balance travels through the whole body, clothing gathers "
               "and falls with the movement instead of sliding over a rigid shape, hair and "
               "loose fabric settle a beat after the body stops, and anything resting on a "
               "surface stays where it is unless a hand moves it.")
    out.append("")

    # Camera — the guide's fourth element.
    out.append(f"Use a camera that {s['camera']}, in one continuous take with no cuts, no "
               f"transitions and no change of angle at any point.")
    out.append("")

    # Audio — the guide's fifth element, with its bracket syntax.
    audio = ["Audio includes " + " ".join(T["ambience"][k] for k in s.get("sound", [])) + "."]
    if s.get("extra_sfx"):
        audio.append(s["extra_sfx"])
    if "tune" not in s.get("sound", []):
        audio.append("There is no music of any kind in this shot and nobody moves to a beat.")
    out.append(" ".join(audio))
    out.append("")

    # The one label the guide's own templates define.
    keep = ["Keep every character's identity, face, hair and clothing, the number of characters, "
            "the room layout, the counter position, the lighting and the screen direction "
            "consistent from the first frame to the last."]
    if s.get("props"):
        keep.append("The prop count never changes: there is exactly one "
                    + ", one ".join(pr.lower() for pr in s["props"])
                    + ", and it stays with whoever holds it in the first frame.")
    keep.append("Every character and animal in frame stays alive and breathing for the whole take.")
    out.append("[Maintain Consistency]")
    out.append(" ".join(keep))
    return "\n".join(out).strip() + "\n"


def primary_event(s: dict) -> str:
    """Stage 2 — what actually happens, minus the stage labels."""
    return s["stages"][1].replace("Primary event:", "").replace("End state:", "By the end:").strip()


def compile_emission(s: dict, T: dict) -> str:
    """Compile one shot into the sd25-pe multi-reference template.

    Structure is the skill's — grouped [Characters]/[Props]/[Scenes], one line
    per subject, every reference told what to use AND what not to contribute,
    dialogue in {}, effects in <>, music in (). The clock is H3's: two stages,
    never four, and reference tags are unprefixed because minimax documents
    "Image 1" where Seedance documents "@Image 1".
    """
    files, R = resolve_refs(s, T)
    out: list[str] = []
    spk = s.get("speaker")

    # ── Characters ───────────────────────────────────────────────────────────
    if s.get("cast"):
        out.append("[Characters]")
        for who in s["cast"]:
            c = T["cast"][who]
            line = f"<{who}> corresponds to Image {R[who]}. Use only {c['use']}."
            if c.get("exclude"):
                line += " " + c["exclude"]
            if s.get("wardrobe", {}).get(who):
                line += " " + T["wardrobe"][who][s["wardrobe"][who]]
            if s.get("cast_limit", {}).get(who):
                line += " " + s["cast_limit"][who]
            out.append(line)
        out.append("Every character image above is a plain reference sheet. Do not use any "
                   "of their backgrounds, their lettering or their layout — take the person "
                   "out of the sheet and put them in the room described below.")
        if len(s["cast"]) > 1:
            out.append("Do not interchange these characters' appearances, clothing, "
                       "positions, actions or dialogue. Each one is only ever himself "
                       "or herself, and no additional people appear in the room.")
            out.append("Relative size, read off the body and never off a measurement: "
                       + "; ".join(f"{w} — {T['cast'][w]['scale']}" for w in s["cast"]) + ".")
        out.append("")

    # ── Props ────────────────────────────────────────────────────────────────
    if s.get("props"):
        out.append("[Props]")
        for pr in s["props"]:
            p = T["hero_props"][pr]
            line = f"<{pr}> corresponds to Image {R[pr]}: {p['desc']}. {p['rule']}"
            # A file that defines a character AND a prop must say so, or the route
            # reads two subjects in one sheet and occasionally draws the person twice.
            shared = [w for w in s.get("cast", []) if R.get(w) == R[pr]]
            if shared:
                line += (f" Image {R[pr]} also defines <{shared[0]}>; in this shot it "
                         f"contributes the {pr.lower()} only and never a second person.")
            out.append(line)
        out.append("")

    # ── Scenes ───────────────────────────────────────────────────────────────
    sp = T["scene_plate"]
    out.append("[Scenes]")
    out.append(f"<{sp['name']}> references Image {R['__scene__']}. Use only {sp['use']}. "
               f"{sp['exclude']} There is one counter, one archway through to the workshop "
               f"and one glazed front door — never a second of any of them.")
    out.append("")

    # ── Camera and blocking ──────────────────────────────────────────────────
    out.append("[Camera and Blocking]")
    out.append(f"The camera {s['camera']}.")
    out.append(f"Image {R['__blocking__']} defines {s['blocking_use']}. Take nothing else "
               f"from it: not the room, not the furniture, not the lighting, and not any "
               f"character's face or clothing. Those come from the images named above.")
    out.append("Screen direction, held for the whole scene: the customer side of the "
               "counter is camera-left and the shopkeeper's side is camera-right. Tom and "
               "the children always look screen-right; Richard always looks screen-left.")
    out.append("")

    # ── Style ────────────────────────────────────────────────────────────────
    out.append("[Style]")
    out.append(T["style"])
    out.append("")

    # ── Audio ────────────────────────────────────────────────────────────────
    out.append("[Audio]")
    for key in s.get("sound", []):
        out.append(T["ambience"][key])
    if s.get("extra_sfx"):
        out.append(s["extra_sfx"])
    if not any(k == "tune" for k in s.get("sound", [])):
        out.append("There is no musical score of any kind in this shot — no strings, no "
                   "piano, no underscore. The only sound is the room itself.")
    else:
        out.append("There is no musical score of any kind in this shot. The only music is "
                   "the music box in frame, and it is coming out of that box.")
    if spk:
        out.append(f"Audio 1 defines <{spk}>'s voice characteristics only — timbre, age and "
                   f"accent. Take no words, no timing and no sentence from Audio 1.")
        out.append(f"Dialogue language: English, in a soft Cardiff Welsh accent. <{spk}> "
                   f"speaks {s['delivery']}, and says exactly this and nothing else: "
                   f"{{{s['line']}}}")
    else:
        out.append("No one speaks in this shot. There is no dialogue, no muttering and no "
                   "off-screen voice.")

    # The speaker law. Every mouth in frame is assigned, or one of them moves.
    if s.get("no_faces"):
        out.append("No face appears in this frame at any point.")
    else:
        for who in humans(s, T):
            if who == spk:
                continue
            out.append(f"<{who}> does not speak at any point in this shot: the mouth stays "
                       f"closed, with no lip movement and no jaw movement. <{who}> is NOT "
                       f"frozen — the body keeps living, breathing and reacting.")
    # A silent character's FACE is the last thing left undirected. Body comes from
    # [Secondary Life] and voice from the delivery note, so an unnamed expression
    # gets chosen by the model — which is how Tom came back smiling in FR14, four
    # seconds after saying he cannot get his gran's box to play a proper song.
    if s.get("faces"):
        out.append("")
        out.append("[Expression]")
        for who, face in s["faces"].items():
            out.append(f"<{who}>: {face}")
    out.append("")

    # ── Secondary life ───────────────────────────────────────────────────────
    out.append("[Secondary Life]")
    out.append("Nobody in this frame is a still image. Throughout the whole shot, "
               "continuously and independently of the main action:")
    for who, action in s["life"].items():
        out.append(f"— {who}: {action}")
    out.append("These movements are small and continuous. They never stop, and they never "
               "compete with the main action.")
    out.append("")

    # ── Anti-lineup, on group frames only ────────────────────────────────────
    if s.get("group"):
        out.append("[Group Staging]")
        out.append("The people in this frame stand at clearly different distances from "
                   "camera — someone in the foreground at the counter edge, someone in the "
                   "midground, someone further back — and each one is doing a different "
                   "physical thing with a different object. They are NOT standing in a row, "
                   "NOT evenly spaced, and NOT all facing the same way.")
        out.append("")

    # ── Ritual, where canon defines the gesture word for word ────────────────
    if s.get("ritual"):
        out.append("[Ritual]")
        out.append(s["ritual"])
        out.append("")

    # ── Event script ─────────────────────────────────────────────────────────
    out.append("[Event Script]")
    for i, st in enumerate(s["stages"], start=1):
        out.append(f"Stage {i}: {st}")
    out.append("")

    # ── Consistency ──────────────────────────────────────────────────────────
    keep = ["Keep every character exactly as their own reference image defines them and "
            "never interchange them."]
    if s.get("props"):
        keep.append("Keep the prop count and its ownership unchanged for the whole shot: "
                    + "; ".join(f"exactly one <{pr}>" for pr in s["props"]) + ".")
    keep.append("Keep the room layout, the counter position and the warm interior lighting "
                "unchanged from first frame to last.")
    keep.append("Keep the speaker relationship consistent: only the character named as "
                "speaking ever opens their mouth.")
    keep.append("Everyone in frame stays alive and breathing for the entire shot. No "
                "character and no animal is ever a frozen image.")
    out.append("[Maintain Consistency]")
    out.append(" ".join(keep))

    return "\n".join(out).strip() + "\n"


# ─────────────────────────────────────────────────────────────────────────────
# THE GATE — sd25-pe conformance, not taste
# ─────────────────────────────────────────────────────────────────────────────
# Every check below is a line from the seedance-prompt-optimizer's own
# pre-submission checklist or from the continuity gate, expressed as something
# a machine can verify. Passing this is a necessary condition for firing, not a
# sufficient one: a shot still gets read by a human before it goes in the cut.

INTERIOR = ("realises", "remembers", "understands that", "has understood", "feels sad",
            "feels happy", "is nervous", "wants to", "is thinking", "is listening intently",
            "recognising", "not understanding", "knowing that")

# A character is named or they are not in this show. "The old man" and "the man in
# the navy parka" are how FR02–FR17 were written before this rebuild, and they are
# exactly why the faces drifted: an unnamed character is bound to no reference.
ANONYMOUS = ("the old man", "the man in the navy parka", "the boy in the brown jumper",
             "the girl in the green cardigan", "the girl with the red braid",
             "the very small girl", "the small girl")
PARAMS = ("768p", "480p", "16:9", "resolution", "seconds long", "fps", "aspect ratio")
BRANDS = ("ghibli", "pixar", "disney", "aardman", "cbeebies")


def audio_seconds(path: pathlib.Path) -> float:
    """Length of a voice file, in seconds. 0.0 if it is not there."""
    if not path.exists():
        return 0.0
    import imageio_ffmpeg
    r = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-i", str(path)],
                       capture_output=True)
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", r.stderr.decode())
    return (int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])) if m else 0.0


def compile_keyframe(s: dict, T: dict) -> str:
    """Compile the shot's KEYFRAME PROMPT — the still that the animation runs from.

    This is a description of ONE FROZEN MOMENT: the first frame of the shot.
    No motion verbs, no dialogue, no 'then', no 'as he speaks'. Everything is a
    state — who is standing where, holding what, facing which way, wearing what.
    If it describes a change, the image model draws the change as a blur or
    draws the end of it, and the shot starts in the wrong place.
    """
    out: list[str] = []
    sp, spk = T["scene_plate"], s.get("speaker")

    out.append(f"# {s['id']} — KEYFRAME")
    out.append("")
    out.append("A single still frame from a hand-drawn 2D animated children's series: the "
               "FIRST frame of a shot. One moment, frozen. Not a poster, not a montage, no "
               "panels, no text anywhere in the image.")
    out.append("")

    # Chain-linking. Two different jobs, and confusing them is how a reverse
    # ends up looking like a jump cut of the same angle.
    ch = s.get("chain")
    if ch:
        out.append("## Continuity — chain-linked")
        if ch["mode"] == "continue":
            out.append(f"START FROM the last frame of {ch['from']} (supplied as a reference; if "
                       f"that take is not shot yet, use {ch['from']}'s keyframe). "
                       f"The camera has not cut: this is the same angle continuing, so the "
                       f"framing, the dressing, the light and every prop position carry over "
                       f"exactly. Change only what this shot's positions below say changed.")
        else:
            out.append(f"The last frame of {ch['from']} — or {ch['from']}'s own keyframe if that "
                       f"take is not shot yet — is supplied as a CONTINUITY reference "
                       f"only. The camera HAS cut, so do not copy its framing — take from it "
                       f"the state of the room and the props: what is on the counter, where "
                       f"the box and cloth are, how the lamps are lit, who is holding what. "
                       f"The framing comes from the Framing section below.")
        out.append("")

    out.append("## The room")
    out.append(f"{sp['use'][0].upper()}{sp['use'][1:]}. {sp['lock']} {sp['exclude']}")
    out.append("")

    out.append("## Who is in frame, and where")
    for who in s.get("cast", []):
        c = T["cast"][who]
        bits = [f"**{who}** — {c['use']}."]
        if c.get("exclude"):
            bits.append(c["exclude"])
        if s.get("wardrobe", {}).get(who):
            bits.append(T["wardrobe"][who][s["wardrobe"][who]])
        bits.append(f"Scale: {c['scale']}.")
        if s.get("faces", {}).get(who):
            bits.append(f"Expression: {s['faces'][who]}.")
        if s.get("cast_limit", {}).get(who):
            bits.append(s["cast_limit"][who])
        out.append(" ".join(bits))
        out.append("")

    out.append("## Positions at the top of the shot")
    out.append(opening_state(s))
    out.append("")

    if s.get("props"):
        out.append("## Props")
        for pr in s["props"]:
            p = T["hero_props"][pr]
            out.append(f"**{pr}** — {p['desc']}. {p['rule']}")
        out.append("")

    out.append("## Framing")
    fr = s["blocking_use"].split("—", 1)[-1].strip()
    out.append(fr[0].upper() + fr[1:])
    out.append("Screen direction: the customer side of the counter is camera-LEFT and the "
               "shopkeeper's side is camera-RIGHT. Tom and the children face screen-right; "
               "Richard faces screen-left.")
    out.append("")

    out.append("## Style")
    out.append(T["style"])
    out.append("")

    out.append("## Do not")
    out.append("No motion blur and no action lines — this is a held frame. "
               + ("Every mouth in this frame is CLOSED; nobody is mid-word."
                  if not spk else
                  f"{spk} has not started speaking yet — the mouth is closed and about to "
                  f"open. Every other mouth is closed.")
               + " No text, lettering, signage or watermark anywhere in the image. No 3D "
                 "render, no photorealism, no painterly brushwork. No extra people beyond "
                 "those named above.")
    return "\n".join(out).strip() + "\n"


def opening_state(s: dict) -> str:
    """Stage 1 of the event script, stripped of its label — the frozen moment."""
    txt = s["stages"][0]
    return txt.split("Opening state:", 1)[-1].strip()


def gate_motion(text: str, s: dict, T: dict) -> tuple[float, list[str]]:
    """The gate for the ANIMATION prompt, which is a different document from the
    old reference-to-video emission and needs different checks.

    Two of these are new and exist because the pipeline changed underneath us:
    a motion prompt must carry NO dialogue (the words are an audio file now) and
    NO appearance (the keyframe holds it, and restating it invites a redraw).
    """
    t = text.lower()
    spk = s.get("speaker")
    silent = [w for w in humans(s, T) if w != spk]
    vdir = VOICE / s.get("voice_dir", "EP01_v3")

    # Words that describe how somebody LOOKS. In this prompt they are a defect:
    # the first frame already answers them, and answering them twice is how a
    # face drifts mid-take.
    APPEARANCE = ("waistcoat", "parka", "jumper", "cardigan", "dungarees",
                  "white beard", "gold-rimmed", "braids", "strawberry-blonde",
                  "corresponds to image", "use only")

    checks = {
        "no dialogue text in the prompt":
            (not s.get("line")) or (s["line"].lower() not in t),
        "no dialogue braces": "{" not in text and "}" not in text,
        "no appearance description — the keyframe holds it":
            not any(k in t for k in APPEARANCE),
        "the first frame is declared authoritative, with one stated role":
            "the supplied image is the first frame" in t and "do not redraw it" in t,
        "the take is declared continuous — no invented cuts":
            "one continuous take with no cuts" in t,
        "physics described concretely, not named": "weight is real" in t,
        # The guide's Core Prompt Formula, element by element. An earlier version
        # of the compiler invented [First Frame]/[Performance]/[Secondary Life]/
        # [Speech]/[Physics] labels that appear nowhere in it.
        "core formula: visual style stated": "the visuals feature" in t,
        "core formula: camera stated": "use a camera that" in t,
        "core formula: audio stated": "audio includes" in t,
        "no invented section labels":
            not any(k in text for k in ("[First Frame]", "[Performance]", "[Secondary Life]",
                                        "[Speech]", "[Physics]", "[Subject and Action]",
                                        "[Camera]", "[Audio]")),
        "only the guide's own labels are used":
            all(lbl in ("[Maintain Consistency]", "[Generation Goal]", "[Characters]",
                        "[Props]", "[Scenes]", "[Motion and Audio]")
                for lbl in re.findall(r"^\[[^\]]+\]", text, re.M)),
        "camera has a stated behaviour": "the camera " in t,
        "speaker named or silence declared":
            bool(spk) or "nobody speaks in this shot" in t,
        "every silent character explicitly closed":
            s.get("no_faces", False) or
            all(f"{w} does not speak" in text for w in silent),
        "silent characters are not frozen":
            s.get("no_faces", False) or (not silent) or "is never frozen" in text,
        "ambience specified": "<the quiet room tone" in t,
        "music excluded unless the box is playing":
            ("tune" in s.get("sound", [])) or "no music of any kind" in t,
        "every cast member has a secondary-life line":
            all(any(w in k for k in s["life"]) for w in s.get("cast", []))
            or s.get("no_faces", False),
        "no generation parameters": not any(k in t for k in PARAMS),
        "no interior states without a visible cue": not any(k in t for k in INTERIOR),
        "every character named, never described anonymously":
            not any(k in t for k in ANONYMOUS),
        "no studio or brand names": not any(k in t for k in BRANDS),
        "take length inside the route's range": MIN_TAKE <= s["sec"] <= MAX_TAKE,
        "the recorded line fits inside the take":
            (not s.get("voice_ref")) or
            audio_seconds(vdir / s["voice_ref"]) <= (s.get("cut_to") or s["sec"]),
        # Prose runs longer than the old fragment form for the same content, and
        # Julian wants full shot prompts. The ceiling is here to stop the prompt
        # re-describing the picture, not to keep it thin.
        "prompt does not run away into re-describing the picture": len(text) <= 4800,
    }
    fails = [k for k, v in checks.items() if not v]
    return max(0.0, round(10 - 1.5 * len(fails), 2)), fails


def gate(text: str, s: dict, T: dict) -> tuple[float, list[str]]:
    t = text.lower()
    files, R = resolve_refs(s, T)
    declared = set(range(1, len(files) + 1))
    cited = {int(n) for n in re.findall(r"\bImage (\d+)\b", text)}
    spk = s.get("speaker")
    silent = [w for w in humans(s, T) if w != spk]

    checks = {
        # — reference integrity —
        "every cited Image index is a real reference": cited <= declared,
        "every supplied reference is cited in the text": declared <= cited,
        "one file, one index (no duplicate references)": len(files) == len(set(files)),
        "reference count within the stable range (≤8)": len(files) <= 8,
        "every character bound to exactly one image":
            all(f"<{w}> corresponds to Image " in text for w in s.get("cast", [])),
        "every reference states what NOT to contribute":
            text.count("Do not") >= 2 and "Take nothing else from it" in text,
        "every prop named and bound":
            all(f"<{pr}> corresponds to Image " in text for pr in s.get("props", [])),
        "scene bound and its people excluded":
            "references Image " in text and "Do not take any people from this image" in text,
        "blocking reference is roled as blocking only":
            "defines the camera position and the staging only" in t,

        # — script authority —
        "scripted line present and verbatim":
            (not s.get("line")) or (s["line"] in text),
        "dialogue is in braces": (not s.get("line")) or (f"{{{s['line']}}}" in text),
        "voice reference declared when there is a line":
            (not s.get("line")) or "Take no words, no timing and no sentence from Audio 1" in text,

        # — the speaker law —
        "every mouth in frame is assigned":
            s.get("no_faces", False) or bool(spk) or "No one speaks in this shot" in text,
        "every silent character explicitly closed":
            s.get("no_faces", False) or
            all(f"<{w}> does not speak at any point" in text for w in silent),
        "silent characters are not frozen":
            s.get("no_faces", False) or (not silent) or "is never frozen" in text,

        # — audio —
        "ambience specified (the route generates its own or invents one)":
            "<the quiet room tone" in t,
        "score explicitly excluded": "no musical score" in t,
        "music in parentheses when there is music":
            ("tune" not in s.get("sound", [])) or "(a small worn music box plays" in text,

        # — staging —
        "group frames carry depth, verbs and an anti-lineup negative":
            (not s.get("group")) or ("NOT standing in a row" in text
                                     and "different distances from camera" in text),
        "scale given by body landmark, never by number":
            not re.search(r"\b\d+\s?(cm|centimetres|inches|feet|ft|metres)\b", t),

        # — life —
        "every named subject has a secondary-life line":
            all(any(k.startswith(w) or w in k for k in s["life"])
                for w in s.get("cast", [])) or s.get("no_faces", False),
        "life block present and continuous":
            "They never stop" in text,

        # — event script —
        "two stages, each with a state": len(s["stages"]) == 2,
        "stage 1 gives an opening state": s["stages"][0].startswith("Opening state:"),
        "stage 2 gives a primary event and an end state":
            "Primary event:" in s["stages"][1] and "End state:" in s["stages"][1],

        # — style —
        "style injected verbatim": T["style"] in text,

        # — hygiene —
        "no generation parameters in the prompt": not any(k in t for k in PARAMS),
        "no interior states without a visible cue": not any(k in t for k in INTERIOR),
        "every character is named, never described anonymously":
            not any(k in t for k in ANONYMOUS),
        "shared reference files declare both subjects":
            all(f"Image {R[pr]} also defines" in text
                for pr in s.get("props", [])
                if any(R.get(w) == R[pr] for w in s.get("cast", []))),
        "no studio or brand names": not any(k in t for k in BRANDS),
        # H3's own ceiling is 50,000 characters. This is a QUALITY ceiling, not the
        # route's: past roughly this length the later sections start losing to the
        # earlier ones. A six-character group frame legitimately costs 9k.
        "under the working prompt ceiling": len(text) <= 11000,

        # — clock —
        "take length inside the route's range": MIN_TAKE <= s["sec"] <= MAX_TAKE,
        # The route rejects reference audio under 2.0s and says so only in a
        # stderr the batch swallows. FR08, FR16 and FR17 all vanished this way.
        "reference audio meets the route's 2.0s minimum":
            (not s.get("voice_ref")) or
            audio_seconds(VOICE / s.get("voice_dir", "EP01_v3")
                          / (s.get("route_ref") or s["voice_ref"])) >= 2.0,
        "the recorded line fits inside the take":
            (not s.get("voice_ref")) or
            audio_seconds(VOICE / s.get("voice_dir", "EP01_v3") / s["voice_ref"])
            <= (s.get("cut_to") or s["sec"]),
    }
    fails = [k for k, v in checks.items() if not v]
    return round(10 - 1.5 * len(fails), 2), fails


# ─────────────────────────────────────────────────────────────────────────────

def table() -> dict:
    return json.loads(SHOTS.read_text())


def load(T: dict, scene: str) -> list[dict]:
    return [s for s in T["shots"] if s["id"].startswith(scene) and not s.get("skip")]


def cmd_compile(a):
    EM.mkdir(parents=True, exist_ok=True)
    T = table()
    ok = bad = 0
    shots = ([s for s in T["shots"] if s["id"] == a.shot] if a.shot else load(T, a.scene))
    for s in shots:
        text = compile_motion(s, T)
        score, fails = gate_motion(text, s, T)
        (EM / f"{s['id']}.txt").write_text(text)
        # The reference set is now ONE image: the keyframe Julian generated. The
        # audio no longer travels to the video route at all - it goes to the
        # lipsync pass afterwards, so no 2.0s minimum applies to it any more.
        (EM / f"{s['id']}.refs.json").write_text(json.dumps(
            {"keyframe": f"{s['id']}.png", "sec": s["sec"],
             "voice_ref": s.get("voice_ref"),
             "voice_dir": s.get("voice_dir", "EP01_v3"),
             "cut_to": s.get("cut_to")}, indent=1))
        flag = "CLEARED" if score >= FLOOR else "REFUSED"
        print(f"  {s['id']:<8} {score:>5.2f}  {flag}  {s['sec']:>2}s  {len(text)} chars"
              + (f"\n{'':>12}← " + "\n".join(f"{'':>14}{f}" for f in fails).lstrip()
                 if fails else ""))
        ok, bad = (ok + 1, bad) if score >= FLOOR else (ok, bad + 1)
    print(f"\n{ok} cleared · {bad} refused · floor {FLOOR}")
    if bad:
        sys.exit(f"REFUSED {bad} shot(s). Fix the shot table; nothing fires below the floor.")


def cmd_keyframe(a):
    """Write the keyframe prompt(s) — what Julian generates the first frame from.

    --shot FR01 for one beat; --scene FR for the lot. Beat by beat is the house
    default: a keyframe that is wrong costs a re-prompt, and a keyframe that is
    wrong and already animated costs a re-render.
    """
    KFP = P / "keyframe_prompts"
    KFP.mkdir(parents=True, exist_ok=True)
    T = table()
    shots = ([s for s in T["shots"] if s["id"] == a.shot] if a.shot
             else load(T, a.scene))
    if not shots:
        sys.exit(f"no shot matched {a.shot or a.scene}")
    for s in shots:
        text = compile_keyframe(s, T)
        (KFP / f"{s['id']}.md").write_text(text)
        refs = [T["scene_plate"]["file"]]
        for w in s.get("cast", []):
            refs += T["cast"][w].get("sheets", [T["cast"][w]["file"]])
        if s.get("chain"):
            refs.append(f"last frame of {s['chain']['from']} (or its keyframe)")
        print(f"  {s['id']:<8} keyframe prompt written · references: {', '.join(dict.fromkeys(refs))}")



def cmd_brief(a):
    """Everything that is about to be sent, printed for approval BEFORE it fires.

    Julian asked to see the prompt and the references before anything is fired,
    and he is right that it should not depend on me remembering. This prints the
    exact bytes that go to the route: which image, which audio, which route,
    which duration, the gate score, and the prompt in full. Nothing here is a
    summary or a paraphrase - if it is not in this output it is not being sent,
    and if it is in this output it is.
    """
    T = table()
    KFR, SY = P / "keyframes", P / "synced"
    shots = ([s for s in T["shots"] if s["id"] == a.shot] if a.shot else load(T, a.scene))
    for s in shots:
        kf = KFR / f"{s['id']}.png"
        text = compile_motion(s, T)          # fresh, never off disk
        EM.mkdir(parents=True, exist_ok=True)
        (EM / f"{s['id']}.txt").write_text(text)
        score, fails = gate_motion(text, s, T)
        vdir = VOICE / s.get("voice_dir", "EP01_v3")
        line = vdir / s["voice_ref"] if s.get("voice_ref") else None

        print("=" * 78)
        print(f"{s['id']}  —  FIRING BRIEF")
        print("=" * 78)
        print(f"  route      minimax/h3/image-to-video · 768P · {s['sec']}s"
              + (f" · trimmed to {s['cut_to']}s in assembly" if s.get("cut_to") else ""))
        print(f"  keyframe   {kf.name}  {'✓ present' if kf.exists() else '✗ MISSING — cannot fire'}")
        print(f"  gate       {score:.2f}  {'CLEARED' if score >= FLOOR else 'REFUSED — ' + ', '.join(fails)}")
        print()
        print("  IMAGES SENT TO THE VIDEO ROUTE")
        print(f"    1. {kf}" if kf.exists() else "    (none — waiting on the keyframe)")
        print("    The character sheets and the room plate are NOT sent here. They were")
        print("    references for the keyframe; the keyframe now carries what they gave it.")
        print()
        print("  AUDIO")
        if line:
            secs = audio_seconds(line)
            print(f"    {line.name}  ({secs:.2f}s, lead-in {s.get('lead_in', 0.5)}s)")
            print(f"    Goes to the SYNC stage, not to the video route.")
            box = s.get("speaker_box")
            print(f"    Speaker box: {box} — {s['speaker']} alone, so the sync cannot"
                  if box else f"    No speaker box — whole frame goes to sync.")
            if box:
                print(f"    pick the wrong face.")
        elif s.get("vo"):
            print(f"    {s['vo']} laid in at assembly (listener shot — nobody speaks on camera)")
        else:
            print("    none — this shot has no line")
        print()
        print("  SOUND LAID UNDER AT ASSEMBLY")
        beds = ["room_bed_120s.mp3 @ 0.16"]
        if "tune" in s.get("sound", []): beds.append("wrong_tune_musicbox_v2.mp3 @ 0.32")
        if s.get("bell"): beds.append(f"shop_door_bell.mp3 @ 0.5, {s['bell']}s in")
        print("    " + "\n    ".join(beds))
        print()
        if s.get("chain"):
            print(f"  CONTINUITY   chained {s['chain']['mode']} from {s['chain']['from']}")
            print()
        print("  PROMPT SENT, IN FULL")
        print("  " + "-" * 74)
        for ln in text.rstrip().splitlines():
            print("  " + ln if ln else "")
        print("  " + "-" * 74)
        print()


def cmd_fire(a):
    """Animate the keyframe. One image in, no audio — the voice arrives at sync."""
    TK.mkdir(parents=True, exist_ok=True)
    T = table()
    KFR = P / "keyframes"
    procs = []
    shots = ([s for s in T["shots"] if s["id"] == a.shot] if a.shot else load(T, a.scene))
    for s in shots:
        out = TK / f"{s['id']}.mp4"
        kf = KFR / f"{s['id']}.png"
        em = EM / f"{s['id']}.txt"
        em.parent.mkdir(parents=True, exist_ok=True)
        em.write_text(compile_motion(s, T))   # recompile at the point of firing
        if not kf.exists():
            print(f"  {s['id']:<8} no keyframe at {kf.name} — waiting on it"); continue
        if out.exists() and not a.force:
            print(f"  {s['id']:<8} already shot — skipping"); continue
        score, _ = gate_motion(em.read_text(), s, T)
        if score < FLOOR:
            print(f"  {s['id']:<8} REFUSED at {score} — not firing"); continue
        cmd = [sys.executable, str(ROOT / "engine/fire.py"), "render", "--model", "minimax",
               "--prompt", str(em), "--image", str(kf),
               "--resolution", "768P", "--duration", str(s["sec"]), "--out", str(out)]
        print(f"  {s['id']:<8} firing {s['sec']}s from {kf.name}")
        procs.append((s["id"], subprocess.Popen(cmd, stdout=subprocess.DEVNULL,
                                                stderr=subprocess.PIPE)))
    for sid, p_ in procs:
        err = p_.communicate()[1].decode()[-200:]
        print(f"  {sid:<8} {'✓' if p_.returncode == 0 else '✗ ' + err}")


def cmd_sync(a):
    """Drive the speaker's mouth from our recording, and force it onto the RIGHT face.

    The sync service takes a video and an audio file, finds a face, and animates
    it. It never sees the animation prompt, and not one of the five routes fal
    offers has a parameter for choosing which face — so on a two-shot it picks
    whichever it likes. On FR01 it picked Richard and animated him saying Tom's
    line, which is the exact fault the speaker law exists to prevent, arriving
    one stage later than the law can reach.

    So the shot table declares a speaker_box: the region of frame containing the
    speaker and nobody else. We cut that region out, upscale it so the face is
    big enough for the model to work with, sync it, scale it back and lay it over
    the take at the coordinates it came from. Only the mouth changed inside that
    rectangle, so everything around it lands back on identical pixels.
    """
    import imageio_ffmpeg
    FF = imageio_ffmpeg.get_ffmpeg_exe()
    T = table()
    SY = P / "synced"; SY.mkdir(parents=True, exist_ok=True)
    tmp = P / "_sync_tmp"; tmp.mkdir(exist_ok=True)
    shots = ([s for s in T["shots"] if s["id"] == a.shot] if a.shot else load(T, a.scene))
    for s in shots:
        take = TK / f"{s['id']}.mp4"
        if not take.exists() or not s.get("voice_ref"):
            print(f"  {s['id']:<8} no take or no line — skipping"); continue
        vdir = VOICE / s.get("voice_dir", "EP01_v3")
        lead = s.get("lead_in", 0.5)
        pad = tmp / f"{s['id']}_line.wav"
        subprocess.run([FF, "-y", "-i", str(vdir / s["voice_ref"]),
                        "-af", f"adelay={int(lead*1000)}|{int(lead*1000)},apad",
                        "-t", str(s["sec"]), str(pad)], capture_output=True, check=True)

        box = s.get("speaker_box")
        if box:
            x, y, w, h = box
            crop = tmp / f"{s['id']}_crop.mp4"
            subprocess.run([FF, "-y", "-i", str(take),
                            "-vf", f"crop={w}:{h}:{x}:{y},scale={w*2}:{h*2}:flags=lanczos",
                            "-an", "-c:v", "libx264", "-crf", "16", str(crop)],
                           capture_output=True, check=True)
            src = crop
        else:
            src = take

        out_sync = tmp / f"{s['id']}_synced.mp4"
        r = subprocess.run([sys.executable, str(ROOT / "engine/fire.py"), "lipsync",
                            "--video", str(src), "--audio", str(pad),
                            "--quality", "lipsync-2-pro", "--out", str(out_sync)],
                           capture_output=True)
        if r.returncode:
            print(f"  {s['id']:<8} ✗ sync failed: {r.stderr.decode()[-160:]}"); continue

        final = SY / f"{s['id']}.mp4"
        if box:
            x, y, w, h = box
            r = subprocess.run([FF, "-y", "-i", str(take), "-i", str(out_sync),
                                "-filter_complex",
                                f"[1:v]scale={w}:{h}:flags=lanczos[c];"
                                f"[0:v][c]overlay={x}:{y}:shortest=1[v]",
                                "-map", "[v]", "-map", "1:a", "-c:v", "libx264", "-crf", "17",
                                "-c:a", "aac", "-t", str(s["sec"]), str(final)],
                               capture_output=True)
        else:
            r = subprocess.run([FF, "-y", "-i", str(out_sync), "-c", "copy", str(final)],
                               capture_output=True)
        print(f"  {s['id']:<8} {'✓ synced' + (' (boxed)' if box else '') if r.returncode == 0 else '✗ ' + r.stderr.decode()[-160:]}")


def cmd_assemble(a):
    """Lay the sound bed under the picture.

    Picture comes from synced/ when the shot has a line — that file already
    carries our recording as its audio, because the sync stage put it there. It
    comes from takes/ when nobody speaks. Either way the route's own generated
    audio never reaches the cut.
    """
    import imageio_ffmpeg
    FF = imageio_ffmpeg.get_ffmpeg_exe()
    AS.mkdir(parents=True, exist_ok=True)
    T = table()
    SY = P / "synced"
    shots = ([s for s in T["shots"] if s["id"] == a.shot] if a.shot else load(T, a.scene))
    for s in shots:
        synced, take = SY / f"{s['id']}.mp4", TK / f"{s['id']}.mp4"
        vid = synced if synced.exists() else take
        if not vid.exists():
            print(f"  {s['id']:<8} no picture — skipping"); continue
        has_voice = synced.exists()
        n, inputs, filt, labels = 1, ["-i", str(vid)], [], []
        if has_voice:
            filt.append("[0:a]volume=1.0[vo]"); labels.append("[vo]")
        # a listener shot carries the previous speaker's line, laid in here
        if s.get("vo") and not has_voice:
            src = VOICE / s.get("vo_dir", "EP01_v3") / s["vo"]
            pre = []
            if s.get("vo_ss") is not None: pre += ["-ss", str(s["vo_ss"])]
            if s.get("vo_t") is not None:  pre += ["-t", str(s["vo_t"])]
            inputs += pre + ["-i", str(src)]
            d = int(s.get("lead_in", 0.5) * 1000)
            filt.append(f"[{n}:a]volume=1.0,adelay={d}|{d}[lvo]"); labels.append("[lvo]"); n += 1
        inputs += ["-stream_loop", "-1", "-i", str(SFX / "room_bed_120s.mp3")]
        filt.append(f"[{n}:a]volume=0.16,atrim=0:{s['sec']},asetpts=N/SR/TB[tone]")
        labels.append("[tone]"); n += 1
        if "tune" in s.get("sound", []):
            inputs += ["-stream_loop", "-1", "-i", str(SFX / "wrong_tune_musicbox_v2.mp3")]
            filt.append(f"[{n}:a]volume=0.32,atrim=0:{s['sec']},asetpts=N/SR/TB[box]")
            labels.append("[box]"); n += 1
        if s.get("bell"):
            inputs += ["-i", str(SFX / "shop_door_bell.mp3")]
            d = int(s["bell"] * 1000)
            filt.append(f"[{n}:a]volume=0.5,adelay={d}|{d}[bell]"); labels.append("[bell]"); n += 1
        filt.append(f"{''.join(labels)}amix=inputs={len(labels)}:normalize=0[a]")
        length = s.get("cut_to") or s["sec"]
        r = subprocess.run([FF, "-y", *inputs, "-filter_complex", ";".join(filt),
                            "-map", "0:v", "-map", "[a]", "-c:v", "libx264", "-crf", "17",
                            "-c:a", "aac", "-t", str(length), str(AS / f"{s['id']}.mp4")],
                           capture_output=True)
        print(f"  {s['id']:<8} {'✓ assembled' if r.returncode == 0 else '✗ ' + r.stderr.decode()[-160:]}")


def cmd_cut(a):
    import imageio_ffmpeg
    FF = imageio_ffmpeg.get_ffmpeg_exe()
    T = table()
    shots = [s for s in T["shots"] if s["id"].startswith(a.scene)
             and (AS / f"{s['id']}.mp4").exists()]
    if not shots:
        sys.exit("nothing assembled to cut")
    lst = P / f"_cut_{a.scene}.txt"
    lst.write_text("".join(f"file '{(AS / (s['id'] + '.mp4')).resolve()}'\n" for s in shots))
    out = P / f"SEQUENCE_{a.scene}.mp4"
    r = subprocess.run([FF, "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
                        "-c:v", "libx264", "-crf", "18", "-preset", "medium",
                        "-c:a", "aac", "-b:a", "192k", str(out)], capture_output=True)
    lst.unlink(missing_ok=True)
    runtime = sum(s.get("cut_to", s["sec"]) for s in shots)
    print(f"  {'✓' if r.returncode == 0 else '✗'} {out.name} — {len(shots)} shots, {runtime}s")
    if r.returncode: print(r.stderr.decode()[-400:])


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name, fn in (("keyframe", cmd_keyframe), ("compile", cmd_compile),
                     ("brief", cmd_brief), ("fire", cmd_fire), ("sync", cmd_sync),
                     ("assemble", cmd_assemble), ("cut", cmd_cut)):
        p = sub.add_parser(name)
        p.add_argument("--scene", default="FR")
        p.add_argument("--shot", help="one shot id, for working a scene beat by beat")
        p.add_argument("--force", action="store_true")
        p.set_defaults(func=fn)
    a = ap.parse_args()
    a.func(a)


if __name__ == "__main__":
    main()
