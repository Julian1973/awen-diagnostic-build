#!/usr/bin/env python3
"""lipsync_worker.py — stage 07 as a first-class job type, not a workaround.

    echo '{"video":"takes/FR01.mp4","audio":"voice/FR01_Tom.mp3",
           "speaker_box":{"x":0.223,"y":0.039,"width":0.417,"height":0.781},
           "speaker_asset":"tom","lead_in":0.7,"out":"synced/FR01.mp4"}' \\
      | python3 studio/lipsync_worker.py

The pipeline this executes, in order:

    generated picture
      → denormalise the speaker box against the real video dimensions
      → crop the speaker region (nobody else's face inside it)
      → upscale the crop if the face area is too small for the sync model
      → pad the recorded line to the take length with the lead-in
      → submit crop + recording to the lipsync provider
      → composite the synced crop back at the exact source coordinates
      → verify duration
      → write the output NEXT TO a lineage payload

WHY THE CROP EXISTS: no lipsync route measured accepts a face selector. On a
multi-face frame the service finds a face and drives it — the first time it ran
it put one man's line on the other man's mouth. When `speaker_box` is null the
whole frame goes to sync, which is only safe on a single.

WHY THE LINEAGE EXISTS: an approved shot must answer "which picture, which exact
voice performance, which face region, which provider route and which compositing
method produced you" — without anyone remembering.
"""
from __future__ import annotations
import json, pathlib, subprocess, sys, time

STUDIO = pathlib.Path(__file__).resolve().parent
ROOT = STUDIO.parent
REG = json.loads((STUDIO / "providers.json").read_text())
COMPOSITE_ALGORITHM = "crop-sync-composite/v1"
MIN_FACE_EDGE = 900          # px — below this the crop is upscaled ×2 for the model


def ff() -> str:
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def probe(path: str) -> dict:
    r = subprocess.run([ff(), "-i", path], capture_output=True)
    err = r.stderr.decode()
    import re
    dims = re.search(r"(\d{3,5})x(\d{3,5})", err)
    dur = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", err)
    return {
        "width": int(dims[1]) if dims else 0,
        "height": int(dims[2]) if dims else 0,
        "seconds": (int(dur[1]) * 3600 + int(dur[2]) * 60 + float(dur[3])) if dur else 0.0,
    }


def even(n: int) -> int:
    return n - (n % 2)


