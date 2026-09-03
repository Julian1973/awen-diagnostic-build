#!/usr/bin/env python3
"""studio.py — the provider-agnostic production OS. This one runs.

    python3 studio/studio.py init "Project Name"
    python3 studio/studio.py stack                      # what this project resolves to
    python3 studio/studio.py asset add tom --type character --name "Tom Chen"
    python3 studio/studio.py asset describe tom --descriptor "…" --scale "…" --face "…"
    python3 studio/studio.py asset file tom --role hero --path sheets/tom.jpg
    python3 studio/studio.py board add style "The look"
    python3 studio/studio.py board ref style --path x.jpg --caption "…" --controls "…"
    python3 studio/studio.py board decide style approved --note "…"
    python3 studio/studio.py stress tom --runs 10 --passed 10
    python3 studio/studio.py asset lock tom
    python3 studio/studio.py shot add FR01 --scene 1 --card card.json
    python3 studio/studio.py compile FR01
    python3 studio/studio.py audit FR01 --pass 9.7 --notes "…"
    python3 studio/studio.py gates FR01                 # what is refusing, and why
    python3 studio/studio.py brief FR01
    python3 studio/studio.py fire FR01

The database is SQLite so it runs anywhere with no service to stand up; the
Postgres schema in schema.sql is the same shape for when this moves behind a web
application. Nothing here names a model — providers.json is resolved at every
decision point, so swapping the stack is a data change.
"""
from __future__ import annotations
import argparse, hashlib, json, os, pathlib, sqlite3, subprocess, sys, time

ROOT = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import domain                                   # the rules live in exactly one place
REG = json.loads((ROOT / "providers.json").read_text())
TREE = ["assets", "prompts", "generations", "selects", "edit", "color", "sound",
        "master", "docs"]

FOLDER_LAW = """THE THREE FOLDER LAWS

1. Only `selects` is visible to the edit. Nothing else is.
2. Nobody but the prompt engineer enters `generations`.
3. A reference file is NEVER renamed. A new version is a new file, because
   renaming breaks every prompt version that points at the old path.
"""


# ─────────────────────────────────────────────────────────────────────────────
# storage
# ─────────────────────────────────────────────────────────────────────────────

SCHEMA = """
create table if not exists project(
  id integer primary key check(id=1), name text, slug text, created text,
  style_lock text default '', audit_floor real default 9.5,
  attempt_cap integer default 15, simplify_at integer default 8,
  tail_trim real default 0.4, repeatability integer default 10,
  stack text default '{}');

create table if not exists assets(
  tag text primary key, type text, name text, version integer default 1,
  status text default 'draft', descriptor text default '',
  must_not_contribute text default '', scale_landmark text default '',
  default_expression text default '', parent text, locked_at text);

create table if not exists asset_files(
  id integer primary key autoincrement, tag text, role text, path text,
  created text, unique(tag, role, path));

create table if not exists boards(
  name text primary key, title text, decision text default 'pending',
  note text, decided_at text);

create table if not exists board_refs(
  id integer primary key autoincrement, board text, path text, caption text,
  controls text, must_not_touch text, anti integer default 0);

create table if not exists stress(
  id integer primary key autoincrement, tag text, runs integer, passed integer,
  verdict text, matrix text, tested_at text);

create table if not exists shots(
  code text primary key, scene integer, ord integer, card text,
  frame_source text default 'keyframe', chain_from text,
  room_scope text default 'full', speaker text, speaker_box text,
  lead_in real default 0.5, cut_to real, seconds real default 5,
  status text default 'draft');

create table if not exists shot_assets(
  shot text, tag text, role text, required integer default 1, ref_order integer,
  primary key(shot, tag));

create table if not exists prompts(
  id integer primary key autoincrement, shot text, version integer,
  text text, hash text, manifest text, change_note text, created text,
  unique(shot, version));

create table if not exists audits(
  id integer primary key autoincrement, shot text, round integer, hash text,
  score real, notes text, created text);

create table if not exists jobs(
  id integer primary key autoincrement, shot text, prompt_hash text,
  idem text unique, provider text, model text, task_id text, status text,
  attempt integer, payload text, out_path text, sync_path text,
  failure text, created text, completed text);

create table if not exists deps(
  id integer primary key autoincrement, up_type text, up_id text, up_rev integer,
  down_type text, down_id text, reason text, created text);

create table if not exists lessons(
  code text primary key, kind text, title text, body text, enforced_by text);
"""


