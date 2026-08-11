# THE STUDIO LOOP — canonical product spec
## As stated by the showrunner, 2026-08-11. This ordering is law.

> Upload the script → it breaks into scenes → enter a scene to see the beats →
> in a beat: scene plate + references → make the keyframe → sign it off →
> check the beat lands in the prompt → run it through the Seedance checker →
> fires only at 9.5+ → render → approve or discuss where it didn't land →
> iterate the prompt → bank every successful prompt → analyse the bank for the
> perfect structure → next beat via last-frame-first-frame OR video extension.

## The loop, step by step (existing surface in brackets)

1. **INTAKE** — script uploaded once, locked, broken into scenes; scenes into
   beats. The page is the foundation: everything downstream interprets it,
   nothing rewrites it. [cb_intake / episodes registry — exists]
2. **BEAT WORKSPACE** — opening a beat shows: the page for that beat, the scene
   plate, the character references, and the beat's continuity contract (what
   state it opens on, what it must end on). [director session — exists]
3. **SEE** — keyframe made from plate + references, judged, signed off. The
   approved keyframe is a continuity asset: it may serve as a later unit's
   first-frame anchor. [keyframe lane — exists]
4. **PROMPT** — the compiler emits from the direction record; the room/UI shows
   it; the question asked is "does the BEAT land in this prompt?" (not "is the
   prompt pretty"). [compiled emission — exists]
5. **CHECK** — every emission runs through the Seedance conformance checker.
   **FIRING FLOOR: 9.5.** Below 9.5 nothing renders, no exceptions; findings
   come back with fix lines. (Floor raised from 8.0 by showrunner order —
   the proven Flova prompts all scored 9.5+; the floor now matches the bank.)
   [cb_emission_conformance — exists; floor must be raised]
6. **RENDER** — fire. [render lane — exists]
7. **VERDICT** — watch, then approve or diagnose. A rejection names WHERE it
   didn't land (pace / staging / identity / continuity / performance) and the
   prompt is iterated — through the compiler, never by hand. [WATCH gate +
   retake notes — exists]
8. **BANK** — an approved take banks its prompt. See PROMPT BANK below. [golden
   fixtures exist per-scene; the bank generalises them — NEW]
9. **NEXT BEAT** — continuity mode chosen per join:
   - **cut join → keyframe handoff**: previous unit's final frame becomes
     `@Image1 is the first frame.` + fresh identity references (re-anchors,
     drift cannot compound). Default.
   - **continuous join → video extension**: previous approved clip passed as
     `@Video1`, directed to continue from its end (carries momentum; use
     within an action, never across a cut; watch identity drift and input-video
     surcharge). [NEW mode in the render lane]

## PROMPT BANK (new, the analysis engine)

Every prompt that produced an APPROVED take is stored as a structured record:

    {
      "id": "...", "unit": "S1.B4", "provider": "flova|studio",
      "approvedAt": "...", "score": 9.5,
      "promptText": "<verbatim>",
      "structure": {                       // parsed at bank time
        "sections": ["AUDIO-AUTHORITY", "refs", "ownership", ...],  // in order
        "shotCount": 4, "charCount": 5583,
        "refSlots": {"images": 3, "audio": 1, "video": 0},
        "dialogueLines": 3, "holds": 2,
        "archetype": "environment-turn",
        "continuityMode": "first-frame|extension|plate"
      },
      "verdict": "<Julian's approval words, verbatim>"
    }

Rejected prompts are stored too, flagged, with the diagnosis — the contrast is
where the learning lives. The bank must be queryable: section order across all
approved prompts, char-count distribution, shot counts, which archetypes win,
wording that recurs in winners vs losers. This is how "the perfect prompt
structure" is found by evidence instead of taste — and when a pattern is
confirmed, it graduates into the Emission Standard as a versioned change.

## Non-negotiables carried forward
- The compiler emits; humans and the room direct. Hand-edited prompts are
  never banked.
- Defects fix the system (rule/cost/compiler), never the instance.
- Every rule stays software-wide: expressible without naming a character,
  shot, or scene.
