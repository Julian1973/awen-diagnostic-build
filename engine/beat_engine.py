#!/usr/bin/env python3
"""BEAT ENGINE v1 — deterministic beat → Seedance 2.5 compiler, preflight, verdict loop.

The law (AAA Prompt Standard): the prompt is not the director — it is the
provider-specific shooting instruction produced from already-approved direction.
No LLM writes prompts here. A typed shot file (the IR) goes in; the compiler emits
the prompt mechanically from grammar_pack.json; preflight re-parses the emitted
prompt and diffs it against the IR (round-trip); nothing fires without two stamps:

    COMPILED BY beat-engine vX (grammar pack vY)
    PREFLIGHT: PASS

Commands (run from repo root or engine/):
    python3 engine/beat_engine.py compile  engine/shots/S1_SH1A.json   # stamped prompt
    python3 engine/beat_engine.py payload  engine/shots/S1_SH1A.json   # fire-ready request JSON
    python3 engine/beat_engine.py verdict  S1.SH1A good "why it lands"
    python3 engine/beat_engine.py verdict  S1.SH1A retake --layer take --class flat_comedy "what's wrong"
    python3 engine/beat_engine.py lessons                              # the boil-down
    python3 engine/beat_engine.py selftest                             # prove the brain catches the sins
"""
import json, pathlib, re, sys, time

HERE = pathlib.Path(__file__).resolve().parent
PACK_FILE = HERE / "grammar_pack.json"
LEDGER = HERE / "verdict_ledger.jsonl"
ENGINE_VERSION = "1.1.0"

LAYERS = ("take", "keyframe", "brief", "reference")
FAILURE_CLASSES = ("floaty", "off_model", "clip_through", "flat_comedy", "seam",
                   "audio", "continuity", "stupid_output", "policy_refusal",
                   "performance_drift", "over_constrained")


def pack() -> dict:
    return json.loads(PACK_FILE.read_text())


# ---------------------------------------------------------------- compiler ----

def _stage_line(st: dict) -> str:
    parts = [f"{st['t']}s: {st['action']}."]
    if st.get("cause"):
        parts.append(f"(Cause: {st['cause']}.)")
    if st.get("hold_s"):
        parts.append(f"Hold {st['hold_s']:.1f}s: {st.get('hold_what', 'the pose held without extra movement')}.")
    if st.get("camera"):
        parts.append(f"Camera: {st['camera']}.")
    if st.get("sound"):
        parts.append(f"Sound: {st['sound']}.")
    parts.append(f"End state: {st['end_state']}.")
    return " ".join(parts)


