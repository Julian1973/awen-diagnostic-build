// Meditation Studio dashboard. Plain JavaScript, no build step.

// ---------- helpers ----------
const $app = document.getElementById('app');

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v; // only ever used with static strings
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

async function api(path, opts = {}) {
  // The server refuses changes without this header, so other websites cannot drive the studio.
  const init = { method: opts.method || 'GET', headers: { 'X-Studio': '1' } };
  if (opts.body instanceof FormData) init.body = opts.body;
  else if (opts.body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, init);
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

let toastTimer;
function toast(msg, bad = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = bad ? 'bad' : '';
  t.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.style.display = 'none'), bad ? 9000 : 3500);
}

function mmss(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function compact(n) {
  if (n == null) return '·';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return n.toLocaleString('en-GB');
}
function when(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const STATUS = {
  idea: { label: 'Idea', cls: '' },
  writing: { label: 'Writing', cls: 'gold' },
  draft: { label: 'Draft', cls: '' },
  voiced: { label: 'Voiced', cls: 'gold' },
  published: { label: 'Published', cls: 'good' },
};
const statusChip = (s) => h('span', { class: `chip ${STATUS[s]?.cls || ''}` }, STATUS[s]?.label || s);

function brandChip(sum, m) {
  if (!sum) return '';
  if (m && !m.script) return h('span', { class: 'chip' }, 'Not written');
  if (sum.blocks) return h('span', { class: 'chip bad' }, `✕ ${sum.blocks} to fix`);
  if (sum.flags) return h('span', { class: 'chip warn' }, `! ${sum.flags} to check`);
  return h('span', { class: 'chip good' }, '✓ Passes');
}

function checkList(checks) {
  const icon = { pass: '✓', flag: '!', block: '✕' };
  const order = { block: 0, flag: 1, pass: 2 };
  return h('ul', { class: 'checks' }, [...checks].sort((a, b) => order[a.severity] - order[b.severity]).map((c) =>
    h('li', { class: c.severity }, h('span', { class: 'icon', 'aria-label': c.severity }, icon[c.severity]), h('span', {}, h('b', {}, `${c.rule}. `), c.message))));
}

// Watches a job until it ends. onTick gets the job each second.
async function watchJob(jobId, onTick) {
  for (;;) {
    let job;
    try {
      job = await api(`/api/jobs/${jobId}`);
    } catch (err) {
      onTick({ status: 'failed', error: err.message, progress: {} });
      return { status: 'failed', error: err.message };
    }
    onTick(job);
    if (job.status !== 'running') return job;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

function jobBox() {
  const msg = h('div', { class: 'small' }, '');
  const bar = h('div');
  const box = h('div', { class: 'job' }, msg, h('div', { class: 'progress' }, bar));
  box.update = (job) => {
    const p = job.progress || {};
    msg.textContent = job.status === 'failed' ? `Failed: ${job.error}` : p.message || '';
    msg.style.color = job.status === 'failed' ? 'var(--bad)' : '';
    const pct = job.status === 'done' ? 100 : p.total ? Math.round((p.done / p.total) * 100) : 12;
    bar.style.width = `${pct}%`;
  };
  return box;
}

// ---------- shared state ----------
let FORMATS = null;
let BRANDS = null;
let SETTINGS = null;
async function boot() {
  [FORMATS, BRANDS, SETTINGS] = await Promise.all([api('/api/formats'), api('/api/brands'), api('/api/settings')]);
  refreshSideStatus();
  route();
}
const formatById = (id) => FORMATS.formats.find((f) => f.id === id);

async function refreshSideStatus() {
  const box = document.getElementById('side-status');
  try {
    const s = await api('/api/status');
    const dot = (ok) => h('span', { class: 'dot', style: `background:${ok ? 'var(--good)' : 'var(--bad)'}` });
    box.replaceChildren(
      h('div', {}, dot(!!s.claude), 'Claude ', s.claude ? 'connected' : 'key needed'),
      h('div', {}, dot(!!s.elevenlabs), 'ElevenLabs ', s.elevenlabs ? 'connected' : 'key needed'),
      h('div', {}, dot(s.ffmpeg.ok), 'Audio engine ', s.ffmpeg.ok ? 'ready' : 'missing'),
      h('div', { style: 'margin-top:6px' }, s.thisMac, s.sharedLibrary ? ' · iCloud library' : ''),
      s.otherMacs?.length ? h('div', { style: 'color:var(--warn)' }, `Also open on ${s.otherMacs.join(', ')}`) : '',
    );
    return s;
  } catch {
    box.textContent = 'Server not reachable';
    return null;
  }
}

// ---------- router ----------
function route() {
  const hash = location.hash.replace(/^#\/?/, '') || 'overview';
  const [pathPart, query = ''] = hash.split('?');
  const parts = pathPart.split('/');
  const params = Object.fromEntries(new URLSearchParams(query));
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.page === parts[0] || (parts[0] === 'm' && a.dataset.page === 'library')));
  const pages = { overview: pageOverview, formats: pageFormats, create: pageCreate, library: pageLibrary, performance: pagePerformance, settings: pageSettings, m: pageMeditation };
  const page = pages[parts[0]] || pageOverview;
  $app.replaceChildren(h('div', { class: 'muted' }, 'Loading…'));
  page(parts.slice(1), params).catch((err) => {
    $app.replaceChildren(h('div', { class: 'banner bad' }, err.message));
  });
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

function insightTimerNotice() {
  return h('div', { class: 'banner' },
    h('b', {}, 'Insight Timer needs your real voice. '),
    'Their teacher policy does not allow voice clones or text to speech for narration (AI help with scripts and background music is fine). Use ',
    h('b', {}, 'Record mode'), ' for Insight Timer, and the ElevenLabs clone for Spotify, YouTube and your site. ',
    h('a', { href: 'https://insight-timer.freshdesk.com/support/solutions/articles/67000723124-can-teachers-use-artificial-intelligence-ai-on-their-insight-timer-offerings-', target: '_blank', rel: 'noopener' }, 'Read the policy'));
}

// ---------- Overview ----------
async function pageOverview() {
  const [ov, status] = await Promise.all([api('/api/overview'), refreshSideStatus()]);
  const subTile = h('div', { class: 'tile' }, h('div', { class: 'label' }, 'ElevenLabs characters left'), h('div', { class: 'value' }, '…'), h('div', { class: 'sub' }, ''));
  const keysMissing = status && (!status.claude || !status.elevenlabs);
  const tiles = h('div', { class: 'tiles' },
    tile('Ready to publish', ov.ready, 'voiced and on brand'),
    tile('In production', (ov.counts.idea || 0) + (ov.counts.writing || 0) + (ov.counts.draft || 0) + (ov.counts.voiced || 0) - ov.ready, 'ideas, drafts and mixes'),
    tile('Published', ov.counts.published || 0, 'across platforms'),
    tile('Made this week', `${ov.thisWeek} of ${ov.weeklyTarget}`, 'weekly rhythm'),
    subTile,
    tile('Plays logged', compact(ov.playsLogged), 'latest figures you entered'),
  );
  if (status?.elevenlabs) {
    api('/api/subscription').then((s) => {
      if (!s) return;
      subTile.children[1].textContent = compact(s.remaining);
      subTile.children[2].textContent = `${compact(s.used)} of ${compact(s.limit)} used${s.resetsAt ? `, resets ${when(s.resetsAt)}` : ''}`;
    }).catch(() => { subTile.children[1].textContent = '·'; subTile.children[2].textContent = 'could not read quota'; });
  } else {
    subTile.children[1].textContent = '·';
    subTile.children[2].textContent = 'add your key in Settings';
  }

  const recent = ov.recent.length
    ? h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Title'), h('th', {}, 'Format'), h('th', {}, 'Status'), h('th', {}, 'Quality check'), h('th', { class: 'num' }, 'Length'))),
      h('tbody', {}, ov.recent.map((m) => h('tr', { class: 'click', onclick: () => (location.hash = `#/m/${m.id}`) },
        h('td', {}, m.title || h('span', { class: 'muted' }, 'Untitled')), h('td', { class: 'muted' }, m.formatName), h('td', {}, statusChip(m.status)), h('td', {}, brandChip(m.brandSummary, m)),
        h('td', { class: 'num' }, m.renders?.recorded ? mmss(m.renders.recorded.seconds) : m.renders?.clone ? mmss(m.renders.clone.seconds) : m.script ? `~${mmss(m.stats.estimatedSeconds)}` : '·')))))
    : h('div', { class: 'empty' }, 'Nothing yet. Start with a format that wins, then write it in your voice.');

  $app.replaceChildren(
    h('h1', {}, 'Your ', h('em', {}, 'studio')),
    h('p', { class: 'lede' }, 'Write original meditations in the shapes that get the most listening on Insight Timer and Spotify, voice them, mix them, and see what lands.'),
    keysMissing ? h('div', { class: 'banner' }, 'Add your Claude and ElevenLabs keys in ', h('a', { href: '#/settings' }, 'Settings'), ' to start writing and voicing.') : '',
    status?.otherMacs?.length ? h('div', { class: 'banner' }, h('b', {}, `Also open on ${status.otherMacs.join(', ')}. `), 'Your library syncs between your Macs through iCloud Drive. Make changes on one Mac at a time, and give iCloud a moment to catch up when you switch.') : '',
    insightTimerNotice(),
    tiles,
    h('div', { class: 'split section' },
      h('div', { class: 'card' }, h('div', { class: 'row' }, h('h2', {}, 'Recent'), h('span', { class: 'spacer' }), h('a', { class: 'btn small', href: '#/create' }, 'New meditation')), recent),
      h('div', { class: 'card' }, h('h2', {}, 'Plays by format'), playsChart(ov.playsByFormat))),
  );
}

function tile(label, value, sub) {
  return h('div', { class: 'tile' }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value), h('div', { class: 'sub' }, sub));
}

// Single series horizontal bars. Hover or focus shows the value; the table toggle shows every figure.
function playsChart(rows) {
  if (!rows.length) return h('div', { class: 'empty' }, 'Log plays on a published meditation to see which formats bring people in.');
  const max = Math.max(...rows.map((r) => r.plays));
  const tip = document.getElementById('tooltip');
  const show = (e, r) => {
    tip.replaceChildren(h('b', {}, r.plays.toLocaleString('en-GB')), `${r.format} · ${r.tracks} track${r.tracks > 1 ? 's' : ''}`);
    const rect = e.target.getBoundingClientRect();
    tip.style.display = 'block';
    tip.style.left = `${Math.min(window.innerWidth - 240, rect.right + 8)}px`;
    tip.style.top = `${rect.top - 4}px`;
  };
  const hide = () => (tip.style.display = 'none');
  const bars = h('div', { class: 'bars', role: 'list' }, rows.map((r) => h('div', { class: 'bar-row', role: 'listitem' },
    h('div', { class: 'name', title: r.format }, r.format),
    h('div', { class: 'bar-track' }, h('div', {
      class: 'bar', tabindex: '0', style: `width:${Math.max(1, (r.plays / max) * 100)}%`, 'aria-label': `${r.format}: ${r.plays} plays`,
      onpointermove: (e) => show(e, r), onpointerleave: hide, onfocus: (e) => show(e, r), onblur: hide,
    })))));
  const table = h('table', { style: 'display:none' }, h('thead', {}, h('tr', {}, h('th', {}, 'Format'), h('th', { class: 'num' }, 'Tracks'), h('th', { class: 'num' }, 'Plays'))),
    h('tbody', {}, rows.map((r) => h('tr', {}, h('td', {}, r.format), h('td', { class: 'num' }, r.tracks), h('td', { class: 'num' }, r.plays.toLocaleString('en-GB'))))));
  const toggle = h('button', { class: 'ghost small', onclick: () => {
    const showTable = table.style.display === 'none';
    table.style.display = showTable ? '' : 'none';
    bars.style.display = showTable ? 'none' : '';
    toggle.textContent = showTable ? 'Show chart' : 'Show table';
  } }, 'Show table');
  return h('div', {}, bars, table, h('div', { class: 'row end', style: 'margin-top:12px' }, toggle));
}

// ---------- Formats & trends ----------
async function pageFormats() {
  const research = await api('/api/research');
  const latest = research[0];
  const focus = h('input', { type: 'text', placeholder: 'Optional focus, for example "sleep for menopause" or "grief"' });
  const scanBox = h('div');
  const scanBtn = h('button', { onclick: async () => {
    scanBtn.disabled = true;
    const box = jobBox();
    scanBox.replaceChildren(box);
    try {
      const { job } = await api('/api/research', { method: 'POST', body: { focus: focus.value } });
      const end = await watchJob(job.id, box.update);
      if (end.status === 'done') route();
    } catch (err) {
      toast(err.message, true);
    } finally {
      scanBtn.disabled = false;
    }
  } }, 'Run a live trend scan');

  const trendCard = h('div', { class: 'card' },
    h('div', { class: 'row' }, h('h2', {}, 'What people are ', h('em', {}, 'listening'), ' to now'), h('span', { class: 'spacer' }), latest ? h('span', { class: 'muted small' }, `Last scan ${when(latest.createdAt)}`) : ''),
    h('p', { class: 'muted small' }, 'Claude searches Insight Timer, Spotify and the podcast charts, then suggests what to make next. Ideas are directions only, never anyone else\'s words.'),
    h('div', { class: 'row' }, h('div', { style: 'flex:1;min-width:260px' }, focus), scanBtn),
    scanBox,
    latest ? researchView(latest) : h('div', { class: 'empty' }, 'No scan yet.'));

  const cards = FORMATS.formats.map((f) => h('div', { class: 'card format-card' },
    h('h3', {}, f.name),
    h('div', { class: 'meta' },
      h('span', { class: 'chip gold' }, `${f.minutes[0]} to ${f.minutes[1]} min`),
      h('span', { class: 'chip' }, f.ending === 'sleep' ? 'Sleep ending' : 'Bell ending'),
      BRANDS.enabled && f.pillars?.length ? h('span', { class: 'chip' }, `Pillar ${f.pillars.join(', ')}`) : '',
      ...f.platforms.map((p) => h('span', { class: 'chip' }, p))),
    h('div', { class: 'evidence' }, f.evidence),
    h('ol', {}, f.beats.map((b) => h('li', {}, b))),
    h('div', { class: 'titles' }, h('div', { class: 'muted' }, 'Title shapes'), ...f.titlePatterns.insightTimer.map((t) => h('div', {}, `Insight Timer: ${t}`)), ...f.titlePatterns.spotify.slice(0, 2).map((t) => h('div', {}, `Spotify: ${t}`))),
    h('a', { class: 'btn small', href: `#/create?format=${f.id}` }, 'Create in this format')));

  $app.replaceChildren(
    h('h1', {}, 'Formats that ', h('em', {}, 'win')),
    h('p', { class: 'lede' }, `${FORMATS.formats.length} shapes modelled on the most listened to meditations, researched ${FORMATS.researchedOn}. Every line you publish stays your own.`),
    FORMATS.playData ? playDataCard(FORMATS.playData) : '',
    h('div', { class: 'card', style: 'margin-bottom:20px' }, h('h3', {}, 'House rules from the research'), h('ul', { class: 'small', style: 'margin:0;padding-left:18px;color:var(--cream-2)' }, FORMATS.notes.map((n) => h('li', {}, n)))),
    trendCard,
    h('div', { class: 'grid g3 section' }, cards),
    h('div', { class: 'card section' }, h('h3', {}, 'Sources'), h('ul', { class: 'small', style: 'margin:0;padding-left:18px' }, FORMATS.sources.map((s) => h('li', {}, h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.label))))),
  );
}

// What gets played on Insight Timer: by topic, by length, and the verified high play tracks.
function playDataCard(d) {
  const num = (n) => n.toLocaleString('en-GB');
  const lengthTable = (rows, label) => h('div', {}, h('h3', {}, label),
    h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Length'), h('th', { class: 'num' }, 'Tracks'), h('th', { class: 'num' }, 'Plays'))),
      h('tbody', {}, rows.map((r) => h('tr', {}, h('td', {}, r.band), h('td', { class: 'num' }, r.tracks), h('td', { class: 'num' }, r.plays ? compact(r.plays) : '·'))))));
  const tracks = h('table', { style: 'display:none;margin-top:12px' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Track'), h('th', {}, 'Teacher'), h('th', {}, 'Topic'), h('th', { class: 'num' }, 'Length'), h('th', { class: 'num' }, 'Plays'))),
    h('tbody', {}, d.topTracks.map((t) => h('tr', {}, h('td', {}, t.title), h('td', { class: 'muted' }, t.teacher), h('td', { class: 'muted' }, `${t.topic}${t.ending === 'sleep' ? ' (sleep)' : ''}`), h('td', { class: 'num' }, t.length), h('td', { class: 'num' }, num(t.plays))))));
  const toggle = h('button', { class: 'ghost small', onclick: () => {
    const show = tracks.style.display === 'none';
    tracks.style.display = show ? '' : 'none';
    toggle.textContent = show ? 'Hide the tracks' : `Show the ${d.topTracks.length} tracks behind this`;
  } }, `Show the ${d.topTracks.length} tracks behind this`);
  return h('div', { class: 'card', style: 'margin-bottom:20px' },
    h('h2', {}, 'What gets ', h('em', {}, 'played'), ' on Insight Timer'),
    h('p', {}, d.summary),
    h('div', { class: 'grid g3' },
      h('div', {}, h('h3', {}, 'By topic (share of plays)'),
        h('table', {}, h('tbody', {}, d.byTopic.map((r) => h('tr', {}, h('td', {}, r.topic), h('td', { class: 'num' }, `${r.share}%`)))))),
      lengthTable(d.byLength.sleep, 'Sleep tracks by length'),
      lengthTable(d.byLength.day, 'Daytime tracks by length')),
    h('p', { class: 'small muted', style: 'margin-top:14px' }, d.lengthTest),
    h('h3', { style: 'margin-top:16px' }, 'What to make first'),
    h('ol', { class: 'small', style: 'color:var(--cream-2);padding-left:20px;margin:0' }, d.makeFirst.map((x) => h('li', {}, x))),
    h('div', { class: 'row', style: 'margin-top:14px' }, toggle, h('span', { class: 'muted small' }, d.caveat)),
    tracks,
    h('div', { class: 'small', style: 'margin-top:12px' }, d.sources.map((s2, i) => [i ? ' · ' : '', h('a', { href: s2.url, target: '_blank', rel: 'noopener' }, s2.label)])));
}

function researchView(r) {
  return h('div', { class: 'section', style: 'margin-top:18px' },
    r.summary ? h('p', {}, r.summary) : '',
    r.trends?.length ? h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Trend'), h('th', {}, 'Platform'), h('th', {}, 'Evidence'))),
      h('tbody', {}, r.trends.map((t) => h('tr', {}, h('td', {}, t.topic), h('td', { class: 'muted' }, t.platform),
        h('td', { class: 'small' }, t.evidence, ' ', t.sourceUrl ? h('a', { href: t.sourceUrl, target: '_blank', rel: 'noopener' }, 'source') : ''))))) : '',
    r.ideas?.length ? h('div', { class: 'grid g2', style: 'margin-top:16px' }, r.ideas.map((idea) => {
      const f = formatById(idea.formatId);
      const q = new URLSearchParams({ format: idea.formatId, theme: idea.theme || '', pillar: idea.pillar || '', demand: r.summary || '' });
      return h('div', { class: 'card', style: 'background:var(--navy)' },
        h('div', { class: 'muted small' }, f ? f.name : idea.formatId, BRANDS.enabled && idea.pillar ? ` · Pillar ${idea.pillar}` : ''),
        h('div', { style: 'font:500 20px/1.3 var(--serif);margin:4px 0' }, idea.theme),
        h('div', { class: 'small muted' }, idea.why),
        f ? h('a', { class: 'btn small', style: 'margin-top:10px', href: `#/create?${q}` }, 'Create from this idea') : '');
    })) : '');
}

