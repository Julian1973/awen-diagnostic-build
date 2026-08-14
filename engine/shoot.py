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
    """Build one emission from the shot record, in studio grammar."""
    out = [STYLE, "", s["establish"], "", f"The camera {s['camera']}.", ""]

    # THE SPEAKER LAW — every visible mouth is assigned, always.
    if s.get("speaker"):
        out.append(f"{s['speaker']} is speaking throughout this shot: the lips and jaw move "
                   f"continuously in natural speech, the mouth opening and closing.")
    silent = s.get("silent", [])
    if silent:
        out.append(" ".join(
            f"{who} does not speak at any point in this shot; the mouth stays closed and "
            f"still throughout, no lip or jaw movement." for who in silent))
    out.append("")

    out.append(f"Opening state: {s['open']}")
    out.append("")
    out.append(f"Primary event: {s['event']}")
    out.append("")
    if s.get("then"):
        out.append(f"Then: {s['then']}")
        out.append("")
    out.append(f"End state: {s['end']}")
    if s.get("hold"):
        out.append(f"\n{s['hold']}")
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
        cmd = [sys.executable, str(ROOT / "engine/fire.py"), "render", "--model", "minimax",
               "--prompt", str(em), "--image", str(KF / s["keyframe"]),
               "--resolution", "768P", "--duration", str(s["sec"]), "--out", str(out)]
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
        r = subprocess.run([FF, "-y", *inputs, "-filter_complex", ";".join(filt),
                            "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac",
                            "-shortest", str(out)], capture_output=True)
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