def compile_prompt(ir: dict, gp: dict) -> str:
    """Deterministic emission in the AAA block grammar. No model, no mood."""
    lane = ir.get("lane", "SEC")
    out = []

    # AUDIO-LOCK
    a = ir.get("audio") or {}
    lock = []
    if a.get("track"):
        lock.append(f"{a['track']} is the sole source of dialogue, performance and mouth timing.")
        for o in a.get("owners", []):
            lock.append(f"{o['character']} performs only their region of {a['track']} ({o['regions']}).")
    else:
        lock.append("This shot contains no dialogue.")
    for s in a.get("silent", []):
        lock.append(f"{s} remains visibly silent, mouth closed.")
    lock.append("Add no other voices, narration, subtitles or captions. No music.")
    out.append("[AUDIO-LOCK]\n" + " ".join(lock))

    # REFERENCE ROLES (official sd25-pe v0.3.3: frame anchors use the exact
    # standalone sentence; composition detail follows in its own sentence)
    refs = []
    for r in ir.get("references", []):
        if r.get("role") == "first_frame":
            refs.append(f"{r['tag']} is the first frame.")
            refs.append(f"This first frame defines {r['defines']}. Ignore: {r['ignore']}.")
        elif r.get("role") == "last_frame":
            refs.append(f"{r['tag']} is the last frame.")
            refs.append(f"This last frame defines {r['defines']}. Ignore: {r['ignore']}.")
        else:
            refs.append(f"{r['tag']} defines only {r['defines']}. Ignore: {r['ignore']}.")
    out.append("[REFERENCE ROLES]\n" + "\n".join(refs))

    # SHOT PURPOSE
    out.append("[SHOT PURPOSE]\n" + ir["purpose"])

    # GLOBAL SETTINGS
    g = [f"STYLE ({gp['style_paragraph']['version']}): {gp['style_paragraph']['text']}"]
    if ir.get("light"):
        g.append(f"LIGHT: {ir['light']}")
    if ir.get("geography"):
        g.append("GEOGRAPHY: " + " ".join(ir["geography"]))
    if ir.get("conduct"):
        g.append("CONDUCT: " + " ".join(ir["conduct"]))
    out.append("[GLOBAL SETTINGS]\n" + "\n".join(g))

    # TIMELINE
    out.append("[TIMELINE]\n" + "\n".join(_stage_line(s) for s in ir["stages"]))

    # CAMERA
    cp = ir["camera_policy"]
    cam = [f"One dominant policy: {cp['policy']}."]
    if cp.get("exclusions"):
        cam.append("; ".join(e.rstrip(".") for e in cp["exclusions"]) + ".")
    out.append("[CAMERA]\n" + " ".join(cam))

    # END STATE
    out.append("[END STATE]\nEnd state: " + ir["end_state"])

    # CONSTRAINTS
    cons = list(ir.get("constraints", []))
    cons.append(gp["boilerplate"]["anti_drift"])
    cons.append("Negatives: " + ", ".join(gp["farmed_negatives"]))
    out.append("[CONSTRAINTS]\n" + "\n".join(f"- {c.rstrip('.')}." for c in cons))

    # AUDIO (final confirmation)
    fin = []
    if a.get("track"):
        fin.append(f"Use {a['track']} unchanged.")
    if a.get("foley"):
        fin.append("Authorised foley, kept below the voice: " + ", ".join(a["foley"]) + ".")
    fin.append(gp["boilerplate"]["music_kill"])
    out.append("[AUDIO]\n" + " ".join(fin))

    if lane == "coverage":
        out.append("[COVERAGE]\n" + gp["boilerplate"]["coverage_invitation"])

    return "\n\n".join(out)


# ---------------------------------------------------------------- preflight ----

def _sentences(text: str):
    return [s.strip() for s in re.split(r"[.\n]+", text) if len(s.strip()) > 12]