// ---------- Create ----------
async function pageCreate(_, params) {
  let format = formatById(params.format) || FORMATS.formats[0];
  const formatSel = h('select', { onchange: () => { format = formatById(formatSel.value); refresh(); } },
    FORMATS.formats.map((f) => h('option', { value: f.id, selected: f.id === format.id }, f.name)));
  const brandSel = h('select', {}, Object.values(BRANDS.brands).map((b) => h('option', { value: b.id }, b.name)));
  brandSel.value = 'plain';
  const minutes = h('input', { type: 'range', step: '1' });
  const minutesOut = h('span', { class: 'chip gold' });
  minutes.addEventListener('input', () => (minutesOut.textContent = `${minutes.value} minutes`));
  const theme = h('input', { type: 'text', value: params.theme || '', placeholder: 'For example: for people who lie awake replaying the day' });
  const audience = h('input', { type: 'text', placeholder: 'Optional. For example: carers who never get a minute' });
  const notes = h('textarea', { rows: '3', placeholder: 'Anything you want in or out. A memory, a place, an image, a line you want it to land on.' });
  const demand = params.demand || '';
  const seriesBox = h('div', { class: 'grid g3' });
  const seriesName = h('input', { type: 'text', value: 'Seven Days of Coming Home' });
  const day = h('input', { type: 'number', value: '1', min: '1' });
  const seriesLength = h('input', { type: 'number', value: '7', min: '2' });
  seriesBox.append(h('div', {}, h('label', {}, 'Series name'), seriesName), h('div', {}, h('label', {}, 'Day'), day), h('div', {}, h('label', {}, 'Days in series'), seriesLength));

  let pillar = params.pillar ? Number(params.pillar) : null;
  const pillarBox = h('div', { class: 'pillars' });
  const drawPillars = () => {
    pillarBox.replaceChildren(...BRANDS.pillars.map((p) => h('label', {
      class: `pillar ${pillar === p.id ? 'on' : ''}`,
      onclick: () => { pillar = p.id; drawPillars(); },
    }, h('div', { class: 'pn' }, `Pillar ${p.id} · ${p.name}`), h('div', { class: 'pl' }, p.line))));
  };
  const pillarWrap = h('div', {}, h('label', {}, 'Pillar'), pillarBox);
  const beats = h('ol', { class: 'small', style: 'color:var(--cream-2);padding-left:20px' });
  const formatInfo = h('div', { class: 'small muted' });

  function refresh() {
    minutes.min = String(format.minutes[0]);
    minutes.max = String(format.minutes[1]);
    minutes.value = String(format.defaultMinutes);
    minutesOut.textContent = `${format.defaultMinutes} minutes`;
    if (!pillar || (format.pillars.length && !format.pillars.includes(pillar) && !params.pillar)) pillar = format.pillars[0] || null;
    drawPillars();
    pillarWrap.style.display = BRANDS.enabled && brandSel.value === 'living-awake' ? '' : 'none';
    seriesBox.style.display = format.series ? '' : 'none';
    beats.replaceChildren(...format.beats.map((b) => h('li', {}, b)));
    formatInfo.textContent = `${format.evidence} Wins on ${format.platforms.join(', ')}.`;
  }
  brandSel.addEventListener('change', () => (pillarWrap.style.display = brandSel.value === 'living-awake' ? '' : 'none'));
  refresh();

  const status = h('div');
  const go = async (write) => {
    const body = {
      formatId: format.id, brand: BRANDS.enabled ? brandSel.value : 'plain', pillar: BRANDS.enabled && brandSel.value === 'living-awake' ? pillar : null, minutes: Number(minutes.value),
      theme: theme.value, audience: audience.value, notes: notes.value, demand,
      day: format.series ? Number(day.value) : null, seriesName: format.series ? seriesName.value : '', seriesLength: format.series ? Number(seriesLength.value) : null,
      write,
    };
    try {
      const { meditation } = await api('/api/meditations', { method: 'POST', body });
      location.hash = `#/m/${meditation.id}/script`;
    } catch (err) {
      status.replaceChildren(h('div', { class: 'banner bad' }, err.message));
    }
  };

  $app.replaceChildren(
    h('h1', {}, 'Create a ', h('em', {}, 'meditation')),
    h('p', { class: 'lede' }, 'Pick the format and the angle. Claude drafts it in your voice, to the length that gets played, then you shape it.'),
    h('div', { class: 'split' },
      h('div', { class: 'card' },
        h('label', {}, 'Format'), formatSel, formatInfo,
        h('div', { class: 'grid g2' }, BRANDS.enabled ? h('div', {}, h('label', {}, 'Brand profile'), brandSel) : '', h('div', {}, h('label', {}, 'Length ', minutesOut), minutes)),
        pillarWrap,
        seriesBox,
        h('label', {}, 'Theme or angle'), theme,
        h('label', {}, 'Who it is for'), audience,
        h('label', {}, 'Your notes'), notes,
        demand ? h('div', { class: 'hint' }, 'Includes direction from your latest trend scan.') : '',
        h('div', { class: 'row', style: 'margin-top:20px' }, h('button', { onclick: () => go(true) }, 'Write it with Claude'), h('button', { class: 'ghost', onclick: () => go(false) }, 'Start with a blank script')),
        status),
      h('div', { class: 'card' }, h('h3', {}, 'The beats'), beats,
        h('h3', { style: 'margin-top:18px' }, 'How the script is written'),
        h('ul', { class: 'small', style: 'color:var(--cream-2);padding-left:18px;margin:0' },
          h('li', {}, 'Paragraphs are voiced one at a time, with a short gap after each.'),
          h('li', {}, '[[silence 20s]] on its own line gives exact silence.'),
          h('li', {}, '[softly], [warmly], [pause] and other square bracket tags shape the eleven_v4 delivery.'),
          h('li', {}, 'Lines starting ## are notes to you and are never spoken.')))),
  );
}