def db(project: pathlib.Path) -> sqlite3.Connection:
    c = sqlite3.connect(project / "docs" / "studio.db")
    c.row_factory = sqlite3.Row
    c.executescript(SCHEMA)
    return c


def find_project(start: pathlib.Path | None = None) -> pathlib.Path:
    p = (start or pathlib.Path.cwd()).resolve()
    for cand in [p, *p.parents]:
        if (cand / "docs" / "studio.db").exists():
            return cand
    sys.exit("no studio here — run `studio.py init \"Name\"` first")


def now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S")


def phash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


# ─────────────────────────────────────────────────────────────────────────────
# the stack — resolved, never named
# ─────────────────────────────────────────────────────────────────────────────

def stack(conn) -> dict:
    """Resolve the house stack into capability dicts. Nothing above this reads
    providers.json directly, and nothing anywhere names a model."""
    row = conn.execute("select stack from project").fetchone()
    house = {**REG["house"], **(json.loads(row["stack"]) if row and row["stack"] else {})}
    return {
        "video":   {"key": house["video"],   **REG["video"][house["video"]]},
        "image":   {"key": house["image"],   **REG["image"][house["image"]]},
        "voice":   {"key": house["voice"],   **REG["voice"][house["voice"]]},
        "lipsync": {"key": house["lipsync"], **REG["lipsync"][house["lipsync"]]},
        "house": house,
    }


def derive(s: dict) -> dict:
    """Delegated to domain.derive so the CLI and the SaaS can never disagree
    about what a capability implies."""
    return domain.derive(s)


# ─────────────────────────────────────────────────────────────────────────────
# THE GATES — they refuse, or they are not gates
# ─────────────────────────────────────────────────────────────────────────────

def gates(conn, shot_code: str) -> list[tuple[str, bool, str]]:
    s = stack(conn); d = derive(s)
    pr = conn.execute("select * from project").fetchone()
    shot = conn.execute("select * from shots where code=?", (shot_code,)).fetchone()
    if not shot:
        sys.exit(f"no shot {shot_code}")
    out = []

    pending = conn.execute("select name from boards where decision='pending'").fetchall()
    out.append(("A · boards decided", not pending,
                "pending: " + ", ".join(r["name"] for r in pending) if pending
                else "every board carries a written decision"))

    unlocked = conn.execute("""select a.tag, a.status from shot_assets sa
        join assets a on a.tag=sa.tag
        where sa.shot=? and sa.required=1 and a.status<>'locked'""", (shot_code,)).fetchall()
    out.append(("B · rows locked", not unlocked,
                "not locked: " + ", ".join(f"{r['tag']}({r['status']})" for r in unlocked)
                if unlocked else "every required asset is locked"))

    cur = conn.execute("select * from prompts where shot=? order by version desc limit 1",
                       (shot_code,)).fetchone()
    if not cur:
        out.append(("C · prompt audited", False, "nothing compiled yet"))
    else:
        ok = conn.execute("""select max(score) m from audits
            where shot=? and hash=?""", (shot_code, cur["hash"])).fetchone()["m"]
        out.append(("C · prompt audited", bool(ok and ok >= pr["audit_floor"]),
                    f"cleared at {ok} on the current text" if ok and ok >= pr["audit_floor"]
                    else (f"best round on this text is {ok}, floor is {pr['audit_floor']}"
                          if ok else "the current text has no round of its own")))

    faces = conn.execute("""select count(*) n from shot_assets sa join assets a on a.tag=sa.tag
        where sa.shot=? and a.type='character'""", (shot_code,)).fetchone()["n"]
    needs = (d["needs_speaker_box_when_multi_face"] and faces > 1 and shot["speaker"])
    out.append(("D · speaker assigned", (not needs) or bool(shot["speaker_box"]),
                f"{faces} faces and a line, and the sync route cannot choose — box required"
                if needs and not shot["speaker_box"]
                else ("boxed to " + shot["speaker"] if shot["speaker_box"]
                      else "single face or no line; nothing to disambiguate")))
    return out


# ─────────────────────────────────────────────────────────────────────────────
# the compiler
# ─────────────────────────────────────────────────────────────────────────────

