#!/usr/bin/env python3
"""musicbox.py — synthesise Thistlewood's hero sound: the tune that plays wrong.

    python3 engine/musicbox.py wrong   --out sfx/wrong_tune_musicbox.mp3
    python3 engine/musicbox.py right   --out sfx/right_tune_musicbox.mp3

WHY THIS IS SYNTHESISED AND NOT GENERATED
-----------------------------------------
The plot turns on a specific fact that Albert says out loud: *"The same notes
are wrong every single time."* A generative sound model cannot promise that —
ask it twice and you get two different wrongnesses, which quietly contradicts
the line the episode is built on. So the tune is built note by note here, and
the bend is a number in a table. Play it a hundred times and the same three
notes are flat by the same amount.

The tune is *Au clair de la lune* — French, traditional, out of copyright, and
recognisable within four notes even to a child who has never heard it named.

The timbre is a struck steel comb tine: a sharp attack, inharmonic partials in
roughly the ratios a thin metal bar gives, and a long exponential decay. Under
it runs the cylinder mechanism — a faint regular tick, one per note division,
because a real box you can hear the tune of is a box you can also hear working.
"""
from __future__ import annotations
import argparse, array, math, pathlib, struct, subprocess, sys, wave

SR = 44100

# Au clair de la lune. (scale degree, beats) — C major, sung an octave and a half
# up where a comb actually lives.
MELODY = [
    ("C5", 1), ("C5", 1), ("C5", 1), ("D5", 1),
    ("E5", 2), ("D5", 2),
    ("C5", 1), ("E5", 1), ("D5", 1), ("D5", 1),
    ("C5", 4),
]

SEMITONE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

# THE FAULT. This is the whole episode in four lines: the same pitches, bent by
# the same amount, on every single repeat. E is a comb tooth that has lost its
# temper and sits nearly a semitone flat; the second D drags after it.
BEND_CENTS = {"E5": -88.0, "D5": -34.0}

BPM = 96
BEAT = 60.0 / BPM


def hz(note: str) -> float:
    name, octave = note[:-1], int(note[-1])
    n = SEMITONE[name] + 12 * (octave - 4)      # semitones above C4
    return 261.6255653 * (2 ** (n / 12))


def tine(freq: float, dur: float, gain: float) -> list[float]:
    """One struck comb tooth.

    A thin steel bar is not harmonic — its overtones sit at roughly 2.76, 5.40
    and 8.93 times the fundamental, which is exactly why a music box sounds like
    glass rather than like a piano. Each partial decays faster than the one
    below it, so the note turns pure as it dies.
    """
    n = int(dur * SR)
    partials = ((1.00, 1.00, 3.2), (2.76, 0.38, 5.5), (5.40, 0.17, 8.5),
                (8.93, 0.08, 12.0), (13.3, 0.04, 16.0))
    out = [0.0] * n
    for ratio, amp, decay in partials:
        w = 2 * math.pi * freq * ratio
        for i in range(n):
            t = i / SR
            out[i] += amp * math.sin(w * t) * math.exp(-decay * t)
    # 2 ms strike so the attack has a lid on it instead of a click
    a = int(0.002 * SR)
    for i in range(min(a, n)):
        out[i] *= i / a
    return [v * gain for v in out]


def tick(dur: float, gain: float) -> list[float]:
    """The cylinder pin passing under the comb — a very short filtered thud."""
    n = int(dur * SR)
    out, prev = [0.0] * n, 0.0
    seed = 12345
    for i in range(n):
        seed = (1103515245 * seed + 12345) & 0x7FFFFFFF   # deterministic noise
        white = (seed / 0x3FFFFFFF) - 1.0
        prev = 0.86 * prev + 0.14 * white                 # one-pole lowpass
        out[i] = prev * math.exp(-90.0 * (i / SR)) * gain
    return out


def render(bend: bool, repeats: int = 2) -> list[float]:
    total = sum(b for _, b in MELODY) * BEAT * repeats + 1.6
    buf = [0.0] * int(total * SR)

    def mix(src: list[float], at: float):
        o = int(at * SR)
        for i, v in enumerate(src):
            j = o + i
            if j < len(buf):
                buf[j] += v

    t = 0.35
    for _ in range(repeats):
        for note, beats in MELODY:
            f = hz(note)
            if bend and note in BEND_CENTS:
                f *= 2 ** (BEND_CENTS[note] / 1200)
            # the tooth rings on past its written length, as a comb does
            mix(tine(f, min(beats * BEAT + 1.1, 2.6), 0.30), t)
            mix(tick(0.05, 0.05), t)
            t += beats * BEAT
        t += 0.30                       # the little hesitation before it comes round

    peak = max(abs(v) for v in buf) or 1.0
    return [v / peak * 0.82 for v in buf]


def write_wav(samples: list[float], path: pathlib.Path):
    pcm = array.array("h", (int(max(-1.0, min(1.0, v)) * 32767) for v in samples))
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def bell() -> list[float]:
    """The shop door bell — scripted twice and missing from the cut entirely.

    A small brass bell on a spring over a door: struck several times unevenly as
    the door swings, not once cleanly. Bell partials are wider than a comb's and
    the hum note underneath outlives the strike.
    """
    buf = [0.0] * int(2.6 * SR)
    strikes = ((0.00, 1.00), (0.13, 0.72), (0.24, 0.83), (0.38, 0.41),
               (0.49, 0.55), (0.66, 0.24), (0.81, 0.15))
    for at, amp in strikes:
        o = int(at * SR)
        for ratio, a2, decay in ((0.50, 0.30, 1.6), (1.00, 1.00, 2.4),
                                 (2.02, 0.55, 3.6), (3.01, 0.30, 5.0),
                                 (4.18, 0.18, 7.0), (5.43, 0.10, 9.0)):
            w = 2 * math.pi * 1180.0 * ratio
            for i in range(int(1.8 * SR)):
                j = o + i
                if j >= len(buf):
                    break
                t = i / SR
                buf[j] += amp * a2 * math.sin(w * t) * math.exp(-decay * t)
    peak = max(abs(v) for v in buf) or 1.0
    return [v / peak * 0.7 for v in buf]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("which", choices=["wrong", "right", "bell"])
    ap.add_argument("--out", required=True)
    ap.add_argument("--repeats", type=int, default=2)
    a = ap.parse_args()

    out = pathlib.Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    wav = out.with_suffix(".wav")
    samples = bell() if a.which == "bell" else render(bend=(a.which == "wrong"),
                                                      repeats=a.repeats)
    write_wav(samples, wav)

    if out.suffix == ".mp3":
        import imageio_ffmpeg
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-i", str(wav),
                        "-codec:a", "libmp3lame", "-b:a", "192k", str(out)],
                       capture_output=True, check=True)
        wav.unlink()
    print(f"  ✓ {out}  ({a.which}, {a.repeats} repeats)")


if __name__ == "__main__":
    main()