// ---------- Meditation workspace ----------
let cleanups = [];
window.addEventListener('hashchange', () => { cleanups.forEach((f) => f()); cleanups = []; });

async function pageMeditation([id, tab = 'script']) {
  const m = await api(`/api/meditations/${id}`);
  const tabs = [['script', 'Script'], ['voice', 'Voice (clone)'], ['record', 'Record (your voice)'], ['publish', 'Publish'], ['performance', 'Performance']];
  const head = h('div', {},
    h('div', { class: 'row' },
      h('h1', { style: 'margin:0' }, m.title || 'Untitled meditation'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'danger small', onclick: async () => {
        if (!confirm('Delete this meditation, its audio and its recordings?')) return;
        await api(`/api/meditations/${id}`, { method: 'DELETE' });
        location.hash = '#/library';
      } }, 'Delete')),
    h('div', { class: 'row', style: 'margin-top:8px' }, statusChip(m.status), h('span', { class: 'chip' }, m.formatName), m.brand && m.brand !== 'plain' ? h('span', { class: 'chip' }, m.brandName) : '',
      m.pillar ? h('span', { class: 'chip' }, `Pillar ${m.pillar}`) : '', brandChip(m.brandSummary, m)),
    h('div', { class: 'tabs' }, tabs.map(([k, label]) => h('a', { href: `#/m/${id}/${k}`, class: k === tab ? 'on' : '' }, label))));
  const body = h('div');
  $app.replaceChildren(head, body);
  const views = { script: tabScript, voice: tabVoice, record: tabRecord, publish: tabPublish, performance: tabPerformance };
  await (views[tab] || tabScript)(m, body);
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

async function tabScript(m, body) {
  if (m.job && m.job.kind === 'write') {
    const box = jobBox();
    body.replaceChildren(h('div', { class: 'card' }, h('h2', {}, 'Writing in your ', h('em', {}, 'voice')), h('p', { class: 'muted' }, 'This usually takes one to three minutes. You can leave this page; it carries on.'), box));
    const end = await watchJob(m.job.id, box.update);
    if (location.hash.startsWith(`#/m/${m.id}`)) route();
    if (end.status === 'failed') toast(end.error, true);
    return;
  }
  const side = h('div', { class: 'grid' });
  const savedNote = h('span', { class: 'muted small' }, '');
  const script = h('textarea', { class: 'script', spellcheck: 'true', lang: 'en-GB', placeholder: '## Opening\n[softly] Let yourself arrive...\n\n[[silence 15s]]' });
  script.value = m.script || '';
  const save = debounce(async (patch) => {
    savedNote.textContent = 'Saving…';
    try {
      const fresh = await api(`/api/meditations/${m.id}`, { method: 'PUT', body: patch });
      Object.assign(m, fresh);
      drawSide();
      savedNote.textContent = 'Saved';
    } catch (err) {
      savedNote.textContent = '';
      toast(err.message, true);
    }
  }, 900);
  script.addEventListener('input', () => save({ script: script.value }));

  const field = (key, label, rows) => {
    const el = rows ? h('textarea', { rows: String(rows) }) : h('input', { type: 'text' });
    el.value = Array.isArray(m[key]) ? m[key].join(', ') : m[key] || '';
    el.addEventListener('input', () => save({ [key]: el.value }));
    const copy = h('button', { class: 'ghost small', onclick: () => navigator.clipboard.writeText(el.value).then(() => toast('Copied')) }, 'Copy');
    return h('div', {}, h('div', { class: 'row' }, h('label', { style: 'flex:1' }, label), copy), el);
  };

  const revise = h('textarea', { rows: '3', placeholder: 'For example: make the opening shorter, and bring the river image back in the close.' });
  const reviseBtn = h('button', { onclick: async () => {
    if (!revise.value.trim()) return;
    try {
      await api(`/api/meditations/${m.id}/revise`, { method: 'POST', body: { instruction: revise.value } });
      route();
    } catch (err) { toast(err.message, true); }
  } }, 'Ask Claude to revise');
  const rewriteBtn = h('button', { class: 'ghost', onclick: async () => {
    if (m.script && !confirm('Write a fresh draft from scratch? The current script will be replaced.')) return;
    try {
      await api(`/api/meditations/${m.id}/write`, { method: 'POST' });
      route();
    } catch (err) { toast(err.message, true); }
  } }, m.script ? 'Fresh draft' : 'Write it with Claude');

  function drawSide() {
    const s = m.stats;
    const target = (m.minutes || 0) * 60;
    const off = target ? Math.round(((s.estimatedSeconds - target) / target) * 100) : 0;
    const lenChip = !m.script ? '' : Math.abs(off) <= 10 ? h('span', { class: 'chip good' }, '✓ on length') : h('span', { class: 'chip warn' }, `! ${off > 0 ? '+' : ''}${off}% vs ${m.minutes} min`);
    side.replaceChildren(
      h('div', { class: 'card' }, h('div', { class: 'row' }, h('h3', { style: 'margin:0' }, 'Length'), h('span', { class: 'spacer' }), lenChip),
        h('div', { class: 'kv', style: 'margin-top:10px' },
          h('div', {}, 'Estimated'), h('div', {}, `${mmss(s.estimatedSeconds)} (target ${m.minutes} min)`),
          h('div', {}, 'Spoken words'), h('div', {}, `${s.words}${m.targets ? ` of about ${m.targets.words}` : ''}`),
          h('div', {}, 'Silence'), h('div', {}, `${mmss(s.silenceSeconds)} incl. gaps`),
          h('div', {}, 'First 2 minutes'), h('div', {}, `${s.earlySilenceSeconds}s of silence`),
          h('div', {}, 'ElevenLabs'), h('div', {}, `${s.chars.toLocaleString('en-GB')} characters, ${s.requests} takes`)),
        h('div', { class: 'hint' }, 'Estimates use your measured pace once you have voiced a meditation.')),
      h('div', { class: 'card' }, h('h3', {}, 'Quality check'), checkList(m.checks || [])),
      m.pasteIssues?.length ? h('div', { class: 'card' }, h('h3', {}, 'Would be read aloud'), h('ul', { class: 'checks' }, m.pasteIssues.map((i) => h('li', { class: i.severity === 'block' ? 'block' : 'flag' }, h('span', { class: 'icon' }, i.severity === 'block' ? '✕' : '!'), h('span', {}, h('b', {}, `Line ${i.line}. `), i.message))))) : '',
      m.notesForJulian ? h('div', { class: 'card' }, h('h3', {}, 'Notes from the draft'), h('div', { class: 'small', style: 'color:var(--cream-2);white-space:pre-wrap' }, m.notesForJulian)) : '',
      h('div', { class: 'card' }, h('h3', {}, 'Revise'), revise, h('div', { class: 'row', style: 'margin-top:10px' }, reviseBtn, rewriteBtn)),
    );
  }
  drawSide();

  body.replaceChildren(
    m.writeError ? h('div', { class: 'banner bad' }, `The last write did not finish: ${m.writeError}`) : '',
    h('div', { class: 'split' },
      h('div', {},
        h('div', { class: 'card' }, h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, 'Script'), h('span', { class: 'spacer' }), savedNote,
          h('a', { class: 'btn ghost small', href: `/api/meditations/${m.id}/script.txt` }, 'Download')), h('div', { style: 'margin-top:12px' }, script)),
        h('div', { class: 'card section' }, h('h2', {}, 'Titles, descriptions and cover'),
          h('div', { class: 'grid g2' }, field('title', 'Insight Timer title'), field('spotifyTitle', 'Spotify title')),
          field('subtitle', 'Subtitle'),
          field('insightTimerDescription', 'Insight Timer description', 7),
          field('spotifyDescription', 'Spotify description', 5),
          field('tags', 'Tags (comma separated)'),
          h('h3', { style: 'margin-top:22px' }, 'Cover and trailer'),
          field('coverImagePrompt', 'Cover image description (for the image generator)', 5),
          field('coverAltText', 'Cover alt text'),
          h('div', { class: 'grid g2' }, field('trailerLine', 'Trailer line (under 70 characters)'), field('snippetStart', 'Snippet starts at the paragraph beginning')))),
      side),
  );
}