def preflight(ir: dict, prompt: str, gp: dict) -> list:
    """Mechanical checks only. Each finding: (severity, check_id, message, law).
    Round-trip included: the emitted prompt is re-parsed and diffed against the IR."""
    F = []
    add = lambda sev, cid, msg, law: F.append((sev, cid, msg, law))
    lane = ir.get("lane", "SEC")
    names = "(" + "|".join(gp["characters"].keys()) + ")"
    route = gp["routes"].get(ir.get("route", ""), None)

    # 1. identity words near a character name (L2)
    for m in re.finditer(names + r"[^.\n]{0,60}" + gp["appearance_words"], prompt, re.I):
        add("BLOCK", "identity-text", f"appearance word near a name: '…{m.group(0)[:70]}…'",
            "L2: identity from references only")
    # 2. quoted dialogue text in prompt (L3)
    if re.search(r'"[A-Za-z][^"]{2,}"', prompt):
        add("BLOCK", "spoken-words", "quoted dialogue found — must be 'the line in @Audio1'",
            "L3: the voice lives in the render")
    # 3. dialogue beat must carry the track (L3)
    if (ir.get("audio") or {}).get("owners") and "@Audio" not in prompt:
        add("BLOCK", "law5-no-track", "dialogue owners declared but no @Audio in prompt", "L3 / Law 5")
    # 4. reference discipline: declared vs cited, both scopes (Part 3)
    declared = {r["tag"] for r in ir.get("references", [])}
    cited = set(re.findall(r"@(?:Image|Video|Audio)\d+", prompt))
    for tag in cited - declared:
        add("BLOCK", "ref-undeclared", f"{tag} cited but not declared in REFERENCE ROLES", "never cite an unattached image")
    for r in ir.get("references", []):
        if not r.get("defines") or not r.get("ignore"):
            add("BLOCK", "ref-scope", f"{r['tag']} missing positive or negative scope", "every ref: defines-only + ignore")
        if r["tag"] not in prompt:
            add("BLOCK", "ref-unused", f"{r['tag']} declared but never bound in prompt", "references are law")
    # 5. route envelope (Part 2)
    if route is None:
        add("BLOCK", "route-unknown", f"route '{ir.get('route')}' not in grammar pack", "route-envelope discipline")
    else:
        dur = float(ir["duration_s"])
        if not (route["min_s"] <= dur <= route["max_s"]):
            add("BLOCK", "duration", f"{dur}s outside route envelope {route['min_s']}–{route['max_s']}s", "route-envelope discipline")
        n_img = sum(1 for r in ir.get("references", []) if r["tag"].startswith("@Image"))
        n_aud = sum(1 for r in ir.get("references", []) if r["tag"].startswith("@Audio"))
        if n_img > route["max_img"] or n_aud > route["max_aud"]:
            add("BLOCK", "ref-envelope", f"{n_img} images / {n_aud} audio exceed route limits", "route-envelope discipline")
        if len(prompt) > route["char_ceiling"]:
            add("BLOCK", "char-ceiling", f"{len(prompt)} chars > route ceiling {route['char_ceiling']}", "route-envelope discipline")
    if lane == "SEC" and len(prompt) > gp["narrative_char_note"]:
        add("NOTE", "char-budget", f"{len(prompt)} chars > {gp['narrative_char_note']} narrative guideline — headroom is not a target", "density calibration")
    # 6. camera: vague vocabulary + move-family budget (C2)
    for v in gp["camera_vague"]:
        if v in prompt.lower():
            add("BLOCK", "camera-vague", f"banned vague camera term: '{v}'", "C2: plain film terms only")
    cam_text = (ir["camera_policy"]["policy"] + " " + " ".join(s.get("camera", "") for s in ir["stages"])).lower()
    fams = {fam for fam, words in gp["camera_move_families"].items() if any(w in cam_text for w in words)}
    if len(fams) > gp["camera_family_budget"]:
        add("BLOCK", "camera-conflict", f"{len(fams)} camera move families {sorted(fams)} > budget {gp['camera_family_budget']}", "C2: one main move, ~2 families per unit")
    # 7. brand names (Part 6)
    for b in gp["brand_block"]:
        if re.search(r"\b" + re.escape(b) + r"\b", prompt, re.I):
            add("BLOCK", "brand-name", f"brand/renderer name in prompt: '{b}'", "physics words, never trademarks")
    # 8. geography present on SEC lane (C1)
    if lane == "SEC" and not ir.get("geography"):
        add("BLOCK", "no-geography", "SEC shot has no geography block — screen direction will drift", "C1: WHERE rule + geography ledger")
    # 9. numeric holds on button stages, with a floor (Part 3 + gag-clock law)
    for s in ir["stages"]:
        if s.get("button") and not s.get("hold_s"):
            add("BLOCK", "no-hold", f"button stage {s['t']} has no numeric hold — 'briefly' is not a duration", "gag-clock law")
        elif s.get("button") and s["hold_s"] < gp.get("button_hold_min_s", 2.0):
            add("BLOCK", "hold-too-short", f"button hold {s['hold_s']}s < {gp.get('button_hold_min_s', 2.0)}s — the landing cannot read", "gag-clock law: the button needs air")
    # 9a. DENSITY BUDGET (farmed from S1.SH1A candidate 1, 2026-08-10 — "pace,
    # fluidity and punchline failed": eleven physical beats in 6.9s ≈ 0.6s each;
    # weight needs anticipation + action + settle per beat).
    min_beat = gp.get("min_beat_s", 1.2)
    total_need = 0.0
    for s in ir["stages"]:
        clauses = [c for c in re.split(r"[,;]| then ", s.get("action", "")) if len(c.strip()) > 8]
        need = len(clauses) * min_beat + float(s.get("hold_s") or 0)
        try:
            t0, t1 = [float(x) for x in s["t"].split("-")]
            have = t1 - t0
        except Exception:
            have = 0.0
        total_need += need
        if have and need > have + 0.05:
            add("BLOCK", "over-stuffed", f"stage {s['t']} packs {len(clauses)} beats (needs ~{need:.1f}s) into {have:.1f}s — motion cannot carry weight",
                "density budget: >= 1.2s per physical beat, plus the hold")
    if total_need > float(ir["duration_s"]) + 0.05:
        add("BLOCK", "shot-over-stuffed", f"shot needs ~{total_need:.1f}s of action but runs {ir['duration_s']}s — extend the unit or cut events",
            "density budget: split to pace, never compress")
    # 9b. unfilled skeleton
    if "_REQUIRED_" in prompt:
        add("BLOCK", "skeleton-unfilled", "shot file still contains _REQUIRED_ placeholders — direction is incomplete", "L1: traceability")
    # 10. shot purpose split heuristic (L5)
    if ir["purpose"].lower().count(" and ") > 1 and lane == "SEC":
        add("NOTE", "purpose-and", "shot purpose uses 'and' more than once — split candidate", "L5: one dominant event per shot")
    # 11. duplicate action sentences (LLM-draft fingerprint)
    sents = []
    for s in ir["stages"]:
        sents.extend(_sentences(s["action"]))
    for i in range(len(sents)):
        for j in range(i + 1, len(sents)):
            a_set, b_set = set(re.findall(r"\w+", sents[i].lower())), set(re.findall(r"\w+", sents[j].lower()))
            if a_set and b_set and len(a_set & b_set) / len(a_set | b_set) > 0.8:
                add("BLOCK", "duplicate-action", f"near-duplicate action sentences: '{sents[i][:40]}…' / '{sents[j][:40]}…'",
                    "never restate an action — duplicated motion")
    # 12. motion vocabulary: banned verb near its character (Part 5)
    for name, vocab in gp["characters"].items():
        for verb in vocab.get("banned", []):
            if re.search(name + r"[^.\n]{0,80}\b" + verb + r"\b", prompt, re.I):
                add("BLOCK", "banned-verb", f"'{verb}' near {name} — outside their motion vocabulary", "the verb IS the character")
    # 13. canon blocks
    for c in gp["canon_blocks"]:
        if re.search(c["pattern"], prompt, re.I):
            add("BLOCK", "canon", c["message"], "locked canon")
    # 14. music kill present
    if "no music" not in prompt.lower():
        add("BLOCK", "no-music-kill", "music kill-switch missing", "universal official practice")
    # 15. ROUND-TRIP: re-parse the emitted prompt and diff against the IR
    tl = re.findall(r"^(\d+(?:\.\d+)?)[–-](\d+(?:\.\d+)?)s:", prompt, re.M)
    if len(tl) != len(ir["stages"]):
        add("BLOCK", "roundtrip-stages", f"emitted {len(tl)} timeline stages, IR has {len(ir['stages'])}", "round-trip preflight")
    else:
        prev_end = 0.0
        for k, (t0, t1) in enumerate(tl):
            t0f, t1f = float(t0), float(t1)
            if abs(t0f - prev_end) > 0.05:
                add("BLOCK", "roundtrip-gap", f"stage {k + 1} starts at {t0f}s but previous ended {prev_end}s", "stages must tile the shot")
            prev_end = t1f
        if abs(prev_end - float(ir["duration_s"])) > 0.05:
            add("BLOCK", "roundtrip-duration", f"last stage ends {prev_end}s but duration_s is {ir['duration_s']}", "the timeline is the duration")
    if prompt.count("End state:") < len(ir["stages"]) + 1:
        add("BLOCK", "roundtrip-endstates", "an end state is missing (each stage + the shot need one)", "every shot declares its destination")
    if gp["style_paragraph"]["text"] not in prompt:
        add("BLOCK", "style-verbatim", "canonical style paragraph not present verbatim", "one look, enforced everywhere")
    return F


