#!/usr/bin/env python3
"""shoot.py — the shooting engine. Shot table in, gated emissions and takes out.

The pipeline this implements, in Julian's words: script → scenes → shots →
keyframe → references → audio → a prompt that scores above 9.5 → fired on
minimax, maximum fifteen seconds a shot.

    python3 engine/shoot.py compile  --scene FR      # write + gate emissions
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
            s.get("no_faces", False) or (not silent) or "is NOT frozen" in text,

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
    for s in load(T, a.scene):
        text = compile_emission(s, T)
        score, fails = gate(text, s, T)
        files, _ = resolve_refs(s, T)
        (EM / f"{s['id']}.txt").write_text(text)
        (EM / f"{s['id']}.refs.json").write_text(json.dumps(
            {"images": files, "sec": s["sec"], "voice_ref": s.get("voice_ref"),
             "voice_dir": s.get("voice_dir", "EP01_v3")}, indent=1))
        flag = "CLEARED" if score >= FLOOR else "REFUSED"
        print(f"  {s['id']:<8} {score:>5.2f}  {flag}  {s['sec']:>2}s  {len(files)} refs"
              + (f"\n{'':>12}← " + "\n".join(f"{'':>14}{f}" for f in fails).lstrip()
                 if fails else ""))
        ok, bad = (ok + 1, bad) if score >= FLOOR else (ok, bad + 1)
    print(f"\n{ok} cleared · {bad} refused · floor {FLOOR}")
    if bad:
        sys.exit(f"REFUSED {bad} shot(s). Fix the shot table; nothing fires below the floor.")


def cmd_fire(a):
    TK.mkdir(parents=True, exist_ok=True)
    T = table()
    procs = []
    for s in load(T, a.scene):
        em, out = EM / f"{s['id']}.txt", TK / f"{s['id']}.mp4"
        refs = json.loads((EM / f"{s['id']}.refs.json").read_text())
        if out.exists() and not a.force:
            print(f"  {s['id']:<8} already shot — skipping"); continue
        score, _ = gate(em.read_text(), s, T)
        if score < FLOOR:
            print(f"  {s['id']:<8} REFUSED at {score} — not firing"); continue
        cmd = [sys.executable, str(ROOT / "engine/fire.py"), "render", "--model", "h3",
               "--prompt", str(em)]
        for f in refs["images"]:
            cmd += ["--image", str(KF / f)]
        if refs.get("voice_ref"):
            cmd += ["--audio", str(VOICE / refs["voice_dir"] / refs["voice_ref"])]
        cmd += ["--resolution", "768P", "--duration", str(s["sec"]), "--out", str(out)]
        print(f"  {s['id']:<8} firing {s['sec']}s · {len(refs['images'])} refs")
        procs.append((s["id"], subprocess.Popen(cmd, stdout=subprocess.DEVNULL,
                                                stderr=subprocess.PIPE)))
    for sid, p in procs:
        err = p.communicate()[1].decode()[-200:]
        print(f"  {sid:<8} {'✓' if p.returncode == 0 else '✗ ' + err}")


def cmd_assemble(a):
    """Picture from the route, sound from us.

    The route's generated speech is DISCARDED — only the video stream is mapped.
    Its value was making the mouth articulate roughly the right words; the voice
    that reaches the cut is always our own ElevenLabs v3 recording.
    """
    import imageio_ffmpeg
    FF = imageio_ffmpeg.get_ffmpeg_exe()
    AS.mkdir(parents=True, exist_ok=True)
    T = table()
    for s in load(T, a.scene):
        vid = TK / f"{s['id']}.mp4"
        if not vid.exists():
            print(f"  {s['id']:<8} no take — skipping"); continue
        vdir = VOICE / s.get("voice_dir", "EP01_v3")
        line_file = s.get("voice_ref") or s.get("vo")
        inputs, filt, n = ["-i", str(vid)], [], 1
        if line_file:
            pre = []
            if s.get("vo_ss") is not None: pre += ["-ss", str(s["vo_ss"])]
            if s.get("vo_t") is not None:  pre += ["-t", str(s["vo_t"])]
            src = VOICE / s.get("vo_dir", s.get("voice_dir", "EP01_v3")) / line_file
            inputs += pre + ["-i", str(src)]
            d = s.get("vo_delay", 400)
            filt.append(f"[{n}:a]volume=1.0,adelay={d}|{d}[vo]"); n += 1
        inputs += ["-i", str(SFX / "shop_room_tone.mp3")]
        filt.append(f"[{n}:a]volume=0.18,atrim=0:{s['sec']},asetpts=N/SR/TB[tone]"); n += 1
        labels = (["[vo]"] if line_file else []) + ["[tone]"]
        # The music box is diegetic — it is the only music in Act One and it comes
        # out of the box in frame, so it rides under the dialogue rather than over it.
        if "tune" in s.get("sound", []):
            inputs += ["-i", str(SFX / "wrong_tune_musicbox_v2.mp3")]
            filt.append(f"[{n}:a]volume=0.34,atrim=0:{s['sec']},asetpts=N/SR/TB[box]")
            labels.append("[box]"); n += 1
        filt.append(f"{''.join(labels)}amix=inputs={len(labels)}:normalize=0[a]")
        out = AS / f"{s['id']}.mp4"
        trim = ["-t", str(s["cut_to"])] if s.get("cut_to") else []
        vcodec = ["-c:v", "libx264", "-crf", "18"] if s.get("cut_to") else ["-c:v", "copy"]
        r = subprocess.run([FF, "-y", *inputs, "-filter_complex", ";".join(filt),
                            "-map", "0:v", "-map", "[a]", *vcodec, "-c:a", "aac",
                            *trim, "-shortest", str(out)], capture_output=True)
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
    for name, fn in (("compile", cmd_compile), ("fire", cmd_fire),
                     ("assemble", cmd_assemble), ("cut", cmd_cut)):
        p = sub.add_parser(name)
        p.add_argument("--scene", required=True)
        p.add_argument("--force", action="store_true")
        p.set_defaults(func=fn)
    a = ap.parse_args()
    a.func(a)


if __name__ == "__main__":
    main()
