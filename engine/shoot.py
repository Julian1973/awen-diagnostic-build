#!/usr/bin/env python3
"""shoot.py — the shooting engine. Shot table in, gated emissions and takes out.

One shot at a time by hand does not finish an episode. This reads a shot table,
compiles each shot's emission from the studio grammar, gates every one against
the floor, refuses the ones that fail, fires the rest, and assembles picture
with dialogue, effects and room tone.

    python3 engine/shoot.py compile  --scene FR      # write + gate emissions
    python3 engine/shoot.py fire     --scene FR      # fire everything gated
    python3 engine/shoot.py assemble --scene FR      # picture + sound
    python3 engine/shoot.py cut      --scene FR      # join into a sequence

Nothing fires below the floor. The gate is not advisory.
"""
from __future__ import annotations
import argparse, json, pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
P = ROOT / "projects/thistlewood/production"
SHOTS = P / "shots.json"
EM, TK, AS = P / "emissions", P / "takes", P / "assembled"
KF = ROOT / "projects/thistlewood/assets/keyframes"
SFX, VO = P / "sfx", P / "voice/EP01"
FLOOR = 9.5

STYLE = ("Hand-drawn 2D animation. Warm coloured-ink linework in browns, ambers and muted "
         "greens, never black outlines. Flat colour fills with a subtle paper texture. Soft "
         "amber-warm palette with honeyed light. Cosy storybook atmosphere with quiet "
         "melancholy underneath. No 3D rendering, no photorealism, no painterly brushwork.")


def compile_emission(s: dict) -> str:
    """Compile a shot into the sd25-pe multi-reference template.

    Structure is the skill's; the clock is H3's. See docs/SD25PE_TO_H3_CROSSOVER.md
    — the template, roles, exclusions, braces and consistency block all transfer;
    the 30-second stage arithmetic does not, so a shot carries two stages, never
    four, and reference tags are unprefixed because minimax documents "Image 1".
    """
    out = []

    # [Characters] — named subjects bound to references, never described in
    # competing prose. One line per character, one reference each.
    if s.get("characters"):
        out.append("[Characters]")
        for c in s["characters"]:
            out.append(f"<{c['name']}> corresponds to Image {c['ref']}. "
                       f"Use only {c['use']}.")
        if len(s["characters"]) > 1:
            out.append("Do not interchange the characters' appearances, clothing, "
                       "actions or dialogue.")
        out.append("")

    if s.get("props"):
        out.append("[Props]")
        for pr in s["props"]:
            out.append(f"<{pr['name']}> corresponds to Image {pr['ref']}. {pr['rule']}")
        out.append("")

    if s.get("scene_ref"):
        out.append("[Scenes]")
        out.append(f"<{s['scene_ref']['name']}> references Image {s['scene_ref']['ref']}. "
                   f"Use only {s['scene_ref']['use']}.")
        out.append("")

    out.append("[Style]")
    out.append(STYLE)
    out.append("")

    out.append("[Motion and Audio]")
    out.append(f"The camera {s['camera']}.")
    if s.get("line"):
        out.append(f"Audio 1 defines <{s['speaker_name']}>'s voice characteristics only — "
                   f"timbre, age and accent. Do not take any words from Audio 1.")
        out.append(f"Dialogue language: English. <{s['speaker_name']}> says, "
                   f"{s.get('delivery','plainly')}: {{{s['line']}}}")
    for who in s.get("silent_names", []):
        out.append(f"<{who}> does not speak in this shot: the mouth stays closed, no lip or jaw "
                   f"movement. <{who}> is NOT frozen — the body keeps living: breathing, small "
                   f"weight shifts, blinking, and reacting to what is being said.")
    out.append("")

    if s.get("life"):
        out.append("[Secondary Life]")
        out.append("Nobody in this frame is a still image. Throughout the whole shot, "
                   "independently of the main action:")
        for who, action in s["life"].items():
            out.append(f"— {who}: {action}")
        out.append("These movements are small and continuous. They never stop, and they never "
                   "compete with the main action.")
        out.append("")

    out.append("[Event Script]")
    for i, st in enumerate(s["stages"], start=1):
        out.append(f"Stage {i}: {st}")
    out.append("")

    out.append("[Maintain Consistency]")
    out.append(s.get("consistency",
        "Keep every character's identity, hair and clothing exactly as their reference "
        "defines them, keep the prop count and its ownership unchanged, keep the room "
        "layout and lighting unchanged, and keep the speaker relationship consistent."))
    return "\n".join(out).strip() + "\n"


