#!/usr/bin/env python3
"""service.py — the boundary the SaaS calls the engine across.

JSON in, JSON out, one call per line. No database, no filesystem, no network:
the TypeScript layer owns persistence, tenancy, auth and queueing, and this owns
the production rules. That separation is deliberate — an engine that keeps its
own database becomes a second source of truth beside Supabase, and the two drift.

    # one-shot
    echo '{"op":"derive","stack":{...}}' | python3 studio/service.py

    # long-lived worker: one JSON request per line on stdin, one reply per line
    python3 studio/service.py --serve

Every reply is `{"ok": true, "result": …}` or `{"ok": false, "error": {...}}`,
so a Node worker never has to parse prose.
"""
from __future__ import annotations
import json, pathlib, sys, traceback

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import domain  # noqa: E402

REGISTRY = json.loads((pathlib.Path(__file__).resolve().parent / "providers.json").read_text())


def _stack(req: dict) -> dict:
    """Accept either a resolved stack or the house names to resolve."""
    if "stack" in req:
        return req["stack"]
    return domain.resolve_stack(REGISTRY, req.get("house") or REGISTRY["house"])


OPS = {
    # what does this stack decide, before anyone chooses anything
    "capabilities": lambda r: {"stack": _stack(r), "derived": domain.derive(_stack(r))},

    # the full gate report — the SaaS maps `code` onto its HTTP errors
    "gates": lambda r: (lambda g: {
        "gates": g,
        "blocking": domain.blocking(g),
        "clear": not domain.blocking(g),
    })(domain.evaluate_gates(
        shot=r["shot"], assets=r.get("assets", []), boards=r.get("boards", []),
        prompt=r.get("prompt"), audits=r.get("audits", []),
        stack=_stack(r), settings=r.get("settings", {}))),

    # compile — pure, reproducible, snapshot-driven
    "compile": lambda r: domain.compile_prompt(
        shot=r["shot"], assets=r.get("assets", []),
        project=r.get("project", {}), stack=_stack(r)),

    # hash any text, so the TS layer can compare without reimplementing it
    "hash": lambda r: {"hash": domain.prompt_hash(r["text"])},

    # what a revision makes provisional
    "impact": lambda r: domain.impact(
        asset_tag=r["asset_tag"], shots=r.get("shots", []),
        prompts=r.get("prompts", []), jobs=r.get("jobs", []),
        selects=r.get("selects", [])),

    # the conditions an asset must survive before it may lock
    "stress_matrix": lambda r: domain.stress_matrix(
        asset=r["asset"], co_stars=r.get("co_stars", []),
        scene_light=r.get("scene_light", "")),

    "stress_cells": lambda r: {"cells": domain.stress_cells(
        asset=r["asset"], co_stars=r.get("co_stars"),
        scene_lights=r.get("scene_lights"), variants=r.get("variants"))},

    "stress_run_verdict": lambda r: domain.stress_run_verdict(
        cells=r["cells"], reviews=r.get("reviews", {}),
        asset_revision=r["asset_revision"], required=r.get("required", 10)),

    "stress_verdict": lambda r: domain.stress_verdict(
        runs=r["runs"], passed=r["passed"], required=r.get("required", 10)),

    # what to do with a failing round
    "iteration": lambda r: domain.iteration_advice(
        round_n=r["round"], score=r["score"], settings=r.get("settings", {})),

    # the registry itself, for a provider-picker UI
    "registry": lambda r: REGISTRY,
}


def handle(req: dict) -> dict:
    op = req.get("op")
    if op not in OPS:
        return {"ok": False, "error": {"code": "UNKNOWN_OP", "message": op,
                                       "known": sorted(OPS)}}
    try:
        return {"ok": True, "op": op, "result": OPS[op](req)}
    except KeyError as e:
        return {"ok": False, "error": {"code": "MISSING_FIELD", "message": str(e)}}
    except Exception as e:                                    # noqa: BLE001
        return {"ok": False, "error": {"code": "ENGINE_ERROR", "message": str(e),
                                       "trace": traceback.format_exc(limit=3)}}


def main() -> None:
    if "--serve" in sys.argv:
        for line in sys.stdin:                                # one request per line
            line = line.strip()
            if not line:
                continue
            print(json.dumps(handle(json.loads(line))), flush=True)
        return
    print(json.dumps(handle(json.loads(sys.stdin.read())), indent=1))


if __name__ == "__main__":
    main()
