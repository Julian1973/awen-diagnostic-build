# THE PIPELINE
Every shot in every episode passes through these nine stages, in order. A shot
cannot skip a stage. Nothing is fired that has not cleared stage 6.

| # | Stage | Definition | Gate |
|---|---|---|---|
| 1 | **SCRIPT** | The beat exists in the shooting script, verbatim | script is the authority; no invented beats, no paraphrased dialogue |
| 2 | **DIRECTED** | Scene broken to shots in a direction package: interpretation, clocks, cut reasons | every scripted beat present and in order |
| 3 | **SETUP** | The camera setup this shot belongs to is identified and shared with its siblings | screen direction held across the scene |
| 4 | **KEYFRAME** | The anchor image exists, gated against canon | continuity gate — geometry, cast, props, state, text |
| 5 | **VOICE** | The line(s) recorded in ElevenLabs, duration measured | shot length is cut to the line, never the reverse |
| 6 | **EMISSION** | Prompt written and scored | **≥ 9.5 or it does not fire** |
| 7 | **TAKE** | Fired on the house route | minimax H3 reference-to-video, 768P, the full reference set, 5–15s |
| 8 | **ASSEMBLE** | Picture cut together with the recorded dialogue, sound effects, room tone and music | **nothing silent is ever presented for judgement** |
| 9 | **APPROVED** | Julian's verdict, on the assembled shot | approved shots enter the bank; rejected ones become farmed negatives |

## The rules that make it a pipeline and not a sequence of favours

**Stage 1 is not optional and not remembered.** The script is opened, in the
session, before a shot is directed. Cost of learning this: one entirely invented
beat.

**Stage 4 gates against canon, not against taste.** The continuity gate runs
before an image is used as an anchor, and it quotes the prompt's own words back
when it fires.

**Stage 5 comes before stage 6.** Shot length is derived from the recorded line,
not guessed and then filled. This is how we found that two of Tom's speeches are
longer than the maximum take and the scene therefore *must* be covered.

**Stage 6 is a hard floor.** 9.5. Fired ungated once today, retro-scored 9.0,
and it failed. Speed is not a reason to skip the gate; the gate exists for the
moments when there is a reason to hurry.

**Stage 9 feeds stage 6.** Every verdict is banked — approved takes as positives,
rejected ones as negatives with the reusable shape named. NEG-001 produced the
motion budget; the motion budget designed POS-001.

## The house constraints, measured not assumed

The route is **minimax/h3/reference-to-video**. It takes an array of reference
images and an array of reference audio, and it has **no first frame** — it
composes the shot from the references. Everything below follows from that.

- **The reference set is ordered and roled.** Image 1 is always the room plate,
  then the cast in the order the shot lists them, then any hero prop that carries
  its own sheet, and the blocking frame LAST. Eight references is the working
  ceiling; past that identity starts to slip.
- **The blocking frame contributes camera and staging only.** Never room, never
  lighting, never a face. This is what lets the six Act One setups keep working
  now the shop plate has changed — the old frames still know where the camera
  goes, and PL-04b supplies the room they no longer show correctly.
- **The scripted line goes in the prompt, and the generated voice is thrown
  away.** Putting the line in the prompt is what makes the mouth articulate
  roughly the right words. H3's own speech drifts and invents words partway
  through a take, so assembly maps the video stream only (`-map 0:v`) and lays
  our ElevenLabs v3 recording over it. Reference audio fixes voice character;
  it never supplies words.
- **Listener shots carry no line at all.** The safest dialogue shot available is
  a silent face receiving a line that arrives in post.
- **Duration 5–15s.** Below five the route refuses; beats shorter than that are
  shot at five and trimmed with `cut_to`. Every length is measured off the
  recorded line, never guessed.
- **Reference audio needs 2.0s minimum.** Lines shorter than that get their
  reference tripled — it fixes voice only, so repetition costs nothing.
- **Two-state props:** the back door (dormant / backlit) and Richard's apron
  (without / tying / with). The apron state is declared per shot in the wardrobe
  block, so no shot fights its own reference.


## Stage 8 exists because it was missed

Two shots were fired, delivered and offered for verdict as **silent picture**,
while their dialogue sat recorded on disk. Julian: *"the shot looks great but
what does it do — there is no dialog."* He is right. A seven-second clip of a
face with no line under it is a texture, not a shot, and no useful verdict can
be given on it.

**A shot is picture + dialogue + effects + room tone + music.** The route
generates none of the audio — H3 is silent by design — so assembly is not
optional polish, it is the step that makes the thing exist.

**The sound sources:**
- **Dialogue** — ElevenLabs `eleven_v3` with inline performance direction taken
  from the script's parentheticals and each character's cadence card, recorded
  for the whole of Act One before a frame was shot. This is the only voice that
  ever reaches the cut.
- **Effects and the hero sound** — ElevenLabs sound generation. The wrong tune
  is the episode's central sound and is now a real asset, not a description.
- **Room tone** — generated per location, laid under everything at low level so
  cuts between shots do not click.
- **Music** — none in Act One by design. The music box is the only music, and it
  is diegetic.

**Assembly is where the shot lengths pay off.** Every shot was cut to its
recorded line at stage 5, so the dialogue drops in without stretching.

## Stage 6 is now mechanised, and here is why it had to be

For most of a day the gate that cleared prompts was a homemade nine-check Python
function wearing the prompt optimiser's name. It passed everything and caught
nothing, twice.

What replaced it compiles each shot from a **single cast block** — every
character defined once in `shots.json`, every shot resolving against it — and
then checks the compiled text against the optimiser's own pre-submission list:
every cited reference index exists, every supplied reference is cited, every
character is bound to exactly one image and told what not to contribute, the
scripted line is present verbatim and in braces, every mouth in frame is
assigned, ambience is specified because the route will otherwise invent it,
group frames carry depth and an anti-lineup negative, scale is given by body
landmark and never by number, and no character is ever described anonymously.

**That last check is the important one.** Before the rebuild, FR01 named
`<Tom>` and bound him to a sheet, while FR04 said "the man in the navy parka"
and bound him to nothing. The faces drifted because the shot table let them.