# ------------------------------------------------------------------- output ----

def stamps(ir: dict, gp: dict, findings: list) -> str:
    blocks = [f for f in findings if f[0] == "BLOCK"]
    s1 = f"COMPILED BY beat-engine v{ENGINE_VERSION} (grammar pack v{gp['version']}, style {gp['style_paragraph']['version']})"
    s2 = "PREFLIGHT: PASS" if not blocks else f"PREFLIGHT: REFUSE FIRE — {len(blocks)} BLOCK(s)"
    return s1 + "\n" + s2


def run_compile(path: str, as_payload: bool = False) -> int:
    ir = json.loads(pathlib.Path(path).read_text())
    gp = pack()
    prompt = compile_prompt(ir, gp)
    findings = preflight(ir, prompt, gp)
    blocks = [f for f in findings if f[0] == "BLOCK"]
    print("=" * 78)
    print(f"SHOT {ir['shot']} · lane {ir.get('lane', 'SEC')} · {ir['duration_s']}s · {ir.get('resolution', '480p')} · route {ir.get('route')}")
    print(stamps(ir, gp, findings))
    print("=" * 78)
    for sev, cid, msg, law in findings:
        print(f"  [{sev}] {cid}: {msg}\n         law: {law}")
    if not findings:
        print("  preflight clean — no findings")
    print("-" * 78)
    if blocks:
        print("PROMPT WITHHELD — a prompt that fails preflight does not exist. Fix the shot")
        print("file (or file a defect against the compiler) and re-run. DO NOT FIRE.")
        return 1
    if as_payload:
        payload = {
            "route": ir.get("route"),
            "prompt": prompt,
            "duration_s": ir["duration_s"],
            "aspect": ir.get("aspect", "16:9"),
            "resolution": ir.get("resolution", "480p"),
            "output_format": "MOV" if ir.get("will_edit") else "MP4",
            "references": [{"tag": r["tag"], "role": r.get("role", "reference_image"), "file": r.get("file", "<ATTACH>")}
                           for r in ir.get("references", [])],
            "stamps": stamps(ir, gp, findings).split("\n"),
        }
        print(json.dumps(payload, indent=2, ensure_ascii=False))
    else:
        print(prompt)
        print("-" * 78)
        print(f"chars: {len(prompt)}  ·  candidates ruling: 2×480p on comedy units")
    return 0