def compile_prompt(conn, shot_code: str) -> tuple[str, list[dict]]:
    s = stack(conn); d = derive(s)
    pr = conn.execute("select * from project").fetchone()
    shot = conn.execute("select * from shots where code=?", (shot_code,)).fetchone()
    card = json.loads(shot["card"] or "{}")
    rows = conn.execute("""select sa.*, a.* from shot_assets sa join assets a on a.tag=sa.tag
        where sa.shot=? order by coalesce(sa.ref_order, 99)""", (shot_code,)).fetchall()

    manifest, out = [], []

    # Image 1 — where the first frame comes from. Order is the contract.
    if shot["frame_source"] == "keyframe":
        manifest.append({"order": 1, "role": "first frame",
                         "path": f"assets/keyframes/{shot_code}.png",
                         "controls": "the complete opening composition"})
        out.append("Image 1 is the first frame. It defines the complete opening composition: "
                   "every subject's position and pose, the prop state, the room, the lighting "
                   "and the camera direction. Reproduce it exactly as the shot's opening frame "
                   "and animate forward from there; do not restage it and do not recompose it."
                   if d["must_assert_composition"] else
                   "Image 1 is the first frame of this shot.")
    else:
        cont = shot["frame_source"] == "chain_continue"
        manifest.append({"order": 1, "role": "previous last frame",
                         "path": f"generations/_endframe_{shot['chain_from']}.png",
                         "controls": "continuity" + (" and composition" if cont else "")})
        out.append(
            f"Image 1 is the final frame of the preceding shot, {shot['chain_from']}. "
            + ("The camera has NOT cut: this is the same angle continuing, so its framing, "
               "dressing, light and prop positions all carry over exactly."
               if cont else
               "It defines what is TRUE in the room at the moment this shot begins — the state "
               "and position of every prop, the lighting and the colour. It does NOT define "
               "this shot's framing: the camera has cut to a new angle, described below. "
               "Carry its continuity, not its composition."))

    for i, a in enumerate(rows, start=len(manifest) + 1):
        if len(manifest) >= d["refs_max"]:
            break
        f = conn.execute("select path from asset_files where tag=? and role='hero'",
                         (a["tag"],)).fetchone()
        manifest.append({"order": i, "role": f"{a['tag']} appearance",
                         "path": f["path"] if f else "", "controls": a["descriptor"],
                         "must_not_touch": a["must_not_contribute"]})
        out.append(f"Image {i} defines {a['name']}'s appearance only — {a['descriptor']}. "
                   + (a["must_not_contribute"] or "Do not use its background or layout."))

    out.append("")

    # room scope — describe the frame, not the location
    scope = shot["room_scope"]
    where = card.get("identity", {}).get("location", "the location")
    if scope == "none":
        out.append(f"In {where}, of which this frame shows only what Image 1 already contains, "
                   f"{card.get('identity', {}).get('description', '')}")
        out.append("The framing stays exactly as tight as the first frame for the whole take. "
                   "It never widens and never pulls back, and no further part of the location "
                   "becomes visible at any point.")
    elif scope == "partial":
        out.append(f"In {where}, of which only a shallow soft slice is visible behind the "
                   f"figure, {card.get('identity', {}).get('description', '')}")
    else:
        out.append(f"In {where}, {card.get('identity', {}).get('description', '')}")
    out.append("")

    if card.get("direction", {}).get("acting"):
        out.append(card["direction"]["acting"])
        out.append("")

    # the mouth. Words never enter when the route invents speech.
    if shot["speaker"]:
        sp = conn.execute("select name from assets where tag=?", (shot["speaker"],)).fetchone()
        name = sp["name"] if sp else shot["speaker"]
        if d["prompt_carries_dialogue"]:
            out.append(f'{name} says: "{card.get("identity", {}).get("dialogue", "")}"')
        else:
            out.append(f"{name} is the only person who speaks. Animate the mouth as natural "
                       f"conversational speech, the jaw and head carrying a talking rhythm, but "
                       f"do NOT attempt specific words or lip shapes — the articulation is "
                       f"replaced from a separate recording afterwards, and guessing at words "
                       f"here only fights that pass.")
        for a in rows:
            if a["type"] == "character" and a["tag"] != shot["speaker"]:
                out.append(f"{a['name']} does not speak: the mouth stays closed, though "
                           f"{a['name']} is never frozen — the body keeps living and reacting.")
        out.append("")

    if pr["style_lock"]:
        out.append(f"The visuals feature {pr['style_lock']}")
        out.append("")

    cam = card.get("cameraEdit", {})
    if cam:
        out.append(f"Use a {cam.get('size','')} {cam.get('angle','')}, {cam.get('movement','locked off')}, "
                   f"on a {cam.get('lens','single lens')}, in one continuous take with no cuts.".replace("  ", " "))
        out.append("")

    if card.get("audio"):
        out.append(f"Audio includes {card['audio']}")
        out.append("")

    keep = ["Keep every character's identity, face, hair and clothing, the number of characters, "
            "the layout, the lighting and the screen direction consistent from the first frame "
            "to the last."]
    props = [a["name"] for a in rows if a["type"] == "prop"]
    if props:
        keep.append("The prop count never changes: exactly one " + ", one ".join(props) + ".")
    out.append("[Maintain Consistency]")
    out.append(" ".join(keep))

    return "\n".join(out).strip() + "\n", manifest