async function voicesList() {
  try {
    return await api('/api/voices');
  } catch (err) {
    toast(err.message, true);
    return { voices: [], offline: true };
  }
}

function paragraphText(text) {
  // Shows audio tags dimmed so the words stand out.
  const parts = String(text).split(/(\[[^\]]+\])/g).filter(Boolean);
  return h('div', { class: 'words' }, parts.map((p) => (/^\[.*\]$/.test(p) ? h('span', { class: 'tag' }, p, ' ') : p)));
}

function renderPlayer(m, source) {
  const r = m.renders?.[source];
  if (!r) return '';
  const src = `/api/renders/${m.id}/${source}?v=${encodeURIComponent(r.renderedAt)}`;
  return h('div', { class: 'player' },
    h('div', { class: 'row' }, h('b', {}, source === 'recorded' ? 'Your recorded mix' : 'Voice clone mix'), h('span', { class: 'muted small' }, `${mmss(r.seconds)} · ${r.integratedLufs ?? '?'} LUFS · ${when(r.renderedAt)}${r.bed ? ` · bed: ${r.bed}` : ''}`),
      h('span', { class: 'spacer' }), h('a', { class: 'btn ghost small', href: `${src}&download=1` }, 'Download MP3')),
    h('audio', { controls: true, preload: 'none', src }));
}

async function tabVoice(m, body) {
  const [{ voices, offline }, { beds }, { plan }] = await Promise.all([voicesList(), api('/api/beds'), api(`/api/meditations/${m.id}/plan`)]);
  const voiceSel = h('select', {}, voices.map((v) => h('option', { value: v.voice_id, selected: v.voice_id === (m.voiceId || SETTINGS.voiceId) }, v.name.trim(), v.category ? ` (${v.category})` : '')));
  const preview = h('audio', { controls: true, preload: 'none', style: 'display:none' });
  const showPreview = () => {
    const v = voices.find((x) => x.voice_id === voiceSel.value);
    if (v?.preview_url) { preview.src = v.preview_url; preview.style.display = ''; } else preview.style.display = 'none';
  };
  showPreview();
  const modelSel = h('select', {}, [['eleven_v4', 'eleven_v4 (newest, audio tags)'], ['eleven_v3', 'eleven_v3 (audio tags)']].map(([v, l]) => h('option', { value: v, selected: v === (m.ttsModel || SETTINGS.ttsModel) }, l)));
  const prefix = h('input', { type: 'text', value: m.deliveryPrefix ?? SETTINGS.deliveryPrefix });
  const bedSel = h('select', {}, h('option', { value: '' }, 'No music bed'), beds.map((b) => h('option', { value: b.name, selected: b.name === m.bedFile }, b.title || b.name)));
  const bedVol = h('input', { type: 'range', min: '-40', max: '-8', step: '1', value: String(m.bedVolumeDb ?? SETTINGS.bedVolumeDb) });
  const bedVolOut = h('span', { class: 'chip' }, `${bedVol.value} dB`);
  const saveVoice = async () => {
    const v = voices.find((x) => x.voice_id === voiceSel.value);
    await api(`/api/meditations/${m.id}`, { method: 'PUT', body: { voiceId: voiceSel.value, voiceName: v?.name?.trim(), ttsModel: modelSel.value, deliveryPrefix: prefix.value, bedFile: bedSel.value || null, bedVolumeDb: Number(bedVol.value) } });
    route();
  };
  voiceSel.addEventListener('change', saveVoice);
  modelSel.addEventListener('change', saveVoice);
  prefix.addEventListener('change', saveVoice);
  bedSel.addEventListener('change', saveVoice);
  bedVol.addEventListener('input', () => (bedVolOut.textContent = `${bedVol.value} dB`));
  bedVol.addEventListener('change', saveVoice);

  const speech = plan.filter((p) => p.type === 'speech');
  const list = h('div', { class: 'paras' }, plan.map((p) => {
    if (p.type === 'silence') return p.explicit ? h('div', { class: 'silence-row' }, `${p.seconds} seconds of silence`) : '';
    const audio = h('audio', { controls: true, preload: 'none', style: p.cloneUrl ? '' : 'display:none', src: p.cloneUrl || undefined });
    const voiceBtn = h('button', { class: 'ghost small', onclick: async () => {
      voiceBtn.disabled = true;
      voiceBtn.textContent = 'Voicing…';
      try {
        const r = await api(`/api/meditations/${m.id}/paragraphs/${p.key}/voice`, { method: 'POST', body: { newTake: !!p.cloneUrl } });
        audio.src = `${r.url}?t=${Date.now()}`;
        audio.style.display = '';
        audio.play().catch(() => {});
        voiceBtn.textContent = 'New take';
        p.cloneUrl = r.url;
        if (r.take > 1) toast(`Take ${r.take} kept for this paragraph`);
      } catch (err) {
        toast(err.message, true);
        voiceBtn.textContent = p.cloneUrl ? 'New take' : 'Voice this';
      } finally { voiceBtn.disabled = false; }
    } }, p.cloneUrl ? 'New take' : 'Voice this');
    return h('div', { class: 'para' }, h('div', {}, paragraphText(p.text), audio), h('div', { class: 'actions' }, voiceBtn));
  }));

  const box = h('div');
  const renderBtn = h('button', { onclick: async () => {
    renderBtn.disabled = true;
    const jb = jobBox();
    box.replaceChildren(jb);
    try {
      const { job } = await api(`/api/meditations/${m.id}/render`, { method: 'POST', body: { source: 'clone' } });
      const end = await watchJob(job.id, jb.update);
      if (end.status === 'done') { toast('Mixed and ready'); route(); } else toast(end.error, true);
    } catch (err) { toast(err.message, true); } finally { renderBtn.disabled = false; }
  } }, 'Voice and mix the whole meditation');
  if (m.job && m.job.kind === 'render') {
    const jb = jobBox();
    box.replaceChildren(jb);
    renderBtn.disabled = true;
    watchJob(m.job.id, jb.update).then(() => route());
  }

  body.replaceChildren(
    h('div', { class: 'banner' }, 'The clone mix is for Spotify, YouTube and your own site. Insight Timer only accepts your real voice, so use ', h('a', { href: `#/m/${m.id}/record` }, 'Record mode'), ' for Insight Timer.'),
    h('div', { class: 'split' },
      h('div', { class: 'card' },
        h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, 'Paragraphs'), h('span', { class: 'spacer' }), h('span', { class: 'muted small' }, `${m.clone.voiced} of ${m.clone.total} voiced`)),
        h('p', { class: 'muted small' }, 'Voice a paragraph to hear it. Not right? Ask for a new take; the take you hear last is the one used in the mix. Voiced paragraphs are kept, so editing one line only re-voices that line.'),
        speech.length ? list : h('div', { class: 'empty' }, 'The script is empty.')),
      h('div', { class: 'grid' },
        h('div', { class: 'card' }, h('h3', {}, 'Voice'), voiceSel, preview, offline ? h('div', { class: 'hint' }, 'Add your ElevenLabs key in Settings to see every voice.') : '',
          h('label', {}, 'Model'), modelSel,
          h('label', {}, 'Delivery tags before each paragraph'), prefix, h('div', { class: 'hint' }, 'Used when a paragraph does not start with its own tag. eleven_v4 has no speed slider; pace comes from [slowly] and [pause].')),
        h('div', { class: 'card' }, h('h3', {}, 'Music bed'), bedSel, h('label', {}, 'Bed level ', bedVolOut), bedVol, h('div', { class: 'hint' }, 'Make or upload beds in Settings. Short beds loop with long, soft crossfades. AI music is fine under your voice on Insight Timer; its credit goes in the description.')),
        h('div', { class: 'card' }, h('h3', {}, 'Full mix'),
          h('div', { class: 'small muted' }, m.clone.charsToSpend ? `About ${m.clone.charsToSpend.toLocaleString('en-GB')} ElevenLabs characters to voice ${m.clone.requestsToMake} paragraph${m.clone.requestsToMake === 1 ? '' : 's'}.` : 'Every paragraph is voiced. Mixing costs nothing.'),
          h('div', { class: 'row', style: 'margin-top:10px' }, renderBtn), box, renderPlayer(m, 'clone')))),
  );
}

