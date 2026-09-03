# Wiring The Room into the studio (Codex instruction)

`room.html` is the conversational surface for the EXISTING pipeline — not a
second pipeline. It reads `/api/director-session`, fires `/api/director-action`,
and renders the session's `artifact` inline. Three steps make it live:

## 1. Serve the file
Add to `_APPROVED_FILES` in `cb-studio/serve.py` (STATIC hardening block,
next to `director.html`):

    "/cb-studio/room.html",             # The Room — conversational pipeline surface

Restart the server (the allowlist loads at startup only).

## 2. Add the chat proxy — `/api/room-chat`
The Room's crew brain should use the key already on this machine, same-origin
(passes the CSP). One POST endpoint in serve.py:

    Request  JSON: { "system": [ {type:"text", text:..., cache_control?}, ... ],
                     "messages": [ {role:"user"|"assistant", content:str}, ... ] }
    Behaviour:     forward verbatim to POST https://api.anthropic.com/v1/messages
                   model "claude-opus-5", max_tokens 2048,
                   headers: x-api-key from the server-side key,
                            anthropic-version: 2023-06-01
                   Pass `system` through UNCHANGED (it carries cache_control
                   breakpoints — do not flatten it to a string).
    Response JSON: { "text": "<joined text blocks>" }
                   Non-200 from Anthropic → same status + body text through.
                   stop_reason "refusal" → { "text": "", "refusal": true }.

No key on the machine → return 404 (the Room then falls back to its own
browser key, and to offline canon checks).

## 3. Verdict → action mapping (verify, don't change)
The Room maps spoken verdicts onto the session's existing actions by keyword:
PASS → first action whose id/label matches /approve|accept|sign|confirm|keep|lock/,
REJECT → /reject|retake|refuse|fail|redo|block/ (REJECT sends the spoken reason
as `note`). If a decision's action ids fall outside those patterns, either the
patterns gain a word (tell Claude) or the action label is shown to Julian to
type verbatim — no new API needed. Confirm `/api/director-action` accepts
`note` on the reject-family actions (it already does for save-retake-note).

## Acceptance
- launch link → /cb-studio/room.html returns 200, header shows "pipeline connected"
- selecting a shot shows the same artifact the director UI shows
- a spoken "no — <reason>" on a decision fires the reject action with the note
  attached, and the session refreshes to the retake state
- `test_static_hardening.py` still passes