# ------------------------------------------------------------ verdict loop ----

def verdict(argv: list) -> int:
    shot, word = argv[0], argv[1]
    layer = next((argv[i + 1] for i, a in enumerate(argv) if a == "--layer"), None)
    fclass = next((argv[i + 1] for i, a in enumerate(argv) if a == "--class"), None)
    note = argv[-1] if argv[-1] not in (shot, word, layer, fclass, "--layer", "--class") else ""
    entry = {"at": time.strftime("%Y-%m-%d %H:%M"), "shot": shot, "verdict": word, "note": note}
    if word == "retake":
        if layer not in LAYERS:
            print(f"diagnosis required: --layer one of {LAYERS} ('try again' is not a diagnosis)"); return 2
        if fclass not in FAILURE_CLASSES:
            print(f"diagnosis required: --class one of {FAILURE_CLASSES}"); return 2
        entry.update({"layer": layer, "class": fclass})
    with open(LEDGER, "a") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    if word == "good":
        print(f"banked. {shot}'s compiled recipe is now the proven path for its archetype until a render dethrones it.")
    else:
        print(f"logged [{layer}/{fclass}]. Route: " + {
            "take": "surgical retake of the take (region edit first: is the defect isolated?)",
            "keyframe": "fix the anchor upstream, recompile, refire",
            "brief": "fix the shot file's direction fields, recompile, refire",
            "reference": "fix the reference asset, then refire EVERYTHING that used it",
        }[layer])
        print("run 'lessons' — 2+ occurrences of one class auto-propose a grammar-pack rule.")
    return 0