// ---------- Record mode (Julian's own voice, for Insight Timer) ----------
function pickMime() {
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

async function tabRecord(m, body) {
  const { plan } = await api(`/api/meditations/${m.id}/plan`);
  const speech = plan.filter((p) => p.type === 'speech');
  let stream = null;
  let ctx = null;
  let recorder = null;
  let recordingKey = null;
  let current = speech.findIndex((p) => !p.recordingUrl);
  if (current < 0) current = 0;
  const meter = h('div', { class: 'meter' }, h('div'));
  const progress = h('span', { class: 'muted small' });
  const micBtn = h('button', { class: 'ghost', onclick: () => ensureMic().catch((err) => toast(`Microphone: ${err.message}`, true)) }, 'Allow microphone');

  cleanups.push(() => {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    stream?.getTracks().forEach((t) => t.stop());
    ctx?.close();
  });

  async function ensureMic() {
    if (stream) return stream;
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false, channelCount: 1 } });
    ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Float32Array(analyser.fftSize);
    const bar = meter.firstChild;
    const tick = () => {
      if (!stream) return;
      analyser.getFloatTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v));
      bar.style.width = `${Math.min(100, peak * 140)}%`;
      bar.style.background = peak > 0.9 ? 'var(--bad)' : 'var(--good)';
      requestAnimationFrame(tick);
    };
    tick();
    micBtn.textContent = 'Microphone on';
    micBtn.disabled = true;
    return stream;
  }

  const rows = new Map();
  function drawProgress() {
    const done = speech.filter((p) => p.recordingUrl).length;
    progress.textContent = `${done} of ${speech.length} paragraphs recorded`;
    mixBtn.disabled = done < speech.length || !speech.length;
  }

  async function startRecording(p) {
    await ensureMic();
    const mime = pickMime();
    const chunks = [];
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 160000 } : undefined);
    recordingKey = p.textKey;
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = async () => {
      const type = recorder.mimeType || mime || 'audio/webm';
      const blob = new Blob(chunks, { type });
      const fd = new FormData();
      fd.append('audio', blob, `take.${type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'}`);
      try {
        await api(`/api/meditations/${m.id}/recordings/${p.textKey}`, { method: 'POST', body: fd });
        p.recordingUrl = `/api/meditations/${m.id}/recordings/${p.textKey}?t=${Date.now()}`;
        const next = speech.findIndex((x, i) => i > speech.indexOf(p) && !x.recordingUrl);
        current = next >= 0 ? next : speech.indexOf(p);
      } catch (err) {
        toast(err.message, true);
      }
      recordingKey = null;
      redraw();
    };
    recorder.start();
    redraw();
  }

  function stopRecording() {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }

  const list = h('div', { class: 'paras' });
  function redraw() {
    list.replaceChildren(...plan.map((p) => {
      if (p.type === 'silence') return p.explicit ? h('div', { class: 'silence-row' }, `${p.seconds} seconds of silence, added for you. Do not wait it out.`) : '';
      const i = speech.indexOf(p);
      const isRec = recordingKey === p.textKey;
      const actions = h('div', { class: 'actions' },
        p.cloneUrl ? h('button', { class: 'ghost small', onclick: () => new Audio(p.cloneUrl).play() }, 'Hear pace guide') : '',
        isRec
          ? h('button', { class: 'small', onclick: stopRecording }, 'Stop')
          : h('button', { class: p.recordingUrl ? 'ghost small' : 'small', disabled: !!recordingKey, onclick: () => { current = i; startRecording(p).catch((err) => toast(`Microphone: ${err.message}`, true)); } }, p.recordingUrl ? 'Redo' : 'Record'),
        p.recordingUrl ? h('button', { class: 'ghost small', onclick: () => new Audio(p.recordingUrl).play() }, 'Play mine') : '');
      const row = h('div', { class: `para ${i === current ? 'current' : ''} ${p.recordingUrl ? 'done' : ''}` },
        h('div', {}, h('div', { class: 'muted small' }, `Paragraph ${i + 1}${p.recordingUrl ? ' · recorded' : ''}${isRec ? ' · recording now' : ''}`), paragraphText(p.text)), actions);
      rows.set(p.textKey, row);
      return row;
    }));
    drawProgress();
    const cur = speech[current] && rows.get(speech[current].textKey);
    if (cur && recordingKey) cur.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  const onKey = (e) => {
    if (e.target.matches('input, textarea, select')) return;
    if (e.key === ' ' || e.key.toLowerCase() === 'r') {
      e.preventDefault();
      if (recordingKey) stopRecording();
      else if (speech[current]) startRecording(speech[current]).catch((err) => toast(`Microphone: ${err.message}`, true));
    }
  };
  document.addEventListener('keydown', onKey);
  cleanups.push(() => document.removeEventListener('keydown', onKey));

  const box = h('div');
  const mixBtn = h('button', { onclick: async () => {
    mixBtn.disabled = true;
    const jb = jobBox();
    box.replaceChildren(jb);
    try {
      const { job } = await api(`/api/meditations/${m.id}/render`, { method: 'POST', body: { source: 'recorded' } });
      const end = await watchJob(job.id, jb.update);
      if (end.status === 'done') { toast('Your recorded mix is ready'); route(); } else toast(end.error, true);
    } catch (err) { toast(err.message, true); } finally { drawProgress(); }
  } }, 'Mix my recorded version');

  redraw();
  body.replaceChildren(
    h('div', { class: 'split' },
      h('div', { class: 'card' },
        h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, 'Read it in your ', h('em', {}, 'own voice')), h('span', { class: 'spacer' }), progress),
        h('p', { class: 'muted small' }, 'Read one paragraph at a time. Press R or the space bar to start and stop; it moves to the next paragraph by itself. The silences, gaps, music bed, bell and loudness are added for you, so you never sit through a silence. The tags in gold are only a reminder of the feel.'),
        speech.length ? list : h('div', { class: 'empty' }, 'The script is empty.')),
      h('div', { class: 'grid' },
        h('div', { class: 'card' }, h('h3', {}, 'Microphone'), h('div', { class: 'row' }, micBtn, meter),
          h('div', { class: 'hint' }, 'Use headphones if you play the pace guide. Keep the meter out of the red. A quiet room with soft furnishings sounds best.')),
        h('div', { class: 'card' }, h('h3', {}, 'Insight Timer mix'), h('div', { class: 'small muted' }, 'This is the version for Insight Timer: your real voice, with exact silences and the bed and bell from the Voice tab.'),
          h('div', { class: 'row', style: 'margin-top:10px' }, mixBtn), box, renderPlayer(m, 'recorded')))),
  );
}

// ---------- Publish ----------
async function tabPublish(m, body) {
  const packCard = async (platform, label) => {
    const card = h('div', { class: 'card' }, h('h2', {}, label));
    try {
      const text = await api(`/api/meditations/${m.id}/pack/${platform}`);
      const src = platform === 'insight-timer' ? 'recorded' : m.renders?.recorded ? 'recorded' : 'clone';
      card.append(
        h('div', { class: 'row' },
          h('a', { class: 'btn small', href: `/api/renders/${m.id}/${src}?download=1` }, 'Download MP3'),
          h('a', { class: 'btn ghost small', href: `/api/meditations/${m.id}/pack/${platform}?download=1` }, 'Download pack'),
          h('button', { class: 'ghost small', onclick: () => navigator.clipboard.writeText(platform === 'insight-timer' ? m.insightTimerDescription || '' : m.spotifyDescription || '').then(() => toast('Description copied')) }, 'Copy description')),
        h('pre', { class: 'packtext', style: 'margin-top:12px' }, text));
    } catch (err) {
      card.append(h('div', { class: 'banner' }, err.message), platform === 'insight-timer' ? h('a', { class: 'btn small', href: `#/m/${m.id}/record` }, 'Go to Record mode') : h('a', { class: 'btn small', href: `#/m/${m.id}/voice` }, 'Go to Voice'));
    }
    return card;
  };
  const pub = m.published || {};
  const itUrl = h('input', { type: 'url', value: pub.insightTimer || '', placeholder: 'https://insighttimer.com/…' });
  const spUrl = h('input', { type: 'url', value: pub.spotify || '', placeholder: 'https://open.spotify.com/…' });
  const ytUrl = h('input', { type: 'url', value: pub.youtube || '', placeholder: 'https://youtube.com/…' });
  const markBtn = h('button', { onclick: async () => {
    const published = { insightTimer: itUrl.value.trim(), spotify: spUrl.value.trim(), youtube: ytUrl.value.trim(), at: pub.at || new Date().toISOString() };
    const any = published.insightTimer || published.spotify || published.youtube;
    await api(`/api/meditations/${m.id}`, { method: 'PUT', body: { published, status: any ? 'published' : m.renders ? 'voiced' : 'draft' } });
    toast(any ? 'Marked as published' : 'Saved');
    route();
  } }, 'Save links and mark published');
  body.replaceChildren(
    m.brandSummary.blocks ? h('div', { class: 'banner bad' }, `The quality check has ${m.brandSummary.blocks} thing${m.brandSummary.blocks > 1 ? 's' : ''} to fix before this goes out. See the Script tab.`) : '',
    previewCards(m),
    h('div', { class: 'grid g2 section' }, await packCard('insight-timer', 'Insight Timer'), await packCard('spotify', 'Spotify')),
    h('div', { class: 'card section' }, h('h2', {}, 'Where it lives'),
      h('div', { class: 'grid g3' }, h('div', {}, h('label', {}, 'Insight Timer link'), itUrl), h('div', {}, h('label', {}, 'Spotify link'), spUrl), h('div', {}, h('label', {}, 'YouTube link'), ytUrl)),
      h('div', { class: 'row', style: 'margin-top:14px' }, markBtn)),
  );
}

// ---------- 30 second snippet, trailer video and cover ----------
// The name at the foot of the card, letter spaced: a brand profile's wordmark, else the name in Settings.
const spaced = (t) => String(t || '').toUpperCase().split(' ').map((w) => w.split('').join(' ')).join('   ');
const wordmarkFor = (m) => BRANDS.brands[m.brand]?.wordmark || spaced(SETTINGS.cardName || 'Julian Jenkins');

function wrapToWidth(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(test).width > maxWidth) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

async function loadLogo() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `/api/brand/logo?t=${Date.now()}`;
  });
}