def gate(text: str, s: dict) -> tuple[float, list[str]]:
    t = text.lower()
    checks = {
        "stages present": all(k in text for k in ("Opening state:", "Primary event:", "End state:")),
        "no generation params": not any(k in t for k in ("768p", "16:9", "resolution", "seconds long")),
        "camera has a behaviour": "the camera " in t,
        "no interior states": not any(k in t for k in
            ("listening", "feels", "thinks", "realises", "remembers", "understands", "nervous", "wants to")),
        "under 2500 chars": len(text) <= 2500,
        "speaker law — every mouth assigned":
            bool(s.get("speaker")) or bool(s.get("silent")) or s.get("no_faces", False),
        "silent characters explicitly closed":
            (not s.get("silent")) or "mouth stays closed" in t,
        "no blanket negatives": not any(k in t for k in ("watermark", "subtitle", "caption")),
        "apron state stated": ("apron" in t) if s.get("apron_matters") else True,
        "scripted line present and verbatim":
            (not s.get("line")) or (s["line"] in text),
        "voice reference declared when there is a line":
            (not s.get("line")) or "Audio 1 defines the speaking VOICE ONLY" in text,
    }
    fails = [k for k, v in checks.items() if not v]
    return 10 - 1.5 * len(fails), fails


def load(scene: str) -> list[dict]:
    all_shots = json.loads(SHOTS.read_text())["shots"]
    return [s for s in all_shots if s["id"].startswith(scene)]


def cmd_compile(a):
    EM.mkdir(parents=True, exist_ok=True)
    ok = bad = 0
    for s in load(a.scene):
        text = compile_emission(s)
        score, fails = gate(text, s)
        path = EM / f"{s['id']}.txt"
        path.write_text(text)
        flag = "CLEARED" if score >= FLOOR else "REFUSED"
        print(f"  {s['id']:<8} {score:>4.1f}  {flag}" + (f"  ← {', '.join(fails)}" if fails else ""))
        ok, bad = (ok + 1, bad) if score >= FLOOR else (ok, bad + 1)
    print(f"\n{ok} cleared · {bad} refused · floor {FLOOR}")
    if bad:
        sys.exit(f"REFUSED {bad} shot(s). Fix the shot table; nothing fires below the floor.")


def cmd_fire(a):
    TK.mkdir(parents=True, exist_ok=True)
    procs = []
    for s in load(a.scene):
        em, out = EM / f"{s['id']}.txt", TK / f"{s['id']}.mp4"
        if out.exists() and not a.force:
            print(f"  {s['id']:<8} already shot — skipping"); continue
        score, _ = gate(em.read_text(), s)
        if score < FLOOR:
            print(f"  {s['id']:<8} REFUSED at {score} — not firing"); continue
        cmd = [sys.executable, str(ROOT / "engine/fire.py"), "render", "--model", "h3",
               "--prompt", str(em), "--image", str(KF / s["keyframe"])]
        for extra in s.get("extra_refs", []):
            cmd += ["--image", str(KF / extra)]
        if s.get("voice_ref"):
            cmd += ["--audio", str(VO / s["voice_ref"])]
        cmd += ["--resolution", "768P", "--duration", str(s["sec"]), "--out", str(out)]
        print(f"  {s['id']:<8} firing {s['sec']}s on {s['keyframe']}")
        procs.append((s["id"], subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)))
    for sid, p in procs:
        err = p.communicate()[1].decode()[-200:]
        print(f"  {sid:<8} {'✓' if p.returncode == 0 else '✗ ' + err}")


def cmd_assemble(a):
    import imageio_ffmpeg
    FF = imageio_ffmpeg.get_ffmpeg_exe()
    AS.mkdir(parents=True, exist_ok=True)
    for s in load(a.scene):
        vid = TK / f"{s['id']}.mp4"
        if not vid.exists():
            print(f"  {s['id']:<8} no take — skipping"); continue
        inputs, filt, n = ["-i", str(vid)], [], 1
        if s.get("vo"):
            pre = []
            if s.get("vo_ss") is not None: pre += ["-ss", str(s["vo_ss"])]
            if s.get("vo_t") is not None:  pre += ["-t", str(s["vo_t"])]
            inputs += pre + ["-i", str(VO / s["vo"])]
            filt.append(f"[{n}:a]volume=1.0,adelay={s.get('vo_delay',150)}|{s.get('vo_delay',150)}[vo]"); n += 1
        for fx, vol, delay in s.get("sfx", []):
            inputs += ["-i", str(SFX / fx)]
            filt.append(f"[{n}:a]volume={vol},adelay={delay}|{delay},atrim=0:{s['sec']},"
                        f"asetpts=N/SR/TB[fx{n}]"); n += 1
        labels = (["[vo]"] if s.get("vo") else []) + [f"[fx{i}]" for i in range(2 if s.get("vo") else 1, n)]
        if not labels:
            print(f"  {s['id']:<8} no sound defined — skipping"); continue
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
    shots = [s for s in load(a.scene) if (AS / f"{s['id']}.mp4").exists()]
    if not shots:
        sys.exit("nothing assembled to cut")
    lst = P / f"_cut_{a.scene}.txt"
    lst.write_text("".join(f"file '{(AS / (s['id'] + '.mp4')).resolve()}'\n" for s in shots))
    out = P / f"SEQUENCE_{a.scene}.mp4"
    r = subprocess.run([FF, "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
                        "-c:v", "libx264", "-crf", "18", "-preset", "medium",
                        "-c:a", "aac", "-b:a", "192k", str(out)], capture_output=True)
    lst.unlink(missing_ok=True)
    print(f"  {'✓' if r.returncode == 0 else '✗'} {out.name} — {len(shots)} shots, "
          f"{sum(s['sec'] for s in shots)}s")
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
