-- ============================================================================
-- STUDIO MEMORY — the hybrid schema
--
-- Base: Julian's Production OS spec (projects → scenes → shots → prompts →
-- jobs → outputs → selects, with idempotency, owned storage and provenance).
--
-- Merged in: the Higgsfield pipeline's two gates and asset lifecycle, and the
-- laws this studio earned the expensive way on Thistlewood's Episode 1. Every
-- table or column marked ⟨EARNED⟩ exists because a take was rejected without it.
-- ============================================================================

create type asset_status    as enum ('draft', 'testing', 'locked', 'deprecated');
create type board_decision  as enum ('pending', 'approved', 'revise', 'rejected');
create type job_status      as enum (
  'validated', 'queued', 'submitted', 'provider_running',
  'succeeded', 'downloaded', 'synced', 'review_pending', 'approved',
  'rejected', 'failed', 'cancelled');

-- ⟨EARNED⟩ how much of the location a frame actually shows. Naming the whole
-- room to a tight insert is an instruction to BUILD the room: a counter-top
-- insert came back with a bright kitchen and a window behind it. (NEG-004)
create type room_scope      as enum ('full', 'partial', 'none');

-- ⟨EARNED⟩ where a shot's first frame comes from. Chaining the previous take's
-- last frame means the room cannot drift, because Image 1 IS the previous frame
-- rather than a fresh generation of the same room.
create type frame_source    as enum ('keyframe', 'chain_continue', 'chain_cut');


-- ── projects ────────────────────────────────────────────────────────────────

create table projects (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  slug                text not null unique,
  status              text not null default 'active',
  model_config        jsonb not null default '{}'::jsonb,   -- resolved from the provider registry
  delivery_spec       jsonb not null default '{}'::jsonb,
  style_lock          text not null default '',             -- injected verbatim into every prompt
  budget_limit_cents  integer,
  -- ⟨EARNED⟩ house thresholds, per project, because they are production
  -- decisions and not constants: the audit floor, the attempt cap, the point at
  -- which rewording stops and the SHOT gets simplified, and the tail trim.
  audit_floor         numeric(3,1) not null default 9.5,
  attempt_cap         integer      not null default 15,
  simplify_at         integer      not null default 8,
  tail_trim_seconds   numeric(4,2) not null default 0.40,
  repeatability_req   integer      not null default 10,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);


-- ── script ──────────────────────────────────────────────────────────────────

create table scenes (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id) on delete cascade,
  scene_number   integer not null,
  title          text,
  script_excerpt text,
  location_tag   text,
  status         text not null default 'draft',
  created_at     timestamptz not null default now(),
  unique(project_id, scene_number)
);

create table shots (
  id                  uuid primary key default gen_random_uuid(),
  scene_id            uuid not null references scenes(id) on delete cascade,
  shot_number         integer not null,
  shot_code           text not null,
  status              text not null default 'draft',
  shot_card           jsonb not null default '{}'::jsonb,   -- the 22 fields
  acceptance_criteria jsonb not null default '[]'::jsonb,

  -- ⟨EARNED⟩ the first frame, and where it comes from
  frame_source        frame_source not null default 'keyframe',
  chain_from_shot_id  uuid references shots(id),
  room_scope          room_scope   not null default 'full',

  -- ⟨EARNED⟩ THE SPEAKER BOX. A lipsync route takes a video and an audio file,
  -- finds a face and drives it. Not one route measured accepts a face selector,
  -- so on a multi-face frame it picks whichever it likes — and the first time it
  -- ran it animated Tom's line onto Richard's mouth. This is the region holding
  -- the speaker and nobody else, [x, y, w, h] in take pixels. Null on a single.
  speaker_box         jsonb,
  speaker_asset_id    uuid,          -- who is talking; every other mouth is closed

  -- ⟨EARNED⟩ how long the recorded line waits before it starts, so a scripted
  -- breath or swallow has somewhere to live before the first word
  lead_in_seconds     numeric(4,2) not null default 0.50,
  cut_to_seconds      numeric(6,2),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique(scene_id, shot_number)
);


-- ── assets: one asset, one passport ─────────────────────────────────────────

create table assets (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects(id) on delete cascade,
  parent_asset_id  uuid references assets(id),
  tag              text not null,
  asset_type       text not null check (asset_type in
                     ('character','location','prop','style','voice')),
  display_name     text not null,
  version          integer not null default 1,
  status           asset_status not null default 'draft',
  descriptor       text not null default '',
  must_not_contribute text not null default '',  -- every reference states what it must NOT touch

  -- ⟨EARNED⟩ scale is expressed by BODY LANDMARK, never by number. Heights in
  -- centimetres came back with the ladder inverted and the largest gap rendered
  -- as no gap at all. "her head reaches his shoulder" survives; "118cm" does not.
  scale_landmark   text not null default '',

  -- ⟨EARNED⟩ an undirected FACE is filled in with the average of every similar
  -- scene the model has seen, which is 'pleasant'. A man smiled through three
  -- consecutive shots about his grandmother's broken heirloom. (NEG-002)
  default_expression text not null default '',

  palette          jsonb not null default '[]'::jsonb,
  test_score       numeric(4,2),
  locked_at        timestamptz,
  deprecated_at    timestamptz,
  created_at       timestamptz not null default now(),
  unique(project_id, tag, version)
);