// The trailer card, 1080 x 1920: a deep blue gradient with a faint warm glow and still film grain,
// the title in Cormorant, the trailer line in italic, the logo if one is uploaded, and the name.
async function drawCard(canvas, m) {
  const W = 1080;
  const H = 1920;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  await Promise.all([document.fonts.load('500 96px "Studio Cormorant"'), document.fonts.load('italic 300 58px "Studio Cormorant"')]);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#182f48'); g.addColorStop(0.15, '#14283f'); g.addColorStop(0.8, '#0c192b'); g.addColorStop(1, '#040a14');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H * 0.32, 0, W / 2, H * 0.32, W * 0.75);
  glow.addColorStop(0, 'rgba(212,165,116,0.10)');
  glow.addColorStop(1, 'rgba(212,165,116,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const grain = ctx.getImageData(0, 0, W, H);
  for (let i = 0; i < grain.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 10;
    grain.data[i] += n; grain.data[i + 1] += n; grain.data[i + 2] += n;
  }
  ctx.putImageData(grain, 0, 0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '500 96px "Studio Cormorant"';
  // The card does not need the length the Insight Timer title carries.
  const cardTitle = String(m.title || 'Untitled').replace(/:\s*\d+\s*Minutes?\s*$/i, '').trim();
  const titleLines = wrapToWidth(ctx, cardTitle, 860).slice(0, 4);
  ctx.font = 'italic 300 58px "Studio Cormorant"';
  const lineLines = wrapToWidth(ctx, m.trailerLine || m.subtitle || '', 820).slice(0, 3);
  const block = titleLines.length * 118 + (lineLines.length ? 60 + lineLines.length * 76 : 0);
  let y = H * 0.45 - block / 2 + 90;
  ctx.fillStyle = '#fdf6e8';
  ctx.font = '500 96px "Studio Cormorant"';
  for (const t of titleLines) { ctx.fillText(t, W / 2, y); y += 118; }
  y += 40;
  ctx.fillStyle = '#f4d590';
  ctx.font = 'italic 300 58px "Studio Cormorant"';
  for (const t of lineLines) { ctx.fillText(t, W / 2, y); y += 76; }
  const logo = await loadLogo();
  if (logo) {
    const w = 170;
    const h2 = (logo.height / logo.width) * w;
    ctx.drawImage(logo, (W - w) / 2, H - 470, w, h2);
  }
  ctx.fillStyle = '#d4a574';
  ctx.font = '500 36px "Studio Cormorant"';
  ctx.fillText(wordmarkFor(m), W / 2, H - 230);
  return canvas;
}

function previewCards(m) {
  const sources = ['recorded', 'clone'].filter((s) => m.renders?.[s]);
  const wrapAll = h('div', { class: 'grid g2' });
  if (!sources.length) {
    wrapAll.append(h('div', { class: 'card' }, h('h2', {}, '30 second snippet and trailer'), h('div', { class: 'empty' }, 'Mix the meditation first (Voice or Record tab). The snippet and trailer are cut from the finished mix.')));
  } else {
    let source = sources[0];
    const srcSel = h('select', { onchange: () => { source = srcSel.value; draw(); } }, sources.map((s) => h('option', { value: s }, s === 'recorded' ? 'Your recorded mix (for Insight Timer)' : 'Voice clone mix (Spotify, YouTube, social)')));
    const snipBox = h('div');
    const trailerBox = h('div');
    const preview = h('canvas', { class: 'card-preview' });
    drawCard(preview, m).catch(() => {});
    const draw = () => {
      const r = m.renders[source];
      const paraSel = h('select', {}, h('option', { value: '' }, 'Let the studio choose'),
        (r.timeline || []).map((p) => h('option', { value: p.textKey, selected: r.snippet?.textKey === p.textKey }, `${mmss(p.start)}  ${p.words}...`)));
      const makeBtn = h('button', { onclick: async () => {
        makeBtn.disabled = true;
        try {
          const out = await api(`/api/meditations/${m.id}/snippet`, { method: 'POST', body: { source, textKey: paraSel.value || null } });
          r.snippet = out.snippet;
          toast('Snippet ready');
          draw();
        } catch (err) { toast(err.message, true); } finally { makeBtn.disabled = false; }
      } }, r.snippet ? 'Make it again' : 'Make the snippet');
      const snipSrc = `/api/renders/${m.id}/snippet-${source}?v=${r.snippet ? Date.parse(r.snippet.madeAt) : 0}`;
      snipBox.replaceChildren(
        h('label', {}, 'Start at'), paraSel,
        h('div', { class: 'row', style: 'margin-top:10px' }, makeBtn),
        r.snippet ? h('div', { class: 'player' },
          source === 'recorded'
            ? h('div', { class: 'banner', style: 'margin:0 0 8px' }, h('b', {}, `Set the snippet slider to ${mmss(r.snippet.start)}. `), 'In the Insight Timer Teacher Dashboard: Edit, then Pick a Snippet, drag the slider to this time, then resubmit.')
            : h('div', { class: 'banner', style: 'margin:0 0 8px' }, h('b', {}, `Preview from ${mmss(r.snippet.start)}. `), 'This clone snippet is for Spotify, YouTube and social. For Insight Timer, mix your recorded version and make its snippet; the slider time comes from that.'),
          h('div', { class: 'muted small' }, `${r.snippet.reason}: "${r.snippet.words}..."`),
          h('audio', { controls: true, preload: 'none', src: snipSrc }),
          h('div', { class: 'row', style: 'margin-top:8px' }, h('a', { class: 'btn ghost small', href: `${snipSrc}&download=1` }, 'Download snippet MP3'))) : '');

      const trailerSrc = `/api/renders/${m.id}/trailer-${source}?v=${r.trailer ? Date.parse(r.trailer.madeAt) : 0}`;
      const jb = h('div');
      const trailerBtn = h('button', { onclick: async () => {
        trailerBtn.disabled = true;
        const box = jobBox();
        jb.replaceChildren(box);
        try {
          const canvas = await drawCard(document.createElement('canvas'), m);
          const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
          const fd = new FormData();
          fd.append('source', source);
          fd.append('card', blob, 'card.png');
          const { job } = await api(`/api/meditations/${m.id}/trailer`, { method: 'POST', body: fd });
          const end = await watchJob(job.id, box.update);
          if (end.status === 'done') { r.trailer = end.result; toast('Trailer ready'); draw(); } else toast(end.error, true);
        } catch (err) { toast(err.message, true); } finally { trailerBtn.disabled = false; }
      } }, r.trailer ? 'Make it again' : 'Make the trailer video');
      trailerBox.replaceChildren(
        h('div', { class: 'two' },
          h('div', {}, r.trailer ? h('video', { class: 'trailer', controls: true, preload: 'metadata', src: trailerSrc }) : preview),
          h('div', {},
            h('p', { class: 'small muted', style: 'margin-top:0' }, 'A 30 second portrait video, 1080 x 1920: the snippet audio over a calm title card. Insight Timer course trailers are MP4, portrait, ideally 20 to 30 seconds. It also works for Instagram reels and YouTube Shorts.'),
            h('div', { class: 'small muted' }, 'The card uses the title and the trailer line from the Script tab. Upload a logo in Settings to put it on the card.'),
            h('div', { class: 'row', style: 'margin-top:12px' }, trailerBtn, r.trailer ? h('a', { class: 'btn ghost small', href: `${trailerSrc}&download=1` }, 'Download MP4') : ''),
            jb)));
    };
    draw();
    wrapAll.append(
      h('div', { class: 'card' }, h('h2', {}, '30 second snippet'), h('p', { class: 'small muted', style: 'margin-top:0' }, 'Insight Timer plays 30 seconds of your track as its preview. You choose them in the Teacher Dashboard with a slider; the studio picks the best 30 seconds and tells you where to set it.'),
        h('label', {}, 'From'), srcSel, snipBox),
      h('div', { class: 'card' }, h('h2', {}, 'Trailer video'), trailerBox));
  }
  const copy = (text) => navigator.clipboard.writeText(text || '').then(() => toast('Copied'));
  const cover = h('div', { class: 'card section' }, h('h2', {}, 'Cover image'),
    h('div', { class: 'grid g2' },
      h('div', {}, h('div', { class: 'row' }, h('h3', { style: 'margin:0;flex:1' }, 'Description for the image generator'), h('button', { class: 'ghost small', onclick: () => copy(m.coverImagePrompt) }, 'Copy')),
        h('p', { class: 'small', style: 'white-space:pre-wrap;color:var(--cream-2)' }, m.coverImagePrompt || 'None yet. On the Script tab, ask Claude to revise: "add the cover image description, alt text, trailer line and snippet start".')),
      h('div', {}, h('div', { class: 'row' }, h('h3', { style: 'margin:0;flex:1' }, 'Alt text'), h('button', { class: 'ghost small', onclick: () => copy(m.coverAltText) }, 'Copy')),
        h('p', { class: 'small', style: 'color:var(--cream-2)' }, m.coverAltText || 'None yet.'),
        h('ul', { class: 'small muted', style: 'padding-left:18px' },
          h('li', {}, 'Insight Timer: square, at least 1600 x 1600 px, under 20 MB. Leave text off the image; the app shows the title.'),
          h('li', {}, 'Spotify: square, 1400 x 1400 px or more for podcasts, 3000 x 3000 px for music releases.'),
          h('li', {}, 'Only use images you have the rights to.')))));
  return h('div', {}, wrapAll, cover);
}

// ---------- Performance (per meditation) ----------
async function tabPerformance(m, body) {
  const date = h('input', { type: 'date', value: new Date().toISOString().slice(0, 10) });
  const platform = h('select', {}, ['Insight Timer', 'Spotify', 'YouTube', 'Website'].map((p) => h('option', { value: p }, p)));
  const plays = h('input', { type: 'number', min: '0', placeholder: 'total so far' });
  const payable = h('input', { type: 'number', min: '0', placeholder: 'Insight Timer only' });
  const ret = h('input', { type: 'number', min: '0', max: '100', step: '0.1', placeholder: '%' });
  const don = h('input', { type: 'number', min: '0', step: '0.01', placeholder: '£' });
  const notes = h('input', { type: 'text', placeholder: 'Optional' });
  const add = h('button', { onclick: async () => {
    await api(`/api/meditations/${m.id}/performance`, { method: 'POST', body: { date: date.value, platform: platform.value, plays: plays.value, payablePlays: payable.value, returnRate: ret.value, donations: don.value, notes: notes.value } });
    toast('Logged');
    route();
  } }, 'Log figures');
  const entries = [...(m.performance || [])].sort((a, b) => b.date.localeCompare(a.date));
  body.replaceChildren(
    h('div', { class: 'card' }, h('h2', {}, 'Log the latest figures'),
      h('p', { class: 'muted small' }, 'Copy the totals from your Insight Timer teacher dashboard or Spotify for Creators. Plays are running totals, so the newest figure per platform is the one counted.'),
      h('div', { class: 'grid g3' },
        h('div', {}, h('label', {}, 'Date'), date), h('div', {}, h('label', {}, 'Platform'), platform), h('div', {}, h('label', {}, 'Plays'), plays),
        h('div', {}, h('label', {}, 'Payable plays'), payable), h('div', {}, h('label', {}, 'Return rate'), ret), h('div', {}, h('label', {}, 'Donations'), don)),
      h('label', {}, 'Notes'), notes, h('div', { class: 'row', style: 'margin-top:14px' }, add)),
    h('div', { class: 'card section' }, h('h2', {}, 'History'),
      entries.length ? h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'Platform'), h('th', { class: 'num' }, 'Plays'), h('th', { class: 'num' }, 'Payable'), h('th', { class: 'num' }, 'Return rate'), h('th', { class: 'num' }, 'Donations'), h('th', {}, 'Notes'), h('th', {}))),
        h('tbody', {}, entries.map((e) => h('tr', {}, h('td', {}, e.date), h('td', {}, e.platform), h('td', { class: 'num' }, e.plays ?? '·'), h('td', { class: 'num' }, e.payablePlays ?? '·'),
          h('td', { class: 'num' }, e.returnRate != null ? `${e.returnRate}%` : '·'), h('td', { class: 'num' }, e.donations != null ? `£${e.donations}` : '·'), h('td', { class: 'small muted' }, e.notes),
          h('td', {}, h('button', { class: 'ghost small', onclick: async () => { await api(`/api/meditations/${m.id}/performance/${e.id}`, { method: 'DELETE' }); route(); } }, 'Remove')))))) : h('div', { class: 'empty' }, 'No figures logged yet.')),
  );
}