def lessons() -> int:
    if not LEDGER.exists():
        print("no verdicts yet — fire something, watch it, comment."); return 0
    es = [json.loads(l) for l in LEDGER.read_text().splitlines() if l.strip()]
    retakes = [e for e in es if e["verdict"] == "retake"]
    goods = [e for e in es if e["verdict"] == "good"]
    print(f"verdicts: {len(goods)} good · {len(retakes)} retake")
    counts = {}
    for e in retakes:
        counts[e["class"]] = counts.get(e["class"], 0) + 1
    gp = pack()
    proposed = []
    for cls, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"  {cls}: ×{n}")
        if n >= 2:
            notes = "; ".join(e["note"] for e in retakes if e["class"] == cls if e.get("note"))
            proposed.append({"from_class": cls, "occurrences": n, "evidence": notes,
                             "proposal": f"boil '{cls}' notes into a farmed negative or a new preflight check"})
    if proposed:
        gp["candidate_rules"] = proposed
        PACK_FILE.write_text(json.dumps(gp, indent=2, ensure_ascii=False))
        print(f"\n{len(proposed)} candidate rule(s) written to grammar_pack.json → 'candidate_rules'.")
        print("Julian ratifies → they become farmed_negatives or checks, version bump. That is the boil-down.")
    return 0


# ------------------------------------------------------- director's desk ----

SKELETON_HINTS = {
    "purpose": "ONE sentence: the single dramatic/comedic job. More than one 'and' = two shots.",
    "cause": "What caused this stage, from the previous stage? Physics, not vibes.",
    "action": "Observable behaviour with contact points and weight. Emotion is what a feeling does to a body.",
    "end_state": "A describable frame. The last stage's end state opens the next shot.",
    "hold": "Numeric seconds. Buttons need >= 2.0s — the landing must have air.",
}


def budget(argv: list) -> int:
    """THE TIMING MODEL — tell the director the minimum viable duration BEFORE
    the direction is finished. Usage:
        budget travel dodge impact load_release settle hold:2.1
    Beat kinds come from grammar_pack beat_costs; 'hold:N' adds a numeric button."""
    gp = pack()
    costs = gp["beat_costs"]
    total, rows = 0.0, []
    for a in argv:
        if a.startswith("hold:"):
            s = float(a.split(":", 1)[1]); rows.append(("hold (button)", s)); total += s; continue
        c = costs.get(a)
        if not c:
            print(f"unknown beat kind '{a}'. Known: {', '.join(k for k in costs if not k.startswith('_'))}")
            return 2
        rows.append((a, c["s"])); total += c["s"]
    margin = gp.get("comfort_margin", 1.15)
    print("BEAT                 MIN s")
    for name, s in rows:
        print(f"  {name:<18} {s:>5.1f}")
    print(f"  {'—' * 18} {'—' * 5}")
    print(f"  {'floor':<18} {total:>5.1f}   (nothing can read below this)")
    print(f"  {'recommended':<18} {total * margin:>5.1f}   (+{int((margin - 1) * 100)}% so beats breathe)")
    print(f"\nDirect this unit at {max(4, round(total * margin)):.0f}s. Below the floor, split the unit —")
    print("compressing beats is how pace, fluidity and punchlines die.")
    return 0