def run(job: dict) -> dict:
    t0 = time.time()
    video, audio = job["video"], job["audio"]
    out = pathlib.Path(job["out"])
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.parent / "_sync_tmp"
    tmp.mkdir(exist_ok=True)
    meta = probe(video)
    if not meta["width"]:
        return {"ok": False, "error": {"code": "BAD_INPUT", "message": f"unreadable video {video}"}}

    steps: list[dict] = []

    # ── 1 · pad the recorded line to the take length, with the lead-in ──────
    # The lead-in is a performance decision: a scripted breath or swallow needs
    # somewhere to live before the first word.
    lead = float(job.get("lead_in", 0.5))
    padded = tmp / (out.stem + "_line.wav")
    subprocess.run([ff(), "-y", "-i", audio,
                    "-af", f"adelay={int(lead*1000)}|{int(lead*1000)},apad",
                    "-t", str(meta["seconds"]), str(padded)],
                   capture_output=True, check=True)
    steps.append({"step": "pad_audio", "lead_in": lead, "to_seconds": meta["seconds"]})

    # ── 2 · the speaker box ─────────────────────────────────────────────────
    box = job.get("speaker_box")
    if box:
        # normalised 0–1 coordinates, denormalised against the REAL dimensions —
        # never against an assumed resolution, which is how a box drifts when a
        # provider changes output size.
        x = even(int(box["x"] * meta["width"]))
        y = even(int(box["y"] * meta["height"]))
        w = even(int(box["width"] * meta["width"]))
        h = even(int(box["height"] * meta["height"]))
        w = min(w, meta["width"] - x)
        h = min(h, meta["height"] - y)
        scale = 2 if max(w, h) < MIN_FACE_EDGE else 1
        crop = tmp / (out.stem + "_crop.mp4")
        vf = f"crop={w}:{h}:{x}:{y}" + (f",scale={w*scale}:{h*scale}:flags=lanczos"
                                        if scale > 1 else "")
        subprocess.run([ff(), "-y", "-i", video, "-vf", vf, "-an",
                        "-c:v", "libx264", "-crf", "16", str(crop)],
                       capture_output=True, check=True)
        sync_src = crop
        steps.append({"step": "crop", "px": [x, y, w, h], "upscale": scale})
    else:
        sync_src = pathlib.Path(video)
        steps.append({"step": "full_frame",
                      "note": "no box — only safe when a single face is in frame"})

    # ── 3 · the provider ────────────────────────────────────────────────────
    # Through the registry, never named. The proven transport lives in
    # engine/fire.py; this worker drives it rather than duplicating it.
    ls = REG["lipsync"][REG["house"]["lipsync"]]
    synced = tmp / (out.stem + "_synced.mp4")
    r = subprocess.run([sys.executable, str(ROOT / "engine/fire.py"), "lipsync",
                        "--video", str(sync_src), "--audio", str(padded),
                        "--quality", ls["models"][-1] if ls.get("models") else "default",
                        "--out", str(synced)], capture_output=True)
    if r.returncode:
        return {"ok": False, "error": {"code": "PROVIDER_FAILED",
                                       "message": r.stderr.decode()[-300:]},
                "steps": steps}
    steps.append({"step": "sync", "provider": REG["house"]["lipsync"],
                  "route": ls["route"]})

    # ── 4 · composite back at the source coordinates ────────────────────────
    # Only the mouth changed inside the rectangle, so everything around it lands
    # on identical pixels. The synced track (our recording) becomes the audio.
    if box:
        r = subprocess.run([ff(), "-y", "-i", video, "-i", str(synced),
                            "-filter_complex",
                            f"[1:v]scale={w}:{h}:flags=lanczos[c];"
                            f"[0:v][c]overlay={x}:{y}:shortest=1[v]",
                            "-map", "[v]", "-map", "1:a",
                            "-c:v", "libx264", "-crf", "17", "-c:a", "aac",
                            "-t", str(meta["seconds"]), str(out)], capture_output=True)
        if r.returncode:
            return {"ok": False, "error": {"code": "COMPOSITE_FAILED",
                                           "message": r.stderr.decode()[-300:]},
                    "steps": steps}
        steps.append({"step": "composite", "at": [x, y], "size": [w, h]})
    else:
        subprocess.run([ff(), "-y", "-i", str(synced), "-c", "copy", str(out)],
                       capture_output=True, check=True)

    # ── 5 · verify ──────────────────────────────────────────────────────────
    got = probe(str(out))
    if abs(got["seconds"] - meta["seconds"]) > 0.5:
        return {"ok": False, "error": {"code": "DURATION_MISMATCH",
                                       "message": f"{got['seconds']} vs {meta['seconds']}"},
                "steps": steps}

    # ── 6 · the lineage — the answer nobody has to remember ─────────────────
    lineage = {
        "kind": "lipsync_composite",
        "source_video": video,
        "voice_recording": audio,
        "speaker_asset": job.get("speaker_asset"),
        "speaker_box": box,
        "speaker_box_px": [x, y, w, h] if box else None,
        "lead_in_seconds": lead,
        "lipsync_provider": REG["house"]["lipsync"],
        "lipsync_route": ls["route"],
        "composite_algorithm_version": COMPOSITE_ALGORITHM,
        "source_dimensions": [meta["width"], meta["height"]],
        "duration_seconds": got["seconds"],
        "steps": steps,
        "elapsed_seconds": round(time.time() - t0, 1),
    }
    out.with_suffix(".lineage.json").write_text(json.dumps(lineage, indent=1))
    return {"ok": True, "out": str(out),
            "lineage": str(out.with_suffix(".lineage.json")),
            "duration": got["seconds"], "elapsed": lineage["elapsed_seconds"]}


if __name__ == "__main__":
    print(json.dumps(run(json.loads(sys.stdin.read())), indent=1))