# ─────────────────────────────────────────────────────────────────────────────
# commands
# ─────────────────────────────────────────────────────────────────────────────

def cmd_init(a):
    root = pathlib.Path(a.name.lower().replace(" ", "-"))
    for d in TREE:
        (root / d).mkdir(parents=True, exist_ok=True)
    (root / "docs" / "FOLDER_LAWS.md").write_text(FOLDER_LAW)
    conn = db(root)
    conn.execute("insert or replace into project(id,name,slug,created,stack) values(1,?,?,?,?)",
                 (a.name, root.name, now(), json.dumps({})))
    conn.commit()
    s = stack(conn)
    print(f"  ✓ {root}/  — {len(TREE)} folders, three folder laws, one database")
    print(f"    video   {s['video']['key']}   refs≤{s['video']['refs_max']} "
          f"{s['video']['dur'][0]}-{s['video']['dur'][1]}s  speech={s['video']['speech']}")
    print(f"    image   {s['image']['key']}\n    voice   {s['voice']['key']}"
          f"\n    lipsync {s['lipsync']['key']}  face_select={s['lipsync']['face_select']}")


def cmd_stack(a):
    conn = db(find_project()); s = stack(conn); d = derive(s)
    print("  RESOLVED STACK")
    for k in ("image", "video", "voice", "lipsync"):
        print(f"    {k:<8} {s[k]['key']:<22} {s[k].get('route') or 'manual'}")
    print("\n  WHAT THAT DECIDES, WITHOUT ANYONE CHOOSING IT")
    print(f"    dialogue words in the prompt   {d['prompt_carries_dialogue']}")
    print(f"    composition must be asserted   {d['must_assert_composition']}")
    print(f"    speaker box on multi-face      {d['needs_speaker_box_when_multi_face']}")
    print(f"    reference ceiling              {d['refs_max']}")
    print(f"    duration range                 {d['dur'][0]}–{d['dur'][1]}s")
    print(f"    generated audio discarded      {d['discard_generated_audio']}")


def cmd_asset(a):
    conn = db(find_project())
    if a.action == "add":
        conn.execute("insert or replace into assets(tag,type,name) values(?,?,?)",
                     (a.tag, a.type, a.name or a.tag))
        print(f"  ✓ {a.tag}  {a.type}  draft")
    elif a.action == "describe":
        conn.execute("""update assets set descriptor=coalesce(?,descriptor),
            scale_landmark=coalesce(?,scale_landmark),
            default_expression=coalesce(?,default_expression),
            must_not_contribute=coalesce(?,must_not_contribute) where tag=?""",
                     (a.descriptor, a.scale, a.face, a.exclude, a.tag))
        print(f"  ✓ {a.tag} described")
    elif a.action == "file":
        conn.execute("insert or ignore into asset_files(tag,role,path,created) values(?,?,?,?)",
                     (a.tag, a.role, a.path, now()))
        print(f"  ✓ {a.tag} + {a.role}")
    elif a.action == "lock":
        r = conn.execute("select * from assets where tag=?", (a.tag,)).fetchone()
        pr = conn.execute("select repeatability from project").fetchone()
        st = conn.execute("select * from stress where tag=? order by id desc limit 1",
                          (a.tag,)).fetchone()
        f = conn.execute("select count(*) n from asset_files where tag=?", (a.tag,)).fetchone()
        if not r["descriptor"]:
            sys.exit(f"  ✗ {a.tag} has no descriptor — cannot lock")
        if not f["n"]:
            sys.exit(f"  ✗ {a.tag} has no reference file — cannot lock")
        if not st or st["verdict"] != "pass":
            sys.exit(f"  ✗ {a.tag} has not passed the stress test — a passport built on one "
                     f"lucky image is a false victory. Run `stress {a.tag}` to "
                     f"{pr['repeatability']}/{pr['repeatability']} first.")
        conn.execute("update assets set status='locked', locked_at=? where tag=?", (now(), a.tag))
        print(f"  ✓ {a.tag} LOCKED — {st['passed']}/{st['runs']}")
    elif a.action == "list":
        for r in conn.execute("select * from assets order by type, tag"):
            print(f"  {r['tag']:<14} {r['type']:<10} {r['status']:<10} {r['name']}")
    conn.commit()