def direct(shot_code: str, duration_s: float) -> int:
    """Emit a shot-file skeleton that cannot compile until the magic-shaped answers exist.
    The director (human or the director skill) fills it; preflight blocks on any
    _REQUIRED_ left behind. This is the desk, not the director."""
    n = max(2, min(4, round(duration_s / 3)))
    step = round(duration_s / n, 1)
    stages = []
    for i in range(n):
        t0, t1 = round(i * step, 1), round((i + 1) * step, 1) if i < n - 1 else duration_s
        st = {"t": f"{t0}-{t1}", "action": "_REQUIRED_ " + SKELETON_HINTS["action"],
              "cause": "_REQUIRED_ " + SKELETON_HINTS["cause"],
              "camera": "_REQUIRED_ one behaviour for this window",
              "sound": "_REQUIRED_ inline, per beat — never a list at the end",
              "end_state": "_REQUIRED_ " + SKELETON_HINTS["end_state"]}
        if i == n - 1:
            st.update({"button": True, "hold_s": 2.2,
                       "hold_what": "_REQUIRED_ what exactly is held, and what tiny thing moves"})
        stages.append(st)
    ir = {
        "_doc": f"Shot skeleton for {shot_code} — every _REQUIRED_ is a question the direction must answer. It will not compile until they are gone.",
        "shot": shot_code, "lane": "SEC", "duration_s": duration_s, "aspect": "16:9",
        "resolution": "480p", "route": "fal-seedance-2.5", "will_edit": False,
        "purpose": "_REQUIRED_ " + SKELETON_HINTS["purpose"],
        "audio": {"track": "@Audio1", "owners": [{"character": "_REQUIRED_", "regions": "_REQUIRED_ timecoded"}],
                  "silent": [], "foley": ["_REQUIRED_ 2-4 diegetic sounds, mapped to beats"]},
        "references": [
            {"tag": "@Image1", "role": "first_frame", "file": "_REQUIRED_",
             "defines": "the approved opening composition and camera axis", "ignore": "identity, materials and any later action"},
            {"tag": "@Image2", "role": "reference_image", "file": "_REQUIRED_",
             "defines": "_REQUIRED_ character identity, proportions, canonical scale — refer to it strictly", "ignore": "background and poses"},
            {"tag": "@Audio1", "role": "reference_audio", "file": "_REQUIRED_",
             "defines": "the performed line, its exact timing and all silences", "ignore": "anything beyond it except the authorised foley"}],
        "geography": ["_REQUIRED_ scene constants: which way does the space run, who travels which way, where does the camera live"],
        "light": "_REQUIRED_ a sourced event: where from, what it touches, how it changes",
        "conduct": ["_REQUIRED_ the character truth this shot must not violate"],
        "stages": stages,
        "camera_policy": {"policy": "_REQUIRED_ one dominant job, sequenced not blended",
                          "exclusions": ["No cuts", "no handheld shake", "no orbit"]},
        "end_state": "_REQUIRED_ the final frame — harvested as the next shot's opening reference",
        "constraints": ["_REQUIRED_ production facts: character count, scale rule, what never happens"],
    }
    out = HERE / "shots" / f"{shot_code.replace('.', '_')}.json"
    if out.exists():
        print(f"refusing to overwrite existing {out}"); return 1
    out.write_text(json.dumps(ir, indent=2, ensure_ascii=False))
    print(f"skeleton written: {out}")
    print("Fill every _REQUIRED_. Then: craftcheck → compile. It will refuse until the direction is complete.")
    return 0


def craftcheck(path: str) -> int:
    """Director-level checks BEFORE compile: is the magic structurally present?
    Mechanical checks block; judgement goes on the review card for SEE sign-off."""
    ir = json.loads(pathlib.Path(path).read_text())
    gp = pack()
    problems, notes = [], []
    raw = json.dumps(ir)
    if "_REQUIRED_" in raw:
        problems.append(f"{raw.count('_REQUIRED_')} unanswered _REQUIRED_ question(s) — direction incomplete")
    for s in ir.get("stages", []):
        if not s.get("cause"):
            problems.append(f"stage {s.get('t')}: no cause — motion without a why is floaty")
        if not s.get("end_state"):
            problems.append(f"stage {s.get('t')}: no end state — the stage doesn't resolve")
    buttons = [s for s in ir.get("stages", []) if s.get("button")]
    if not buttons:
        notes.append("no button stage declared — if this is a comedy shot, where does the laugh land?")
    for b in buttons:
        if float(b.get("hold_s") or 0) < gp.get("button_hold_min_s", 2.0):
            problems.append(f"button hold {b.get('hold_s')}s < {gp.get('button_hold_min_s', 2.0)}s — the landing cannot read")
    text = " ".join(s.get("action", "") for s in ir.get("stages", []))
    for name, vocab in gp["characters"].items():
        if name in text and vocab.get("belongs"):
            if not any(re.search(r"\b" + v.rstrip("s") + r"\w*\b", text, re.I) for v in vocab["belongs"]):
                notes.append(f"{name} appears but none of their signature verbs do ({', '.join(vocab['belongs'][:4])}…) — direction may be generic")
    for p in problems:
        print(f"  [BLOCK] {p}")
    for n in notes:
        print(f"  [NOTE]  {n}")
    print("CRAFTCHECK:", "REFUSE — fix the direction, not the prompt" if problems else "structurally sound")
    print("\nDIRECTOR'S REVIEW CARD — answer at SEE sign-off, before compiling:")
    for q in ("1. Where exactly does the audience laugh (timestamp)?",
              "2. Does the final frame contradict or complicate what the character believes?",
              "3. Could any stage be cut without losing the joke? If yes, cut it.",
              "4. Is every verb one this character would own?",
              "5. What does this shot hand to the next one, and is it in the end state?"):
        print("   " + q)
    return 1 if problems else 0