// ---------- Library ----------
async function pageLibrary() {
  const list = await api('/api/meditations');
  const q = h('input', { type: 'text', placeholder: 'Search titles and themes' });
  const st = h('select', {}, h('option', { value: '' }, 'Every status'), Object.entries(STATUS).map(([k, v]) => h('option', { value: k }, v.label)));
  const br = h('select', { style: BRANDS.enabled ? '' : 'display:none' }, h('option', { value: '' }, 'Any brand'), Object.values(BRANDS.brands).map((b) => h('option', { value: b.id }, b.name)));
  const tbody = h('tbody');
  const draw = () => {
    const term = q.value.toLowerCase();
    const rows = list.filter((m) => (!st.value || m.status === st.value) && (!br.value || m.brand === br.value) && (!term || `${m.title} ${m.theme} ${m.formatName}`.toLowerCase().includes(term)));
    tbody.replaceChildren(...rows.map((m) => h('tr', { class: 'click', onclick: () => (location.hash = `#/m/${m.id}`) },
      h('td', {}, m.title || h('span', { class: 'muted' }, 'Untitled'), m.theme ? h('div', { class: 'muted small' }, m.theme) : ''),
      h('td', { class: 'muted' }, m.formatName),
      h('td', {}, statusChip(m.status)), h('td', {}, brandChip(m.brandSummary, m)),
      h('td', {}, m.renders?.clone ? h('span', { class: 'chip' }, 'Clone') : '', ' ', m.renders?.recorded ? h('span', { class: 'chip good' }, 'Your voice') : ''),
      h('td', { class: 'num' }, m.script ? mmss(m.renders?.recorded?.seconds || m.renders?.clone?.seconds || m.stats.estimatedSeconds) : '·'),
      h('td', { class: 'muted small' }, when(m.updatedAt)))));
    if (!rows.length) tbody.replaceChildren(h('tr', {}, h('td', { colspan: '7', class: 'empty' }, list.length ? 'Nothing matches.' : 'No meditations yet.')));
  };
  [q, st, br].forEach((el) => el.addEventListener('input', draw));
  draw();
  $app.replaceChildren(
    h('div', { class: 'row' }, h('h1', {}, 'Library'), h('span', { class: 'spacer' }), h('a', { class: 'btn', href: '#/create' }, 'New meditation')),
    h('div', { class: 'row', style: 'margin:14px 0 18px' }, h('div', { style: 'flex:2;min-width:220px' }, q), h('div', { style: 'flex:1;min-width:160px' }, st), h('div', { style: 'flex:1;min-width:160px' }, br)),
    h('div', { class: 'card' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Title'), h('th', {}, 'Format'), h('th', {}, 'Status'), h('th', {}, 'Quality check'), h('th', {}, 'Audio'), h('th', { class: 'num' }, 'Length'), h('th', {}, 'Updated'))), tbody)),
  );
}

// ---------- Performance (all) ----------
async function pagePerformance() {
  const [ov, list] = await Promise.all([api('/api/overview'), api('/api/meditations')]);
  const latest = (m, platform) => {
    const e = (m.performance || []).filter((p) => p.platform === platform).sort((a, b) => b.date.localeCompare(a.date))[0];
    return e || null;
  };
  const tracked = list.filter((m) => (m.performance || []).length);
  const best = ov.playsByFormat.map((r) => ({ ...r, avg: Math.round(r.plays / r.tracks) })).sort((a, b) => b.avg - a.avg);
  $app.replaceChildren(
    h('h1', {}, 'What ', h('em', {}, 'lands')),
    h('p', { class: 'lede' }, 'The figures you log from Insight Timer and Spotify, by meditation and by format. Return rate is the one Insight Timer rewards most.'),
    h('div', { class: 'tiles' }, tile('Plays logged', compact(ov.playsLogged), 'latest totals'), tile('Tracks with figures', tracked.length, `of ${list.length} meditations`),
      tile('Best format so far', best[0] ? best[0].format : '·', best[0] ? `${compact(best[0].avg)} plays per track` : 'log some plays first')),
    h('div', { class: 'split section' },
      h('div', { class: 'card' }, h('h2', {}, 'By meditation'),
        tracked.length ? h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Title'), h('th', {}, 'Format'), h('th', { class: 'num' }, 'Insight Timer plays'), h('th', { class: 'num' }, 'Payable'), h('th', { class: 'num' }, 'Return rate'), h('th', { class: 'num' }, 'Spotify plays'))),
          h('tbody', {}, tracked.map((m) => {
            const it = latest(m, 'Insight Timer');
            const sp = latest(m, 'Spotify');
            return h('tr', { class: 'click', onclick: () => (location.hash = `#/m/${m.id}/performance`) }, h('td', {}, m.title || 'Untitled'), h('td', { class: 'muted' }, m.formatName),
              h('td', { class: 'num' }, it?.plays != null ? it.plays.toLocaleString('en-GB') : '·'),
              h('td', { class: 'num', title: 'Share of plays that passed 2 minutes. A big gap means people leave early.' }, it?.plays && it?.payablePlays != null ? `${Math.round((it.payablePlays / it.plays) * 100)}%` : '·'),
              h('td', { class: 'num' }, it?.returnRate != null ? `${it.returnRate}%` : '·'),
              h('td', { class: 'num' }, sp?.plays != null ? sp.plays.toLocaleString('en-GB') : '·'));
          }))) : h('div', { class: 'empty' }, 'Open a published meditation and log its figures on the Performance tab.')),
      h('div', { class: 'card' }, h('h2', {}, 'Plays by format'), playsChart(ov.playsByFormat),
        best.length ? h('p', { class: 'small muted', style: 'margin-top:14px' }, `Make more ${best[0].format}${best[1] ? ` and ${best[1].format}` : ''}. Their tracks average the most plays.`) : '')),
    lengthBandsCard(list),
  );
}

// Insight Timer's length filter has six bands; listeners browse by them, so a full range helps.
function lengthBandsCard(list) {
  const bands = [['0 to 5 min', 0, 5.5], ['6 to 10 min', 5.5, 10.5], ['11 to 15 min', 10.5, 15.5], ['16 to 20 min', 15.5, 20.5], ['21 to 30 min', 20.5, 30.5], ['30 min plus', 30.5, 1e9]];
  const minutesOf = (m) => (m.renders?.recorded?.seconds || m.renders?.clone?.seconds || (m.script ? m.stats.estimatedSeconds : 0)) / 60;
  const made = list.filter((m) => m.script);
  return h('div', { class: 'card section' }, h('h2', {}, 'Your range across the length filter'),
    h('p', { class: 'small muted', style: 'margin-top:0' }, 'Insight Timer listeners filter by these six lengths. Covering every band, with sleep long and daytime around 10 minutes, gives more people a way in.'),
    h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Band'), h('th', { class: 'num' }, 'Your meditations'), h('th', {}, 'Titles'))),
      h('tbody', {}, bands.map(([label, lo, hi]) => {
        const inBand = made.filter((m) => minutesOf(m) >= lo && minutesOf(m) < hi);
        return h('tr', {}, h('td', {}, label), h('td', { class: 'num' }, inBand.length || h('span', { style: 'color:var(--warn)' }, '0')), h('td', { class: 'small muted' }, inBand.map((m) => m.title || 'Untitled').join(', ')));
      }))));
}