def cmd_board(a):
    conn = db(find_project())
    if a.action == "add":
        conn.execute("insert or replace into boards(name,title) values(?,?)", (a.name, a.title))
        print(f"  ✓ board {a.name} — pending")
    elif a.action == "ref":
        if not a.caption:
            sys.exit("  ✗ every image needs a caption naming what is taken from it. "
                     "An uncaptioned image is junk in a week.")
        conn.execute("""insert into board_refs(board,path,caption,controls,must_not_touch,anti)
            values(?,?,?,?,?,?)""", (a.name, a.path, a.caption, a.controls or "",
                                     a.must_not_touch or "", 1 if a.anti else 0))
        print(f"  ✓ {a.name} + {'ANTI-' if a.anti else ''}reference")
    elif a.action == "decide":
        d = (a.title or "").lower()
        if d not in ("approved", "revise", "rejected"):
            sys.exit("  ✗ a decision is approved | revise | rejected, and it is WRITTEN. "
                     "A style approved verbally means two people are holding different films.")
        conn.execute("update boards set decision=?, note=?, decided_at=? where name=?",
                     (d, a.note or "", now(), a.name))
        print(f"  ✓ {a.name} {d.upper()} — written, not verbal")
    elif a.action == "list":
        for r in conn.execute("select * from boards"):
            print(f"  {r['name']:<14} {r['decision']:<10} {r['title']}")
    conn.commit()


def cmd_stress(a):
    """The stage a passport cannot lock without.

    Higgsfield's, and the one this studio conspicuously lacked: an asset proves
    itself under combat conditions as cheap stills before any expensive video
    render. Two faults were found on screen at render cost that a page of stills
    would have caught.
    """
    conn = db(find_project())
    pr = conn.execute("select repeatability from project").fetchone()
    need = pr["repeatability"]
    co = [r["name"] for r in conn.execute(
        """select distinct a.name from shot_assets sa join assets a on a.tag=sa.tag
           where a.type='character' and a.tag<>? and sa.shot in
           (select shot from shot_assets where tag=?)""", (a.tag, a.tag))]
    matrix = {"angles": ["front", "three-quarter", "profile"],
              "sizes": ["wide", "mid", "close"],
              "light": "the actual scene light, not the sheet's neutral ground",
              "two_shots": co or ["(no co-stars in any shot yet)"]}
    if a.passed is None:
        print(f"  COMBAT MATRIX · {a.tag}")
        for k, v in matrix.items():
            print(f"    {k:<11} {v if isinstance(v, str) else ', '.join(v)}")
        print(f"\n  Generate these as stills, then record: stress {a.tag} "
              f"--runs {need} --passed <n>")
        return
    verdict = "pass" if (a.passed >= need and a.runs >= need) else "fail"
    conn.execute("""insert into stress(tag,runs,passed,verdict,matrix,tested_at)
        values(?,?,?,?,?,?)""", (a.tag, a.runs, a.passed, verdict, json.dumps(matrix), now()))
    conn.execute("update assets set status=? where tag=? and status<>'locked'",
                 ("testing" if verdict == "fail" else "testing", a.tag))
    conn.commit()
    print(f"  {a.tag}  {a.passed}/{a.runs}  {verdict.upper()}"
          + ("" if verdict == "pass" else
             f" — below {need}/{need}, the row stays draft and its scenes stay closed"))


