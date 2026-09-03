#!/usr/bin/env python3
"""stress_worker.py — stage 05 as an operational loop, not a prompt matrix.

    python3 studio/stress_worker.py plan     --asset asset.json --run-dir runs/tom-v2 \\
        [--co-star "Richard"] [--light "…"] [--variant wet]
    python3 studio/stress_worker.py generate --run-dir runs/tom-v2 [--limit N]
    python3 studio/stress_worker.py sheet    --run-dir runs/tom-v2
    python3 studio/stress_worker.py review   --run-dir runs/tom-v2 --cell tom:angle-rear \\
        --pass|--fail --notes "…" --by julian
    python3 studio/stress_worker.py verdict  --run-dir runs/tom-v2 [--asset asset.json]

The loop it executes:

    candidate asset passport (immutable revision)
      → cells resolved from the domain (angles, sizes, scene light, two-shots,
        variants — per asset type)
      → cheap stills generated through the registry-resolved image provider
      → every still saved beside its EXACT request payload
      → contact sheet rendered for review
      → a human marks every cell pass/fail with notes
      → the verdict is calculated, never asserted
      → pass at N/N, or the row stays draft and its scenes stay closed
      → any asset revision makes the whole run STALE

WHY: a passport built on one lucky image is a false victory. Our sheets travel
as references on EVERY shot, so an untested sheet is a fault multiplied by every
shot the character appears in. Two faults were found on screen at render cost —
a character smiling through his own grief, a hero prop that changed shape
between shots — that a page of stills would have caught first.

The run directory IS the owned storage for standalone use: cells, payloads,
stills, reviews and verdict all live in it, so a run is portable evidence. The
SaaS gets identical behaviour through service.py (`stress_cells`,
`stress_run_verdict`) with Supabase as the store instead.
"""
from __future__ import annotations
import argparse, json, pathlib, subprocess, sys, time

STUDIO = pathlib.Path(__file__).resolve().parent
ROOT = STUDIO.parent
sys.path.insert(0, str(STUDIO))
import domain                                    # noqa: E402

REG = json.loads((STUDIO / "providers.json").read_text())


def now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S")


def load_run(run_dir: pathlib.Path) -> dict:
    f = run_dir / "run.json"
    if not f.exists():
        sys.exit(f"  ✗ no run at {run_dir} — `plan` first")
    return json.loads(f.read_text())


def save_run(run_dir: pathlib.Path, run: dict) -> None:
    (run_dir / "run.json").write_text(json.dumps(run, indent=1))


def ledger(run_dir: pathlib.Path, event: str, detail: dict) -> None:
    with (run_dir / "ledger.jsonl").open("a") as f:
        f.write(json.dumps({"at": now(), "event": event, **detail}) + "\n")


# ─────────────────────────────────────────────────────────────────────────────

def cmd_plan(a):
    asset = json.loads(pathlib.Path(a.asset).read_text())
    run_dir = pathlib.Path(a.run_dir)
    run_dir.mkdir(parents=True, exist_ok=True)
    cells = domain.stress_cells(asset=asset, co_stars=a.co_star or [],
                                scene_lights=a.light or None,
                                variants=a.variant or [])
    run = {
        "asset": asset["tag"],
        # the revision is FROZEN into the run. If the asset moves, this run is
        # stale — not failed, stale — and the verdict function says so.
        "asset_revision": asset.get("version", 1),
        "asset_snapshot": asset,
        "required": a.required,
        "planned_at": now(),
        "cells": cells,
        "reviews": {},
    }
    save_run(run_dir, run)
    ledger(run_dir, "planned", {"cells": len(cells),
                                "asset_revision": run["asset_revision"]})
    print(f"  ✓ {asset['tag']} v{run['asset_revision']} — {len(cells)} cells planned")
    for c in cells:
        print(f"    {c['id']:<28} {c['dimension']}")


def cmd_generate(a):
    run_dir = pathlib.Path(a.run_dir)
    run = load_run(run_dir)
    snap = run["asset_snapshot"]
    img = REG["image"][REG["house"].get("image_fallback", REG["house"]["image"])]
    stills = run_dir / "stills"
    stills.mkdir(exist_ok=True)
    style = snap.get("style_lock", "")
    done = 0
    for c in run["cells"]:
        cid = c["id"].replace(":", "_")
        out = stills / f"{cid}.png"
        payload_file = stills / f"{cid}.request.json"
        if out.exists():
            continue
        if a.limit and done >= a.limit:
            print(f"  … stopped at --limit {a.limit}; "
                  f"{sum(1 for x in run['cells'] if (stills / (x['id'].replace(':','_')+'.png')).exists())}"
                  f"/{len(run['cells'])} generated so far")
            break
        prompt = (f"A single production test still, one frame, no montage and no panels. "
                  f"{c['spec']}. {style} The subject matches the reference exactly — same "
                  f"face, same clothing, same proportions. No text anywhere in the image.")
        refs = [snap["hero_path"]] + ([snap["costar_paths"][cs] for cs in []
                                       ] if False else [])
        # every still is saved beside its EXACT request payload — that pair is
        # the provenance a reviewer's verdict attaches to
        payload = {"cell": c["id"], "dimension": c["dimension"],
                   "provider": img.get("route"), "prompt": prompt,
                   "references": refs, "asset_revision": run["asset_revision"],
                   "requested_at": now()}
        payload_file.write_text(json.dumps(payload, indent=1))
        cmd = [sys.executable, str(ROOT / "engine/fire.py"), "still",
               "--prompt", "/dev/stdin", "--out", str(out)]
        for rp in refs:
            cmd += ["--image", rp]
        r = subprocess.run(cmd, input=prompt.encode(), capture_output=True)
        ok = r.returncode == 0 and out.exists()
        ledger(run_dir, "generated" if ok else "generation_failed",
               {"cell": c["id"], "out": str(out) if ok else None,
                "error": None if ok else r.stderr.decode()[-200:]})
        print(f"  {'✓' if ok else '✗'} {c['id']}")
        done += 1


