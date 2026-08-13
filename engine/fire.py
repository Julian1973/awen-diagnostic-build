#!/usr/bin/env python3
"""fire.py — fire a beat from this studio: Seedance 2.5 via fal, voice via ElevenLabs.

Endpoint and payload shape taken from the proven studioai transport
(engine/cb_gen.py + engine/provider_capabilities.json), not guessed.

    FAL_KEY=...            required for render
    ELEVENLABS_API_KEY=... required for voice

Usage:
    python3 engine/fire.py render --prompt FILE --image IMG [--image IMG] \
        [--resolution 480p] [--duration 12] [--out clip.mp4]
    python3 engine/fire.py voice  --text "line" --voice-id ID \
        [--stability 0.6] [--similarity 0.85] [--style 0.15] [--out take.mp3]

Nothing here invents a model id, a resolution or a duration: resolution and
duration are generation parameters passed explicitly (sd25-pe principle 7 —
they never belong in the prompt text).
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request

FAL_QUEUE = "https://queue.fal.run"
FAL_UPLOAD = "https://rest.alpha.fal.ai/storage/upload"
SEEDANCE_REF2VID = "bytedance/seedance-2.5/reference-to-video"
ELEVEN = "https://api.elevenlabs.io/v1"


def _need(value: str, name: str) -> str:
    if not value:
        sys.exit(f"REFUSED — {name} is not set in this environment. "
                 f"Set it as an environment secret; never paste a key into chat.")
    return value


def _req(url, *, method="GET", headers=None, data=None, timeout=120):
    req = urllib.request.Request(url, method=method, data=data, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def fal_headers():
    return {"Authorization": f"Key {_need(os.environ.get('FAL_KEY', ''), 'FAL_KEY')}"}


def upload_image(path: pathlib.Path) -> str:
    """Upload a local image to fal storage; returns its URL."""
    ctype = mimetypes.guess_type(path.name)[0] or "image/png"
    status, body = _req(
        FAL_UPLOAD, method="POST",
        headers={**fal_headers(), "Content-Type": "application/json"},
        data=json.dumps({"file_name": path.name, "content_type": ctype}).encode(),
    )
    if status >= 400:
        sys.exit(f"fal upload-init failed {status}: {body[:400].decode(errors='replace')}")
    info = json.loads(body)
    put_url, file_url = info["upload_url"], info["file_url"]
    status, body = _req(put_url, method="PUT", headers={"Content-Type": ctype},
                        data=path.read_bytes(), timeout=300)
    if status >= 400:
        sys.exit(f"fal upload-put failed {status}: {body[:400].decode(errors='replace')}")
    print(f"  uploaded {path.name} -> {file_url}")
    return file_url


def render(args) -> None:
    prompt = pathlib.Path(args.prompt).read_text(encoding="utf-8").strip()
    if len(prompt) > 5000:
        sys.exit(f"REFUSED — prompt is {len(prompt)} chars; the route ceiling is 5000.")

    image_urls = [u if str(u).startswith("http") else upload_image(pathlib.Path(u))
                  for u in args.image]
    payload = {
        "prompt": prompt,
        "image_urls": image_urls,
        "resolution": args.resolution,
        "duration": str(args.duration),
        "generate_audio": not args.no_audio,
    }
    print(f"  submitting {SEEDANCE_REF2VID} · {args.resolution} · {args.duration}s "
          f"· {len(image_urls)} refs · {len(prompt)} chars")
    status, body = _req(f"{FAL_QUEUE}/{SEEDANCE_REF2VID}", method="POST",
                        headers={**fal_headers(), "Content-Type": "application/json"},
                        data=json.dumps(payload).encode())
    if status >= 400:
        sys.exit(f"submit failed {status}: {body[:600].decode(errors='replace')}")
    job = json.loads(body)
    status_url = job.get("status_url") or f"{FAL_QUEUE}/{SEEDANCE_REF2VID}/requests/{job['request_id']}/status"
    response_url = job.get("response_url") or f"{FAL_QUEUE}/{SEEDANCE_REF2VID}/requests/{job['request_id']}"
    print(f"  queued: {job.get('request_id')}")

    deadline = time.time() + args.timeout
    while time.time() < deadline:
        time.sleep(5)
        st, sb = _req(status_url, headers=fal_headers())
        state = json.loads(sb).get("status") if st < 400 else f"HTTP {st}"
        print(f"    …{state}")
        if state == "COMPLETED":
            break
        if state in ("FAILED", "ERROR"):
            sys.exit(f"render failed: {sb[:600].decode(errors='replace')}")
    else:
        sys.exit(f"timed out after {args.timeout}s — job {job.get('request_id')} may still finish.")

    st, sb = _req(response_url, headers=fal_headers())
    if st >= 400:
        sys.exit(f"result fetch failed {st}: {sb[:400].decode(errors='replace')}")
    result = json.loads(sb)
    video_url = (result.get("video") or {}).get("url") if isinstance(result.get("video"), dict) else result.get("video")
    if not video_url:
        sys.exit(f"no video url in result: {json.dumps(result)[:600]}")
    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    st, data = _req(video_url, timeout=600)
    out.write_bytes(data)
    print(f"  ✓ {out} ({len(data)/1_000_000:.1f} MB)  source: {video_url}")


def voice(args) -> None:
    key = _need(os.environ.get("ELEVENLABS_API_KEY", ""), "ELEVENLABS_API_KEY")
    payload = {
        "text": args.text,
        "model_id": args.model,
        "voice_settings": {
            "stability": args.stability,
            "similarity_boost": args.similarity,
            "style": args.style,
        },
    }
    status, body = _req(f"{ELEVEN}/text-to-speech/{args.voice_id}", method="POST",
                        headers={"xi-api-key": key, "Content-Type": "application/json",
                                 "Accept": "audio/mpeg"},
                        data=json.dumps(payload).encode(), timeout=180)
    if status >= 400:
        sys.exit(f"tts failed {status}: {body[:400].decode(errors='replace')}")
    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(body)
    print(f"  ✓ {out} ({len(body)/1000:.0f} KB)")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("render", help="fire a Seedance 2.5 reference-to-video render via fal")
    r.add_argument("--prompt", required=True, help="file containing the emission")
    r.add_argument("--image", action="append", required=True, help="local path or URL; repeatable, in reference order")
    r.add_argument("--resolution", default="480p", choices=["480p", "720p"])
    r.add_argument("--duration", default=12)
    r.add_argument("--no-audio", action="store_true")
    r.add_argument("--out", default="clip.mp4")
    r.add_argument("--timeout", type=int, default=900)
    r.set_defaults(func=render)

    v = sub.add_parser("voice", help="render an approved line through ElevenLabs")
    v.add_argument("--text", required=True)
    v.add_argument("--voice-id", required=True)
    v.add_argument("--model", default="eleven_v3")
    v.add_argument("--stability", type=float, default=0.6)
    v.add_argument("--similarity", type=float, default=0.85)
    v.add_argument("--style", type=float, default=0.15)
    v.add_argument("--out", default="take.mp3")
    v.set_defaults(func=voice)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