def cmd_shot(a):
    conn = db(find_project())
    if a.action == "add":
        card = json.loads(pathlib.Path(a.card).read_text()) if a.card else {}
        conn.execute("""insert or replace into shots(code,scene,ord,card,frame_source,
            chain_from,room_scope,speaker,speaker_box,lead_in,cut_to,seconds)
            values(?,?,?,?,?,?,?,?,?,?,?,?)""",
                     (a.code, a.scene, a.ord or 0, json.dumps(card), a.frame_source,
                      a.chain_from, a.room_scope, a.speaker,
                      json.dumps(a.box) if a.box else None, a.lead_in, a.cut_to, a.seconds))
        print(f"  ✓ shot {a.code}  scene {a.scene}  {a.frame_source}  room={a.room_scope}")
    elif a.action == "use":
        for i, tag in enumerate(a.tags, start=1):
            conn.execute("""insert or replace into shot_assets(shot,tag,role,required,ref_order)
                values(?,?,?,1,?)""", (a.code, tag, "in-frame", i))
        print(f"  ✓ {a.code} uses {', '.join(a.tags)} — order is the contract")
    conn.commit()


def cmd_compile(a):
    conn = db(find_project())
    text, manifest = compile_prompt(conn, a.shot)
    h = phash(text)
    last = conn.execute("select max(version) v from prompts where shot=?", (a.shot,)).fetchone()
    v = (last["v"] or 0) + 1
    prev = conn.execute("select text from prompts where shot=? order by version desc limit 1",
                        (a.shot,)).fetchone()
    if prev and prev["text"] == text:
        print(f"  {a.shot}  unchanged — still version {last['v']}, hash {h}")
        return
    conn.execute("""insert into prompts(shot,version,text,hash,manifest,change_note,created)
        values(?,?,?,?,?,?,?)""", (a.shot, v, text, h, json.dumps(manifest),
                                   a.note or "recompiled", now()))
    conn.commit()
    print(f"  {a.shot}  v{v}  hash {h}  {len(text)} chars  {len(manifest)} references")
    print(f"  → the audit is now stale by definition: this text has never been scored")


def cmd_audit(a):
    conn = db(find_project())
    pr = conn.execute("select audit_floor, simplify_at from project").fetchone()
    cur = conn.execute("select * from prompts where shot=? order by version desc limit 1",
                       (a.shot,)).fetchone()
    if not cur:
        sys.exit("  ✗ nothing compiled")
    if a.record is None:
        rows = conn.execute("select * from audits where shot=? order by round", (a.shot,)).fetchall()
        if not rows:
            print(f"  {a.shot}  NEVER AUDITED — text {cur['hash']}")
            return
        for r in rows:
            live = "  ← current text" if r["hash"] == cur["hash"] else ""
            print(f"  round {r['round']}  {r['score']:>4} {'✓' if r['score']>=pr['audit_floor'] else '✗'}"
                  f"  {r['hash']}{live}")
            if r["notes"]:
                print(f"            {r['notes']}")
        return
    prior = conn.execute("""select score from audits where shot=? and hash=?
        order by round desc limit 1""", (a.shot, cur["hash"])).fetchone()
    if prior and prior["score"] < pr["audit_floor"] and a.record >= pr["audit_floor"] and not a.force:
        sys.exit(f"  ✗ this exact text already scored {prior['score']}. A pass on unchanged "
                 f"words is the loop being talked out of its own verdict — correct the prompt, "
                 f"recompile, and audit the NEW text. (--force to override deliberately.)")
    n = (conn.execute("select max(round) r from audits where shot=?", (a.shot,)).fetchone()["r"] or 0) + 1
    conn.execute("""insert into audits(shot,round,hash,score,notes,created)
        values(?,?,?,?,?,?)""", (a.shot, n, cur["hash"], a.record, a.notes or "", now()))
    conn.commit()
    if a.record >= pr["audit_floor"]:
        print(f"  {a.shot}  round {n}: {a.record} on {cur['hash']} — CLEARS {pr['audit_floor']}")
    else:
        print(f"  {a.shot}  round {n}: {a.record} on {cur['hash']} — BELOW {pr['audit_floor']}. "
              f"Correct it, then audit the corrected text: it is a new prompt.")
        if n >= pr["simplify_at"]:
            print(f"  {'':>8}  STOP REWORDING. Past round {pr['simplify_at']} the SHOT is wrong, "
                  f"not the sentence — split the beat, drop an action, or change the angle.")