def cmd_sheet(a):
    import imageio_ffmpeg
    run_dir = pathlib.Path(a.run_dir)
    run = load_run(run_dir)
    stills = sorted((run_dir / "stills").glob("*.png"))
    if not stills:
        sys.exit("  ✗ nothing generated yet")
    FF = imageio_ffmpeg.get_ffmpeg_exe()
    lst = run_dir / "_sheet.txt"
    lst.write_text("".join(f"file '{s.resolve()}'\n" for s in stills))
    cols = min(4, len(stills))
    rows = -(-len(stills) // cols)
    out = run_dir / "CONTACT_SHEET.jpg"
    subprocess.run([FF, "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
                    "-vf", f"scale=480:-1,tile={cols}x{rows}", "-frames:v", "1",
                    str(out)], capture_output=True)
    lst.unlink(missing_ok=True)
    ledger(run_dir, "contact_sheet", {"stills": len(stills)})
    print(f"  ✓ {out} — {len(stills)} stills. Review the whole run on one sheet, "
          f"not still by still.")


def cmd_review(a):
    run_dir = pathlib.Path(a.run_dir)
    run = load_run(run_dir)
    ids = {c["id"] for c in run["cells"]}
    if a.cell not in ids:
        sys.exit(f"  ✗ no cell {a.cell}. Cells: {', '.join(sorted(ids))}")
    if a.passed is None:
        sys.exit("  ✗ record --pass or --fail; a look without a verdict is not a review")
    run["reviews"][a.cell] = {"passed": a.passed, "notes": a.notes or "",
                              "by": a.by or "unknown", "at": now()}
    save_run(run_dir, run)
    ledger(run_dir, "reviewed", {"cell": a.cell, "passed": a.passed,
                                 "by": a.by or "unknown"})
    n = len(run["reviews"])
    print(f"  ✓ {a.cell}  {'PASS' if a.passed else 'FAIL'}  ({n}/{len(run['cells'])} reviewed)")


def cmd_verdict(a):
    run_dir = pathlib.Path(a.run_dir)
    run = load_run(run_dir)
    # if a fresher asset snapshot is supplied, verify the run is still against
    # the CURRENT revision — any revision invalidates prior stress results
    rev = run["asset_revision"]
    if a.asset:
        rev = json.loads(pathlib.Path(a.asset).read_text()).get("version", 1)
    v = domain.stress_run_verdict(cells=run["cells"], reviews=run["reviews"],
                                  asset_revision=rev, required=run["required"])
    ledger(run_dir, "verdict", v)
    print(f"  {run['asset']} v{run['asset_revision']}  →  {v['verdict'].upper()}")
    print(f"  {v['detail']}")
    if v["verdict"] == "pass":
        approvers = sorted({r["by"] for r in run["reviews"].values()})
        print(f"  approved by {', '.join(approvers)} on this run's evidence — the lock "
              f"may cite {run_dir}/run.json")
    sys.exit(0 if v["verdict"] == "pass" else 1)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("plan")
    p.add_argument("--asset", required=True); p.add_argument("--run-dir", required=True)
    p.add_argument("--co-star", action="append"); p.add_argument("--light", action="append")
    p.add_argument("--variant", action="append"); p.add_argument("--required", type=int, default=10)
    p.set_defaults(func=cmd_plan)
    p = sub.add_parser("generate")
    p.add_argument("--run-dir", required=True); p.add_argument("--limit", type=int)
    p.set_defaults(func=cmd_generate)
    p = sub.add_parser("sheet")
    p.add_argument("--run-dir", required=True); p.set_defaults(func=cmd_sheet)
    p = sub.add_parser("review")
    p.add_argument("--run-dir", required=True); p.add_argument("--cell", required=True)
    p.add_argument("--pass", dest="passed", action="store_true", default=None)
    p.add_argument("--fail", dest="passed", action="store_false")
    p.add_argument("--notes"); p.add_argument("--by")
    p.set_defaults(func=cmd_review)
    p = sub.add_parser("verdict")
    p.add_argument("--run-dir", required=True); p.add_argument("--asset")
    p.set_defaults(func=cmd_verdict)
    a = ap.parse_args()
    a.func(a)


if __name__ == "__main__":
    main()