-- a state variant is its own asset with its own tag: @cal, @cal_wet, @cal_blood.
-- A variant described inline is a variant the model forgets.
create table asset_files (
  id           uuid primary key default gen_random_uuid(),
  asset_id     uuid not null references assets(id) on delete cascade,
  role         text not null check (role in
                 ('hero','front','three_quarter','profile','back','close',
                  'expression','action','light','palette','voice','plate','other')),
  storage_path text not null,          -- OWNED storage. Provider URLs expire.
  checksum     text,
  mime_type    text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

-- ⟨LAW⟩ a reference file is never renamed. A new version is a NEW ROW, because
-- renaming breaks every prompt version that points at the old path.


-- ── reference boards · GATE A ───────────────────────────────────────────────

create table reference_boards (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  board_type    text not null,
  title         text not null,
  decision      board_decision not null default 'pending',
  decision_note text,
  decided_by    text,
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);

create table board_references (
  id                uuid primary key default gen_random_uuid(),
  board_id          uuid not null references reference_boards(id) on delete cascade,
  storage_path      text not null,
  caption           text not null,      -- an uncaptioned image is junk in a week
  controls          text not null,
  must_not_touch    text,
  is_anti_reference boolean not null default false,   -- the ban list
  created_at        timestamptz not null default now()
);


-- ── the stress test · GATE B ────────────────────────────────────────────────
-- ⟨HIGGSFIELD⟩ the stage we never had. A passport built on one lucky image is a
-- false victory: an asset is proved under combat conditions — every angle, every
-- shot size, the real scene light, and a two-shot beside every co-star — as
-- cheap stills, before one expensive video generation. Below full marks the row
-- stays draft and the scene it blocks stays closed.

create table stress_tests (
  id            uuid primary key default gen_random_uuid(),
  asset_id      uuid not null references assets(id) on delete cascade,
  matrix        jsonb not null,        -- the conditions built from registry + breakdown
  runs_total    integer not null,
  runs_passed   integer not null,
  verdict       text not null check (verdict in ('pass','fail')),
  evidence      jsonb not null default '[]'::jsonb,   -- storage paths of the test stills
  tested_at     timestamptz not null default now(),
  tested_by     text
);


create table shot_assets (
  shot_id   uuid not null references shots(id) on delete cascade,
  asset_id  uuid not null references assets(id),
  role      text not null,
  required  boolean not null default true,
  ref_order integer,        -- ⟨EARNED⟩ ORDER IS THE CONTRACT: the prompt names
                            -- Image 1..N by position, so the compiler and the
                            -- submitter must walk the same list.
  primary key (shot_id, asset_id)
);


-- ── prompts: immutable versions ─────────────────────────────────────────────

create table prompt_versions (
  id               uuid primary key default gen_random_uuid(),
  shot_id          uuid not null references shots(id) on delete cascade,
  version          integer not null,
  prompt_text      text not null,
  prompt_hash      text not null,      -- ⟨EARNED⟩ see audit_rounds
  prompt_blocks    jsonb not null,
  asset_snapshot   jsonb not null,     -- descriptors frozen at compile time
  reference_manifest jsonb not null,   -- ordered: path, controls, must_not_touch
  provider_payload jsonb not null,
  change_note      text not null,      -- ONE declared change per version
  created_by       text,
  created_at       timestamptz not null default now(),
  unique(shot_id, version)
);

-- ⟨EARNED⟩ THE AUDIT LOOP. A prompt goes through the prompt generator, scores,
-- and if it is under the floor it is CORRECTED — which produces a new prompt
-- that has never been scored. Rounds are stamped against the hash of the exact
-- text they scored, and only a round matching the CURRENT text counts. A
-- material rewrite once fired against an audit of the version before it.
create table audit_rounds (
  id                uuid primary key default gen_random_uuid(),
  prompt_version_id uuid not null references prompt_versions(id) on delete cascade,
  round             integer not null,
  prompt_hash       text not null,
  score             numeric(3,1) not null,
  notes             text not null default '',   -- what the generator said to change
  scored_by         text,
  created_at        timestamptz not null default now(),
  unique(prompt_version_id, round)
);


-- ── generation ──────────────────────────────────────────────────────────────

create table generation_jobs (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references projects(id) on delete cascade,
  shot_id               uuid not null references shots(id) on delete cascade,
  prompt_version_id     uuid not null references prompt_versions(id),
  idempotency_key       text not null unique,
  provider              text not null,
  model                 text not null,
  provider_task_id      text unique,
  request_payload       jsonb not null,
  status                job_status not null default 'validated',
  attempt_number        integer not null,
  estimated_cost_cents  integer,
  actual_cost_cents     integer,
  failure_code          text,
  failure_message       text,
  submitted_at          timestamptz,
  completed_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique(shot_id, attempt_number)
);

create table generation_outputs (
  id                  uuid primary key default gen_random_uuid(),
  generation_job_id   uuid not null unique references generation_jobs(id) on delete cascade,
  provider_url        text,
  storage_path        text,            -- provider URLs are temporary; this is ours
  synced_path         text,            -- ⟨EARNED⟩ after the lipsync pass
  thumbnail_path      text,
  checksum            text,
  duration_seconds    numeric(8,3),
  width               integer,
  height              integer,
  has_audio           boolean,
  technical_metadata  jsonb not null default '{}'::jsonb,
  reviewer_status     text not null default 'pending'
                        check (reviewer_status in ('pending','approved','rejected')),
  reviewer_notes      text,
  reviewed_at         timestamptz,
  created_at          timestamptz not null default now()
);

create table generation_logs (
  id                uuid primary key default gen_random_uuid(),
  generation_job_id uuid not null references generation_jobs(id) on delete cascade,
  event_type        text not null,
  detail            jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create table selections (
  id                  uuid primary key default gen_random_uuid(),
  shot_id             uuid not null unique references shots(id) on delete cascade,
  output_id           uuid not null references generation_outputs(id),
  acceptance_checklist jsonb not null,
  selected_at         timestamptz not null default now(),
  selected_by         text
);


-- ── the bank ────────────────────────────────────────────────────────────────
-- ⟨EARNED⟩ a rejected take is worth as much as an approved one if the shape of
-- its failure is written down. Every law in this schema started as a row here.

create table lessons (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid references projects(id) on delete set null,
  code         text not null,                    -- NEG-004, POS-002
  kind         text not null check (kind in ('negative','positive')),
  title        text not null,
  what_came_back text not null,
  why          text not null,
  fix          text not null,
  general_rule text not null,
  enforced_by  text,                             -- the check that now prevents it
  created_at   timestamptz not null default now(),
  unique(code)
);


-- ── THE GATES ───────────────────────────────────────────────────────────────

-- GATE B · every required asset locked. Run before compiling AND again
-- immediately before submitting, because an asset can be deprecated in between.
create or replace function gate_locked_assets(p_shot_id uuid)
returns table(asset_id uuid, tag text, status asset_status) as $$
  select a.id, a.tag, a.status
  from shot_assets sa
  join assets a on a.id = sa.asset_id
  where sa.shot_id = p_shot_id
    and sa.required = true
    and a.status <> 'locked';
$$ language sql stable;

-- GATE A · no board this shot depends on may still be pending.
create or replace function gate_boards_decided(p_project_id uuid)
returns table(board_id uuid, title text) as $$
  select id, title from reference_boards
  where project_id = p_project_id and decision = 'pending';
$$ language sql stable;

-- ⟨EARNED⟩ GATE C · the current prompt text has a passing audit round of its own.
create or replace function gate_audit_passed(p_prompt_version_id uuid)
returns boolean as $$
  select exists (
    select 1
    from audit_rounds ar
    join prompt_versions pv on pv.id = ar.prompt_version_id
    join projects p on p.id = (
      select s.project_id from scenes s
      join shots sh on sh.scene_id = s.id
      where sh.id = pv.shot_id)
    where ar.prompt_version_id = p_prompt_version_id
      and ar.prompt_hash = pv.prompt_hash          -- the hash must still match
      and ar.score >= p.audit_floor);
$$ language sql stable;

-- ⟨EARNED⟩ GATE D · a multi-face shot with a spoken line needs a speaker box,
-- because the lipsync route cannot be told which face to drive.
create or replace function gate_speaker_box(p_shot_id uuid)
returns boolean as $$
  select case
    when (select count(*) from shot_assets sa
          join assets a on a.id = sa.asset_id
          where sa.shot_id = p_shot_id and a.asset_type = 'character') <= 1
      then true
    when (select speaker_asset_id from shots where id = p_shot_id) is null
      then true                                    -- nobody speaks: nothing to sync
    else (select speaker_box is not null from shots where id = p_shot_id)
  end;
$$ language sql stable;


create index on shots(scene_id);
create index on shot_assets(shot_id);
create index on assets(project_id, status);
create index on generation_jobs(shot_id, status);
create index on audit_rounds(prompt_version_id);