# --------------------------------------------------------------- selftest ----

def selftest() -> int:
    """Feed the engine the sins of the prompt that 'would have cost and not worked'
    and prove it refuses every one of them. Then prove the golden fixture passes."""
    gp = pack()
    bad = {
        "shot": "SELFTEST.BAD", "lane": "SEC", "duration_s": 22.0, "route": "fal-seedance-2.5",
        "purpose": "Fuzzby crashes and recovers and delivers the line and Zenny reacts",
        "audio": {"track": None, "owners": [{"character": "Fuzzby", "regions": "0-22"}], "silent": [], "foley": []},
        "references": [{"tag": "@Image1", "defines": "everything", "ignore": ""}],
        "geography": [],
        "light": "golden hour neon moonlight studio light",
        "conduct": [],
        "stages": [
            {"t": "0.0-8.0", "action": "Fuzzby the plump bee glides through the meadow while his crystal glows in a Pixar style like a Disney film",
             "camera": "drone shot, handheld close-up, fast orbit, crane up, dolly in", "end_state": "somewhere in the meadow"},
            {"t": "9.0-22.0", "action": "Fuzzby the plump bee glides through the sunny meadow while his crystal glows in a Pixar style like a Disney film",
             "camera": "handheld orbit", "end_state": "he says \"Nailed it\" to nobody",
             "button": True},
        ],
        "camera_policy": {"policy": "drone handheld orbit crane dolly, cinematic camera", "exclusions": []},
        "end_state": "unclear",
        "constraints": [],
    }
    prompt = compile_prompt(bad, gp)
    findings = preflight(bad, prompt, gp)
    ids = {f[1] for f in findings if f[0] == "BLOCK"}
    expect = {"identity-text", "spoken-words", "law5-no-track", "ref-scope", "camera-vague",
              "camera-conflict", "brand-name", "no-geography", "no-hold", "duplicate-action",
              "banned-verb", "canon", "roundtrip-gap"}
    missing = expect - ids
    print(f"BAD fixture blocks: {sorted(ids)}")
    print("SELFTEST(bad):", "PASS — engine refuses the old prompt's sins" if not missing else f"FAIL — missed {sorted(missing)}")
    good_path = HERE / "shots" / "S1_SH1A.json"
    ir = json.loads(good_path.read_text())
    p2 = compile_prompt(ir, gp)
    f2 = [f for f in preflight(ir, p2, gp) if f[0] == "BLOCK"]
    print("SELFTEST(golden):", "PASS — S1.SH1A compiles clean" if not f2 else "FAIL:\n" + "\n".join(str(x) for x in f2))
    return 0 if (not missing and not f2) else 1


def main(argv):
    if not argv:
        print(__doc__); return 2
    cmd, rest = argv[0], argv[1:]
    if cmd == "compile":
        return run_compile(rest[0])
    if cmd == "payload":
        return run_compile(rest[0], as_payload=True)
    if cmd == "direct":
        return direct(rest[0], float(rest[1]) if len(rest) > 1 else 9.0)
    if cmd == "budget":
        return budget(rest)
    if cmd == "craftcheck":
        return craftcheck(rest[0])
    if cmd == "verdict":
        return verdict(rest)
    if cmd == "lessons":
        return lessons()
    if cmd == "selftest":
        return selftest()
    print(__doc__); return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