def cmd_gates(a):
    conn = db(find_project())
    allok = True
    for name, ok, why in gates(conn, a.shot):
        allok &= ok
        print(f"  {'PASS' if ok else 'REFUSE'}  {name:<22} {why}")
    print(f"\n  {a.shot} " + ("is clear to fire" if allok else "CANNOT FIRE"))
    return 0 if allok else 1


def cmd_brief(a):
    conn = db(find_project())
    cur = conn.execute("select * from prompts where shot=? order by version desc limit 1",
                       (a.shot,)).fetchone()
    if not cur:
        sys.exit("  ✗ nothing compiled")
    s = stack(conn)
    shot = conn.execute("select * from shots where code=?", (a.shot,)).fetchone()
    print("=" * 74); print(f"{a.shot}  —  FIRING BRIEF"); print("=" * 74)
    print(f"  route     {s['video']['key']} · {s['video'].get('route')} · {shot['seconds']}s")
    print(f"  prompt    v{cur['version']}  hash {cur['hash']}")
    print("\n  REFERENCES SENT, IN THIS ORDER")
    for m in json.loads(cur["manifest"]):
        print(f"    Image {m['order']}. {m['path'] or '(missing)'}  — {m['role']}")
    print("\n  GATES")
    for name, ok, why in gates(conn, a.shot):
        print(f"    {'PASS  ' if ok else 'REFUSE'} {name:<22} {why}")
    print("\n  THE PROMPT, IN FULL, EXACTLY AS SENT")
    print("  " + "-" * 70)
    for ln in cur["text"].rstrip().splitlines():
        print("  " + ln if ln else "")
    print("  " + "-" * 70)


def cmd_fire(a):
    conn = db(find_project())
    bad = [n for n, ok, _ in gates(conn, a.shot) if not ok]
    if bad:
        sys.exit(f"  ✗ REFUSED — {'; '.join(bad)}. Run `gates {a.shot}` for the detail.")
    cur = conn.execute("select * from prompts where shot=? order by version desc limit 1",
                       (a.shot,)).fetchone()
    idem = phash(a.shot + cur["hash"])
    if conn.execute("select 1 from jobs where idem=?", (idem,)).fetchone() and not a.force:
        print(f"  {a.shot}  a job already exists for this exact prompt — not double-charging")
        return
    s = stack(conn)
    n = (conn.execute("select max(attempt) a from jobs where shot=?", (a.shot,)).fetchone()["a"] or 0) + 1
    conn.execute("""insert into jobs(shot,prompt_hash,idem,provider,model,status,attempt,
        payload,created) values(?,?,?,?,?,?,?,?,?)""",
                 (a.shot, cur["hash"], idem, s["video"]["transport"], s["video"]["key"],
                  "validated", n, cur["manifest"], now()))
    conn.commit()
    print(f"  {a.shot}  job {n} written BEFORE the provider request, idem {idem}")
    print(f"  → submit via the {s['video']['transport']} transport; poll, ingest to owned "
          f"storage, then sync and review")



# ─────────────────────────────────────────────────────────────────────────────
# downstream invalidation
# ─────────────────────────────────────────────────────────────────────────────