// ---------- Settings ----------
async function pageSettings() {
  const [status, { voices, offline }, { beds, presets }] = await Promise.all([api('/api/status'), voicesList(), api('/api/beds')]);
  const s = SETTINGS = await api('/api/settings');
  const anthropic = h('input', { type: 'password', placeholder: status.claude ? `Saved (${status.claude})` : 'sk-ant-…', autocomplete: 'off' });
  const elevenlabs = h('input', { type: 'password', placeholder: status.elevenlabs ? `Saved (${status.elevenlabs})` : 'ElevenLabs API key', autocomplete: 'off' });
  const saveKeys = h('button', { onclick: async () => {
    try {
      await api('/api/keys', { method: 'POST', body: { anthropic: anthropic.value, elevenlabs: elevenlabs.value } });
      toast('Keys saved on this computer');
      refreshSideStatus();
      route();
    } catch (err) { toast(err.message, true); }
  } }, 'Save keys');

  const num = (key, label, step = '1', hint = '') => {
    const el = h('input', { type: 'number', step, value: String(s[key]) });
    el.addEventListener('change', () => save({ [key]: Number(el.value) }));
    return h('div', {}, h('label', {}, label), el, hint ? h('div', { class: 'hint' }, hint) : '');
  };
  const text = (key, label, hint = '') => {
    const el = h('input', { type: 'text', value: s[key] ?? '' });
    el.addEventListener('change', () => save({ [key]: el.value }));
    return h('div', {}, h('label', {}, label), el, hint ? h('div', { class: 'hint' }, hint) : '');
  };
  const sel = (key, label, options, hint = '') => {
    const el = h('select', {}, options.map(([v, l]) => h('option', { value: v, selected: String(s[key]) === String(v) }, l)));
    el.addEventListener('change', () => save({ [key]: el.value === 'true' ? true : el.value === 'false' ? false : el.value }));
    return h('div', {}, h('label', {}, label), el, hint ? h('div', { class: 'hint' }, hint) : '');
  };
  async function save(patch) {
    try {
      SETTINGS = await api('/api/settings', { method: 'PUT', body: patch });
      if ('brandProfiles' in patch) BRANDS = await api('/api/brands');
      toast('Saved');
    } catch (err) { toast(err.message, true); }
  }

  const bedFile = h('input', { type: 'file', accept: 'audio/*' });
  const bedMetaRow = (b) => {
    const title = h('input', { type: 'text', value: b.title });
    const credit = h('input', { type: 'text', value: b.credit });
    const saveMeta = () => api(`/api/beds/${encodeURIComponent(b.name)}`, { method: 'PUT', body: { title: title.value, credit: credit.value } }).then(() => toast('Saved')).catch((err) => toast(err.message, true));
    title.addEventListener('change', saveMeta);
    credit.addEventListener('change', saveMeta);
    return h('div', { class: 'grid g2', style: 'margin-top:8px' }, h('div', {}, h('label', { style: 'margin-top:0' }, 'Title'), title), h('div', {}, h('label', { style: 'margin-top:0' }, 'Credit in descriptions'), credit));
  };
  const bedList = h('div', { class: 'grid' }, beds.length ? beds.map((b) => h('div', { class: 'para bed' },
    h('div', {}, h('div', {}, b.title || b.name, h('span', { class: 'muted small' }, `${b.source === 'elevenlabs-music' ? ' · made with ElevenLabs Music' : ''}${b.bytes == null ? ' · in iCloud' : ` · ${(b.bytes / 1e6).toFixed(1)} MB`}`), s.defaultBed === b.name ? h('span', { class: 'chip gold', style: 'margin-left:8px' }, 'Default') : '', s.bellFile === b.name ? h('span', { class: 'chip gold', style: 'margin-left:8px' }, 'Bell') : ''),
      h('audio', { controls: true, preload: 'none', src: `/api/beds/${encodeURIComponent(b.name)}` }), bedMetaRow(b)),
    h('div', { class: 'actions' },
      h('button', { class: 'ghost small', onclick: () => save({ defaultBed: s.defaultBed === b.name ? null : b.name }).then(route) }, s.defaultBed === b.name ? 'Clear default' : 'Make default'),
      h('button', { class: 'ghost small', onclick: () => save({ bellFile: s.bellFile === b.name ? null : b.name }).then(route) }, s.bellFile === b.name ? 'Use built in bell' : 'Use as bell'),
      h('button', { class: 'danger small', onclick: async () => { if (confirm(`Delete ${b.name}?`)) { await api(`/api/beds/${encodeURIComponent(b.name)}`, { method: 'DELETE' }); route(); } } }, 'Delete')))) : h('div', { class: 'empty' }, 'No beds yet. Upload ambience or music (your Wyth album tracks work well).'));
  const upload = h('button', { class: 'ghost', onclick: async () => {
    if (!bedFile.files[0]) return toast('Choose a file first', true);
    const fd = new FormData();
    fd.append('file', bedFile.files[0]);
    upload.disabled = true;
    try { await api('/api/beds', { method: 'POST', body: fd }); toast('Uploaded'); route(); } catch (err) { toast(err.message, true); } finally { upload.disabled = false; }
  } }, 'Upload');

  const presetSel = h('select', {}, presets.map((p) => h('option', { value: p.id }, `${p.title} · ${p.use}`)));
  const bedMinutes = h('select', {}, [[120, '2 minutes'], [180, '3 minutes'], [240, '4 minutes'], [300, '5 minutes']].map(([v, l]) => h('option', { value: String(v), selected: v === 180 }, l)));
  const presetText = h('p', { class: 'small muted' });
  const showPreset = () => (presetText.textContent = presets.find((p) => p.id === presetSel.value)?.prompt || '');
  presetSel.addEventListener('change', showPreset);
  showPreset();
  const genBox = h('div');
  const genBtn = h('button', { onclick: async () => {
    genBtn.disabled = true;
    const box = jobBox();
    genBox.replaceChildren(box);
    try {
      const { job } = await api('/api/beds/generate', { method: 'POST', body: { preset: presetSel.value, seconds: Number(bedMinutes.value) } });
      const end = await watchJob(job.id, box.update);
      if (end.status === 'done') { toast('New bed added'); route(); } else toast(end.error, true);
    } catch (err) { toast(err.message, true); } finally { genBtn.disabled = false; }
  } }, 'Make this bed');
  const makeBedCard = h('div', { style: 'margin-bottom:16px' }, h('h3', {}, 'Make a calm bed with ElevenLabs Music'),
    h('div', { class: 'grid g2' }, h('div', {}, presetSel), h('div', {}, bedMinutes)), presetText,
    h('div', { class: 'row' }, genBtn, h('span', { class: 'muted small' }, 'Uses ElevenLabs credits (about 2,700 for a 3 minute bed). Instrumental only.')), genBox);

  const logoFile = h('input', { type: 'file', accept: 'image/png' });
  const logoImg = h('img', { src: `/api/brand/logo?t=${Date.now()}`, style: 'max-width:90px;max-height:90px;display:block;margin-bottom:8px', onerror: (e) => (e.target.style.display = 'none') });
  const logoBtn = h('button', { class: 'ghost', onclick: async () => {
    if (!logoFile.files[0]) return toast('Choose a PNG first', true);
    const fd = new FormData();
    fd.append('logo', logoFile.files[0]);
    try { await api('/api/brand/logo', { method: 'POST', body: fd }); toast('Logo saved'); route(); } catch (err) { toast(err.message, true); }
  } }, 'Upload logo');
  const logoCard = h('div', { class: 'card' }, h('h2', {}, 'Logo for trailer cards'), logoImg,
    h('div', { class: 'row' }, logoFile, logoBtn),
    h('div', { class: 'hint' }, 'A PNG with a transparent background. It sits above your name on every trailer card.'));

  const discOn = h('input', { type: 'checkbox', checked: !!s.disclosure?.spotify });
  const discText = h('input', { type: 'text', value: s.disclosure?.text || '' });
  const saveDisc = () => save({ disclosure: { spotify: discOn.checked, text: discText.value } });
  discOn.addEventListener('change', saveDisc);
  discText.addEventListener('change', saveDisc);

  const stopBtn = h('button', { class: 'ghost', onclick: async () => {
    if (!confirm('Stop Meditation Studio on this Mac? Open it again from Applications or the Dock.')) return;
    await api('/api/shutdown', { method: 'POST' }).catch(() => {});
    document.body.replaceChildren(h('main', {}, h('h1', {}, 'Studio stopped'), h('p', { class: 'lede' }, 'Open Meditation Studio from Applications or the Dock to start it again.')));
  } }, 'Stop the studio on this Mac');
  const libraryCard = h('div', { class: 'card' }, h('h2', {}, 'This Mac and the library'),
    h('div', { class: 'kv' },
      h('div', {}, 'This Mac'), h('div', {}, status.thisMac),
      h('div', {}, 'Library'), h('div', { style: 'word-break:break-word' }, String(status.library).replace(/^.*\/Mobile Documents\/com~apple~CloudDocs\//, 'iCloud Drive › ').replace(/^\/Users\/[^/]+\//, 'Home › ')),
      h('div', {}, 'Shared'), h('div', {}, status.sharedLibrary ? 'Yes, through iCloud Drive. Your other Mac sees the same meditations, recordings and mixes.' : 'No. Run the Mac installer to keep the library in iCloud Drive.'),
      h('div', {}, 'Also open on'), h('div', {}, status.otherMacs?.length ? status.otherMacs.join(', ') : 'No other Mac right now')),
    h('div', { class: 'hint', style: 'margin-top:10px' }, 'Keys are kept on each Mac separately. In Finder, right click the Meditation Studio folder in iCloud Drive and choose Keep Downloaded, so audio is always to hand.'),
    h('div', { class: 'row', style: 'margin-top:14px' }, stopBtn));

  $app.replaceChildren(
    h('h1', {}, 'Settings'),
    h('p', { class: 'lede' }, 'Everything is stored on this computer. Keys are written to the .env file and never shown again.'),
    h('div', { class: 'grid g2' },
      h('div', { class: 'card' }, h('h2', {}, 'Keys'),
        h('label', {}, 'Claude API key'), anthropic, h('div', { class: 'hint' }, 'From platform.claude.com. Writes the scripts and runs the trend scan.'),
        h('label', {}, 'ElevenLabs API key'), elevenlabs, h('div', { class: 'hint' }, 'From elevenlabs.io, Settings, API keys. Needs text to speech, voices and user read access.'),
        h('div', { class: 'row', style: 'margin-top:14px' }, saveKeys),
        h('div', { class: 'hint', style: 'margin-top:12px' }, `Audio engine: ${status.ffmpeg.ok ? status.ffmpeg.version.split(' Copyright')[0] : status.ffmpeg.error}`)),
      h('div', { class: 'card' }, h('h2', {}, 'Voice'),
        sel('voiceId', 'Default voice', voices.map((v) => [v.voice_id, v.name.trim()]), offline ? 'Add your ElevenLabs key to list every voice in your account.' : 'Julian voices are listed first.'),
        sel('ttsModel', 'Model', [['eleven_v4', 'eleven_v4'], ['eleven_v3', 'eleven_v3']]),
        text('deliveryPrefix', 'Delivery tags before each paragraph', 'For example [softly] or [softly] [warmly]. Leave empty for none.'),
        sel('outputFormat', 'ElevenLabs output', [['mp3_44100_128', 'MP3 44.1 kHz 128 kbps (every plan)'], ['mp3_44100_192', 'MP3 44.1 kHz 192 kbps (Creator plan and above)']]),
        num('wordsPerMinute', 'Speaking pace (words per minute)', '1', 'Learned from each render. Used for length estimates.')),
      h('div', { class: 'card' }, h('h2', {}, 'Pacing and mix'),
        h('div', { class: 'grid g2' },
          num('paragraphGapSeconds', 'Gap between paragraphs (s)', '0.1'), num('preRollSeconds', 'Lead in before the voice (s)', '0.5'),
          num('tailSeconds', 'Quiet after the bell (s)', '1'), num('sleepTailSeconds', 'Quiet tail on sleep tracks (s)', '5'),
          num('bedVolumeDb', 'Default bed level (dB)', '1'), num('loudnessTarget', 'Loudness target (LUFS)', '0.5', '-16 suits Insight Timer and Spotify.'),
          num('truePeak', 'True peak ceiling (dBTP)', '0.1'), sel('mp3Bitrate', 'MP3 bitrate', [['192k', '192 kbps'], ['256k', '256 kbps'], ['320k', '320 kbps']], '192 kbps or more for Insight Timer courses.')),
        sel('bell', 'Ending bell on non sleep tracks', [['true', 'On'], ['false', 'Off']], 'Insight Timer does not add a bell, so it recommends teachers include their own. Never on sleep tracks.')),
      h('div', { class: 'card' }, h('h2', {}, 'Music beds and bell'), makeBedCard, h('h3', {}, 'Or upload your own'), h('div', { class: 'row' }, bedFile, upload), h('div', { style: 'margin-top:12px' }, bedList)),
      h('div', { class: 'card' }, h('h2', {}, 'Style'),
        text('cardName', 'Name on trailer cards'),
        sel('brandProfiles', 'Brand profiles', [['false', 'Off: plain meditations'], ['true', 'On: Living Awake and The Living Connection rules']], 'Off by default. When on, Create offers your Living Awake and The Living Connection profiles from your saved skills: pillars, sign-offs and their word lists.')),
      h('div', { class: 'card' }, h('h2', {}, 'Claude'),
        sel('claudeModel', 'Model', [['claude-opus-5-5', 'Claude Opus 5.5'], ['claude-fable-5-1', 'Claude Fable 5.1 (most capable, costs more)']]),
        sel('claudeEffort', 'Effort', [['medium', 'Medium'], ['high', 'High'], ['xhigh', 'Extra high']], 'High suits creative one shots.'),
        sel('useFallbacks', 'Fallback if a request is declined', [['true', 'On'], ['false', 'Off']], 'Lets Claude re-run a declined request on another model.'),
        num('weeklyTarget', 'Meditations a week', '1')),
      h('div', { class: 'card' }, h('h2', {}, 'Voice clone disclosure'),
        h('label', { style: 'display:flex;gap:10px;align-items:center' }, discOn, 'Add this line to Spotify descriptions when the clone voices the track'), discText,
        h('div', { class: 'hint' }, 'Your call: the brand wall keeps AI out of Side A copy, while Spotify labels AI content and asks music releases to declare it in AI credits. Insight Timer does not accept clones at all.')),
      libraryCard,
      logoCard),
  );
}

boot();