def cmd_impact(a):
    """What does changing this asset invalidate?

    An approval is stamped against a state of the world, not against a file. When
    a passport, plate or script line moves, everything downstream of it is
    PROVISIONAL again — not deleted, not silently still-approved. This walks the
    graph and says so.

    Earned the hard way: an approved take was the one shot nobody rebuilt when
    the room changed, precisely because it was the one shot everybody trusted.
    """
    conn = db(find_project())
    asset = conn.execute("select * from assets where tag=?", (a.tag,)).fetchone()
    if not asset:
        sys.exit(f"no asset {a.tag}")

    shots = conn.execute("select shot from shot_assets where tag=?", (a.tag,)).fetchall()
    codes = [r["shot"] for r in shots]
    if not codes:
        print(f"  {a.tag} is used by no shot yet — nothing downstream")
        return

    qs = ",".join("?" * len(codes))
    prompts = conn.execute(f"""select shot, max(version) v, hash from prompts
        where shot in ({qs}) group by shot""", codes).fetchall()
    jobs = conn.execute(f"select shot, attempt, status from jobs where shot in ({qs})",
                        codes).fetchall()

    print(f"  CHANGING {a.tag} ({asset['status']}) WOULD MAKE PROVISIONAL")
    print(f"    shots            {', '.join(codes)}")
    print(f"    prompt versions  " + ", ".join(f"{r['shot']} v{r['v']}" for r in prompts))
    print(f"    audits           every round stamped against those hashes stops counting")
    if jobs:
        print(f"    takes            " + ", ".join(f"{r['shot']}#{r['attempt']}" for r in jobs))
        print(f"    selects          any accepted take from those shots needs re-review")
    print()
    print(f"  Nothing is deleted. Approved becomes provisional, and provisional needs a")
    print(f"  human to look again — because an approval is stamped against a state of the")
    print(f"  world, not against a file.")

    if a.record:
        rev = (asset["version"] or 1) + 1
        for c in codes:
            conn.execute("""insert into deps(up_type,up_id,up_rev,down_type,down_id,reason,created)
                values('asset',?,?,'shot',?,?,?)""",
                         (a.tag, rev, c, f"{a.tag} revised to v{rev}", now()))
        conn.execute("update assets set version=?, status='draft', locked_at=null where tag=?",
                     (rev, a.tag))
        conn.commit()
        print(f"\n  ✓ recorded: {a.tag} → v{rev}, status back to draft, {len(codes)} shots "
              f"marked. It must pass the stress test again before it can lock.")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("init"); p.add_argument("name"); p.set_defaults(func=cmd_init)
    p = sub.add_parser("stack"); p.set_defaults(func=cmd_stack)

    p = sub.add_parser("asset"); p.add_argument("action",
        choices=["add", "describe", "file", "lock", "list"])
    p.add_argument("tag", nargs="?"); p.add_argument("--type", default="character")
    p.add_argument("--name"); p.add_argument("--descriptor"); p.add_argument("--scale")
    p.add_argument("--face"); p.add_argument("--exclude"); p.add_argument("--role", default="hero")
    p.add_argument("--path"); p.set_defaults(func=cmd_asset)

    p = sub.add_parser("board"); p.add_argument("action",
        choices=["add", "ref", "decide", "list"])
    p.add_argument("name", nargs="?")
    p.add_argument("title", nargs="?", help="board title on `add`, decision on `decide`")
    p.add_argument("--path"); p.add_argument("--caption"); p.add_argument("--controls")
    p.add_argument("--must-not-touch", dest="must_not_touch"); p.add_argument("--note")
    p.add_argument("--anti", action="store_true"); p.set_defaults(func=cmd_board)

    p = sub.add_parser("stress"); p.add_argument("tag")
    p.add_argument("--runs", type=int, default=10); p.add_argument("--passed", type=int)
    p.set_defaults(func=cmd_stress)

    p = sub.add_parser("shot"); p.add_argument("action", choices=["add", "use"])
    p.add_argument("code"); p.add_argument("--scene", type=int, default=1)
    p.add_argument("--ord", type=int); p.add_argument("--card")
    p.add_argument("--frame-source", dest="frame_source", default="keyframe",
                   choices=["keyframe", "chain_continue", "chain_cut"])
    p.add_argument("--chain-from", dest="chain_from")
    p.add_argument("--room-scope", dest="room_scope", default="full",
                   choices=["full", "partial", "none"])
    p.add_argument("--speaker"); p.add_argument("--box", type=int, nargs=4)
    p.add_argument("--lead-in", dest="lead_in", type=float, default=0.5)
    p.add_argument("--cut-to", dest="cut_to", type=float)
    p.add_argument("--seconds", type=float, default=5)
    p.add_argument("tags", nargs="*"); p.set_defaults(func=cmd_shot)

    for name, fn in (("compile", cmd_compile), ("brief", cmd_brief),
                     ("gates", cmd_gates), ("fire", cmd_fire)):
        p = sub.add_parser(name); p.add_argument("shot")
        p.add_argument("--note"); p.add_argument("--force", action="store_true")
        p.set_defaults(func=fn)

    p = sub.add_parser("impact"); p.add_argument("tag")
    p.add_argument("--record", action="store_true",
                   help="actually revise the asset and mark everything downstream")
    p.set_defaults(func=cmd_impact)

    p = sub.add_parser("audit"); p.add_argument("shot")
    p.add_argument("--pass", dest="record", type=float); p.add_argument("--notes")
    p.add_argument("--force", action="store_true")
    p.set_defaults(func=cmd_audit)

    a = ap.parse_args()
    sys.exit(a.func(a) or 0)


if __name__ == "__main__":
    main()
