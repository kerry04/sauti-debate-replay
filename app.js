/* Sauti viewer. Reads data/comparison.json and nothing else (or window.SAUTI_DATA when
   the single-file preview inlines it). Every number on the page comes from that file or is
   simple arithmetic on it (a difference between two runs). Where a value is missing, the page
   says so. No timers, no simulated activity. */
(async () => {
  'use strict';
  const CFG = window.SAUTI_CONFIG || {};
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const has = v => v !== undefined && v !== null;

  let D = window.SAUTI_DATA || null;
  if (!D) {
    try {
      const res = await fetch('data/comparison.json', {cache: 'no-store'});
      if (!res.ok) throw new Error('HTTP ' + res.status);
      D = await res.json();
    } catch (e) {
      $('#loading').textContent = 'Could not load data/comparison.json. Nothing is shown without it.';
      $('#loading').classList.add('err');
      return;
    }
  }
  $('#loading').remove();

  // ---------- labels (no results) ----------
  const STANCES = ['YES', 'NO', 'CONDITIONAL', 'OPEN'];
  const MAJ = ['YES', 'CONDITIONAL', 'MIXED', 'OPEN', 'NO'];
  const SCOL = {YES: 'var(--yes)', NO: 'var(--no)', CONDITIONAL: 'var(--cond)', OPEN: 'var(--open)', MIXED: 'var(--mixed)'};
  const FCOL = {A: 'var(--fA)', B: 'var(--fB)', C: 'var(--fC)', D: 'var(--fD)', E: 'var(--fE)'};
  const NM = 'not measured yet';
  const NF = 'not in the data file';
  const ICON = {
    actor: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z"/></svg>',
    media: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h13v16H6a2 2 0 0 1-2-2zm15 4h1a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2zM7 7v4h7V7zm0 6v1.5h7V13zm0 3v1.5h7V16z"/></svg>'
  };

  // ---------- cast ----------
  const prettify = id => String(id).replace(/_\d+$/, '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const CAST = new Map((D.cast || []).map(c => [c.id, c]));
  if (!CAST.size) {
    (D.runs || []).forEach(r => (r.agents || []).forEach(a => {
      if (CAST.has(a.agent)) return;
      const bio = a.bio || '', rl = (a.role_label || '').toLowerCase();
      const role = /voter/.test(rl) || /^ordinary voter/i.test(bio) ? 'voter' : /media|newsroom/.test(rl) || /^media house/i.test(bio) ? 'media' : /actor/.test(rl) || /^named public actor/i.test(bio) ? 'actor' : 'other';
      const e = {id: a.agent, name: (bio.match(/^Named public actor: ([^.]+)\./) || [])[1] || prettify(a.agent), role};
      const f = bio.match(/Faction ([A-E]) — ([^.]+)\.\s*(Gen Z|Young adult|Older)\.\s*([^.]+)\./);
      if (f) Object.assign(e, {faction: f[1], faction_label: f[2].trim(), age: f[3], place: f[4].trim()});
      CAST.set(a.agent, e);
    }));
  }
  const agentOf = id => CAST.get(id) || {id, name: prettify(id), role: 'other'};
  const nameOf = id => { const a = agentOf(id); return CFG.roleLabels && a.public_label ? a.public_label : a.name; };
  const tagOf = id => {
    const a = agentOf(id);
    if (a.role === 'voter') return `Voter${a.faction ? ' · Faction ' + a.faction : ''}${a.age ? ' · ' + a.age : ''}`;
    if (a.role === 'actor') return CFG.roleLabels ? 'Political role' : 'Political actor';
    if (a.role === 'media') return 'Newsroom';
    if (a.role === 'amplifier') return 'Amplifier, counted apart';
    return 'Agent';
  };
  const colorOf = id => { const a = agentOf(id); return a.role === 'voter' ? (FCOL[a.faction] || 'var(--fg-2)') : a.role === 'media' ? '#C9C8E0' : 'var(--brand-3)'; };
  const initials = n => n.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const avatar = (id, size, ring) => {
    const a = agentOf(id), c = size ? ' ' + size : '', rs = ring ? ` ring" style="--rc:${SCOL[ring] || 'transparent'}` : '';
    if (a.role === 'voter') return `<div class="av voter${c}${ring ? ' ring' : ''}" style="background:${FCOL[a.faction] || '#999'}${ring ? ';--rc:' + (SCOL[ring] || 'transparent') : ''}" aria-hidden="true">${esc(initials(a.name))}</div>`;
    if (a.role === 'media') return `<div class="av media${c}${rs}">${ICON.media}</div>`;
    return `<div class="av ${a.role === 'actor' ? 'actor' : 'other'}${c}${rs}">${ICON.actor}</div>`;
  };
  const chip = (s, n) => `<span class="st-chip ${esc(s)}">${esc(s)}${has(n) ? ` <span class="num">${n}</span>` : ''}</span>`;
  const textOf = p => {
    const a = agentOf(p.author);
    let t = p.text || '';
    if (CFG.roleLabels && a.public_label && a.self_names) {
      for (const n of a.self_names) t = t.replace(new RegExp('\\b' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g'), a.public_label);
    }
    return t;
  };

  // ---------- runs ----------
  const RUNS = D.runs || [];
  const addedSeeds = (D.seed_added || []).map(s => s.content.trim());
  const isWhatIf = r => (r.seeds || []).some(s => addedSeeds.includes(s.content.trim()));
  const STAB = RUNS.filter(r => !isWhatIf(r));
  const WHATIF = RUNS.filter(isWhatIf);
  const BASE = STAB[0];  // the what-if movement is measured against run 1
  const runLabel = r => r ? (r.title || (isWhatIf(r) ? 'What-if' + (WHATIF.length > 1 ? ' ' + (WHATIF.indexOf(r) + 1) : '') : 'Run ' + (STAB.indexOf(r) + 1))) : '';
  const runById = id => RUNS.find(r => r.run === id);
  const runtimeTxt = r => has(r.runtime_s) ? `${(r.runtime_s / 60).toFixed(1)} min` : 'runtime not recorded';
  const dateTxt = r => has(r.date) ? r.date : has(r.ended_at) ? `ended ${String(r.ended_at).slice(0, 16).replace('T', ' ')}` : 'date ' + NF;
  const metaHTML = r => `<b>${esc(r.run)}</b> · ${esc(r.model_logged || D.model || 'model ' + NF)}<br>${esc(dateTxt(r))} · ${esc(runtimeTxt(r))} · ${has(r.n_action_posts) ? `<b>${r.n_action_posts}</b> posts labelled` : 'posts ' + NM} · ${has(r.n_agents_active) ? `<b>${r.n_agents_active}</b> agents active` : 'active agents ' + NM}`;

  // Posts and agents in readout.py's shape (post_id, agent, step, content, quote_content,
  // majority_stance, stance_counts) or enrich.py's (id, author, round, text, quote_of, majority).
  RUNS.forEach(r => {
    if (Array.isArray(r.posts)) {
      const posts = r.posts.map(p => {
        if ('post_id' in p || 'agent' in p) {
          const q = has(p.quote_content) && String(p.quote_content).trim() !== '';
          return {id: p.post_id, author: p.agent, kind: q ? 'quote' : 'post', text: q ? p.quote_content : (p.content || ''), quotedText: q ? (p.content || '') : null,
            round: p.step, stance: p.stance || null, arguments: p.arguments || [], likes: p.likes, shares: p.shares};
        }
        return Object.assign({}, p);
      });
      const byText = new Map();
      (r.seeds || []).forEach(sd => byText.set(sd.content.trim(), {author: sd.poster, seed: true}));
      posts.forEach(p => { if (p.kind !== 'seed' && p.text && !byText.has(p.text.trim())) byText.set(p.text.trim(), {author: p.author, id: p.id}); });
      const byId = new Map(posts.map(p => [p.id, p]));
      posts.forEach(p => {
        if (p.kind === 'quote' && has(p.quotedText)) {
          const m = byText.get(p.quotedText.trim());
          p.quoted = {text: p.quotedText, author: m ? m.author : null, seed: !!(m && m.seed)};
        } else if (p.kind !== 'post' && p.kind !== 'seed' && has(p.quote_of)) {
          const t = byId.get(p.quote_of);
          p.quoted = t ? {text: t.text, author: t.author, seed: t.kind === 'seed'} : {text: null, author: null};
        }
      });
      r._posts = posts;
    }
    if (Array.isArray(r.agents)) {
      r._agents = new Map(r.agents.map(a => [a.agent, {agent: a.agent, majority: a.majority_stance || a.majority,
        stances: a.stance_counts || a.stances || {}, role_label: a.role_label, synthetic: a.synthetic, bio: a.bio}]));
    }
  });
  const majorityOf = (r, id) => !r._agents ? null : (r._agents.get(id) || {majority: 'DID_NOT_ACT'}).majority;
  const roleLabelOf = id => { for (const r of RUNS) { const a = r._agents && r._agents.get(id); if (a && a.role_label) return a.role_label; } return null; };

  // ---------- header ----------
  $('#question').textContent = D.question || '';
  $('#creditmodel').textContent = D.model || NF;
  $('#bannerdetail').textContent = 'Every post was written by an AI agent and every post and agent is marked SYNTHETIC. Voter names are invented. ' +
    (CFG.roleLabels ? 'Public figures and newsrooms appear as roles. ' : 'Public figures and newsrooms are simulated voices, not their real posts. ') +
    'Sauti never sets a price, resolves a market, or moves money.';
  $('#samplebanner').hidden = D.sample !== true;
  $('#facts').innerHTML = [
    D.model ? `<span class="fact">Model <b>${esc(D.model)}</b></span>` : '',
    STAB.length ? `<span class="fact"><b>${STAB.length}</b> stability runs</span>` : '',
    WHATIF.length ? `<span class="fact hyp"><b>${WHATIF.length}</b> what-if run · hypothetical</span>` : '',
    CAST.size ? `<span class="fact"><b>${CAST.size}</b> synthetic agents</span>` : ''
  ].join('');
  if (Array.isArray(D.enrichment_notes) && D.enrichment_notes.length) {
    $('#datanotes').hidden = false;
    $('#datanotes').innerHTML = `<h2>Notes on this data file</h2><ul>${D.enrichment_notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`;
  }

  // ---------- building blocks ----------
  function overlapBars(r) {
    const o = r.distinct_agents_overlapping;
    if (!o) return `<div class="nm">Distinct-agent counts: <b>${NM}</b></div>`;
    const n = r.n_agents_active || Math.max(...Object.values(o), 1);
    return STANCES.map(s => {
      const v = o[s] || 0;
      return `<div class="lrow"><span class="lb">${s}</span><div class="track" role="img" aria-label="${s}: ${v} of ${n} agents"><i style="width:${(v / n * 100).toFixed(1)}%;background:${SCOL[s]}"></i></div><span class="nums"><b>${v}</b> of ${n}</span></div>`;
    }).join('');
  }
  function stackBar(r) {
    const m = r && r.distinct_agents_majority;
    if (!m) return `<div class="nm">Majority stance: <b>${NM}</b></div>`;
    const tot = MAJ.reduce((s, k) => s + (m[k] || 0), 0) || 1;
    return `<div class="stack" role="img" aria-label="${MAJ.filter(k => m[k]).map(k => `${k} ${m[k]}`).join(', ')}">${MAJ.filter(k => m[k]).map(k => `<i class="${k}" style="flex:${m[k]} 1 0;background:${SCOL[k]}" title="${k}: ${m[k]} agents">${m[k] / tot >= 0.08 ? m[k] : ''}</i>`).join('')}</div>`;
  }
  const stackLegend = () => `<div class="slegend">${MAJ.map(k => `<span><i class="sw" style="background:${SCOL[k]}"></i>${k}</span>`).join('')}</div>`;
  function majChips(r) {
    const m = r.distinct_agents_majority;
    return m ? `<div class="cnt">${MAJ.filter(s => has(m[s])).map(s => chip(s, m[s])).join('')}</div>` : `<div class="nm">${NM}</div>`;
  }
  function argsList(r, limit) {
    const list = r.top_arguments;
    if (!list || !list.length) return `<div class="nm">Arguments: <b>${NM}</b></div>`;
    const all = new Set(D.arguments_in_all_runs || []);
    const max = Math.max(...list.map(a => a.posts || 0), 1);
    const row = a => `<div class="arow"><span class="an">${all.has(a.argument) ? '<i class="dot-all" title="Argued in every stability run"></i>' : ''}<span>${esc(a.argument)}</span></span><span><i class="ab2" style="width:${((a.posts || 0) / max * 100).toFixed(1)}%"></i></span><span class="ac">${a.posts} posts${has(a.agents) ? ` · ${a.agents} agents` : ''}</span></div>`;
    const head = list.slice(0, limit).map(row).join('');
    const rest = list.slice(limit);
    return head + (rest.length ? `<details class="more"><summary>Show all ${list.length} arguments</summary>${rest.map(row).join('')}</details>` : '') +
      (all.size ? `<div class="raw"><i class="dot-all"></i> argued in every stability run</div>` : '');
  }
  function spreadViz() {
    const sp = D.spread_majority;
    if (!sp || !STAB.length) return `<div class="nm">Spread across runs: <b>${NM}</b></div>`;
    const scale = Math.max(...STAB.map(r => r.n_agents_active || 0), ...Object.values(sp).map(x => x.max || 0), 1);
    return MAJ.filter(s => sp[s]).map(s => {
      const {min, max} = sp[s];
      const pts = STAB.map(r => (r.distinct_agents_majority || {})[s]).filter(has);
      return `<div class="srow"><span class="lb">${s}</span><div class="scale" role="img" aria-label="${s}: ${min} to ${max} agents across the stability runs"><i class="base"></i><i class="rng" style="left:${(min / scale * 100).toFixed(1)}%;width:${Math.max((max - min) / scale * 100, 1).toFixed(1)}%;background:${SCOL[s]}"></i>${pts.map(v => `<i class="pt" style="left:${(v / scale * 100).toFixed(1)}%;background:${SCOL[s]}"></i>`).join('')}</div><span class="rv"><b>${min}–${max}</b></span></div>`;
    }).join('') + `<div class="axis"><span>0</span><span>${scale} agents</span></div>`;
  }
  const person = (id, extra) => `<span class="who">${avatar(id, 'sm')}<span>${esc(nameOf(id))}<small>SYNTHETIC · ${esc(tagOf(id))}</small></span></span>${extra || ''}`;

  function seedDiff() {
    if (!D.seed_changed) return '';
    const card = (s, add) => `<div class="dcard${add ? ' add' : ''}"><div class="dl">${avatar(s.poster, 'xs')}<b>${esc(nameOf(s.poster))}</b>${add ? '<span class="hypo">Hypothetical scenario, not news</span>' : `<span>Real briefing post in ${esc(runLabel(BASE) || 'the baseline')}</span>`}</div>${esc(s.content)}</div>`;
    return `<div class="sechead"><div><h2>The one fact that changed</h2><p>Every other briefing post is identical. Only this one was swapped.</p></div></div><div class="diff">${(D.seed_removed || []).map(s => card(s, false)).join('')}${(D.seed_added || []).map(s => card(s, true)).join('')}</div>`;
  }
  function movement() {
    if (!D.movement_available) return `<div class="nm" style="margin-top:14px">Movement between ${esc(runLabel(BASE))} and the what-if: <b>${NM}</b></div>`;
    const moved = D.agents_moved || [];
    const flows = new Map();
    moved.forEach(m => flows.set(`${m.from}→${m.to}`, (flows.get(`${m.from}→${m.to}`) || 0) + 1));
    const flowHTML = [...flows.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => { const [f, t] = k.split('→'); return `<span class="flow">${chip(f)}<span class="arrow">→</span>${chip(t)}<b>×${n}</b></span>`; }).join('');
    const names = ids => ids.length ? ids.map(id => `<button class="mrow" data-agent="${esc(id)}">${person(id)}</button>`).join('') : `<div class="muted" style="font-size:13px;padding:6px">None</div>`;
    const tags = (arr, cls) => arr.length ? arr.map(a => `<span class="tag ${cls}">${esc(a)}</span>`).join('') : '<span class="muted" style="font-size:13px">None</span>';
    return `<div class="sechead"><div><h2>What moved</h2><p>Majority stance per agent, ${esc(runLabel(BASE))} (baseline) → what-if. Tap anyone to read their posts.</p></div></div>
      <div class="mgrid">
        <div class="card"><h3 class="h3">${moved.length} agents changed their majority stance</h3><div class="flows" style="margin-top:10px">${flowHTML}</div>
          ${moved.map(m => `<button class="mrow" data-agent="${esc(m.agent)}">${person(m.agent, `${chip(m.from)}<span class="arrow">→</span>${chip(m.to)}`)}</button>`).join('')}</div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div class="card"><h3 class="h3">Went quiet in the what-if</h3>${names(D.agents_went_quiet || [])}</div>
          <div class="card"><h3 class="h3">Spoke only in the what-if</h3>${names(D.agents_appeared || [])}</div>
        </div>
      </div>
      <div class="pair" style="margin-top:14px">
        <div class="card"><h3 class="h3">Arguments that disappeared</h3><div style="margin-top:8px">${tags(D.arguments_disappeared || [], 'gone')}</div></div>
        <div class="card"><h3 class="h3">Arguments that appeared</h3><div style="margin-top:8px">${tags(D.arguments_appeared || [], 'new')}</div></div>
      </div>`;
  }

  // ---------- compare: feature cards ----------
  $('#stability').innerHTML = `<div class="fh"><div><div class="kick">Stability</div><h2>Same question, ${STAB.length} independent runs</h2><p>Majority stance per agent in each stability run. Each dot is one run; the band is the range. The what-if run is not included.</p></div></div>
    <div style="margin-top:14px">${spreadViz()}</div>
    <div class="sub">Argued in every stability run</div>
    <div>${(D.arguments_in_all_runs || []).length ? D.arguments_in_all_runs.map(a => `<span class="tag all">${esc(a)}</span>`).join('') : `<span class="muted">${NM}</span>`}</div>`;

  const wi = WHATIF[0];
  if (wi && BASE) {
    const dm = (r, k) => ((r.distinct_agents_majority || {})[k] || 0);
    const deltas = MAJ.filter(k => has((BASE.distinct_agents_majority || {})[k]) || has((wi.distinct_agents_majority || {})[k])).map(k => {
      const a = dm(BASE, k), b = dm(wi, k), d = b - a;
      return `<div class="delta">${chip(k)}<span class="muted num">${a} → ${b}</span><span class="dv ${d > 0 ? 'up' : d < 0 ? 'down' : 'same'}">${d > 0 ? '+' + d : d}</span></div>`;
    }).join('');
    const seedLine = (D.seed_added || [])[0];
    $('#whatifcard').innerHTML = `<div class="fh"><div><div class="kick" style="color:var(--amber)">What-if · hypothetical</div><h2>One briefing post changed</h2><p>${seedLine ? `<span class="hypo">Hypothetical scenario, not news</span> ${esc(seedLine.content)}` : ''}</p></div></div>
      <div style="margin-top:16px">
        <div class="cmprow"><span class="rl">${esc(runLabel(BASE))}<small>baseline</small></span>${stackBar(BASE)}</div>
        <div class="cmprow"><span class="rl">What-if<small>hypothetical</small></span>${stackBar(wi)}</div>
        ${stackLegend()}
      </div>
      <div class="deltas">${deltas}</div>
      <div style="margin-top:14px;display:flex;gap:16px;flex-wrap:wrap"><button class="linkbtn" data-flip="whatif">See who moved →</button><button class="linkbtn" data-openrun="${esc(wi.run)}">Read the what-if posts →</button></div>`;
  } else {
    $('#whatifcard').innerHTML = `<div class="kick">What-if</div><div class="nm" style="margin-top:12px">What-if run: <b>${NM}</b></div>`;
  }

  // ---------- compare: explorer ----------
  const opts = RUNS.map(r => `<option value="${esc(r.run)}">${esc(runLabel(r))}${isWhatIf(r) ? ' · hypothetical' : ''} · ${esc(r.run)}</option>`).join('');
  $('#selA').innerHTML = opts; $('#selB').innerHTML = opts;
  let lastStableB = STAB[1] || STAB[0];
  function panelHTML(r, side) {
    if (!r) return `<div class="nm">${NM}</div>`;
    const w = isWhatIf(r);
    return `<div class="ph"><h3><span class="ab ${side}">${side.toUpperCase()}</span>${esc(runLabel(r))}</h3>${w ? '<span class="hypo">Hypothetical scenario</span>' : `<span class="kick">${r === BASE ? 'Stability run · baseline' : 'Stability run'}</span>`}</div>
      <div class="meta">${metaHTML(r)}</div>
      <div class="sub">Agents who posted each stance at least once</div>${overlapBars(r)}
      <div class="sub">Majority stance, one per agent</div>${stackBar(r)}<div style="margin-top:8px">${majChips(r)}</div>
      ${r.raw_counts ? `<div class="raw">Raw post counts, not used for the bars: ${STANCES.filter(s => has(r.raw_counts[s])).map(s => `${s} <b class="num">${r.raw_counts[s]}</b>`).join(' · ')}</div>` : ''}
      <div class="sub">Top arguments</div>${argsList(r, 5)}
      <div style="margin-top:12px"><button class="linkbtn" data-openrun="${esc(r.run)}">Read this run's posts →</button></div>`;
  }
  function renderCompare() {
    const a = runById($('#selA').value), b = runById($('#selB').value);
    $('#panelA').innerHTML = panelHTML(a, 'a'); $('#panelB').innerHTML = panelHTML(b, 'b');
    $('#panelA').classList.toggle('wi', !!a && isWhatIf(a));
    $('#panelB').classList.toggle('wi', !!b && isWhatIf(b));
    const inView = (a && isWhatIf(a)) || (b && isWhatIf(b));
    $$('#cmpmode button').forEach(x => x.setAttribute('aria-pressed', x.dataset.mode === (inView ? 'whatif' : 'stability')));
    $('#cmpextra').innerHTML = inView ? seedDiff() + movement() : '';
  }
  function setPair(a, b) { if (a) $('#selA').value = a.run; if (b) $('#selB').value = b.run; renderCompare(); }
  function flip(mode) {
    if (mode === 'whatif') {
      if (!WHATIF.length) { $('#cmpextra').innerHTML = `<div class="nm">What-if run: <b>${NM}</b></div>`; return; }
      const b = runById($('#selB').value);
      if (b && !isWhatIf(b)) lastStableB = b;
      setPair(BASE, WHATIF[0]);
    } else {
      const a = runById($('#selA').value);
      const A = a && !isWhatIf(a) ? a : BASE;
      setPair(A, lastStableB && lastStableB !== A ? lastStableB : STAB.find(r => r !== A));
    }
  }
  $('#cmpmode').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) flip(b.dataset.mode); });
  $('#selA').addEventListener('change', renderCompare);
  $('#selB').addEventListener('change', renderCompare);
  setPair(STAB[0] || RUNS[0], STAB[1] || RUNS[1] || RUNS[0]);

  // ---------- run choice for Debate and Cast ----------
  let cur = STAB[0] || RUNS[0];
  const runButtons = () => RUNS.map(r => `<button data-run="${esc(r.run)}" aria-pressed="${r === cur}">${esc(runLabel(r))}${isWhatIf(r) ? ' · hypothetical' : ''}</button>`).join('');
  function selectRun(id) {
    cur = runById(id) || cur;
    $('#runseg').innerHTML = runButtons(); $('#castrun').innerHTML = runButtons();
    renderDebate(); renderCast();
  }
  $('#runseg').addEventListener('click', e => { const b = e.target.closest('[data-run]'); if (b) selectRun(b.dataset.run); });
  $('#castrun').addEventListener('click', e => { const b = e.target.closest('[data-run]'); if (b) selectRun(b.dataset.run); });

  // ---------- debate ----------
  let stanceFilter = null;
  const quotedHTML = p => {
    const q = p.quoted;
    if (!q) return '';
    if (!has(q.text)) return `<div class="rq"><span>The quoted post is not in the data file</span></div>`;
    const hyp = q.seed && addedSeeds.includes(String(q.text).trim());
    const who = q.author ? `${esc(nameOf(q.author))}${q.seed ? ' <span class="muted" style="font-weight:400">· briefing post</span>' : ''}${hyp ? ' <span class="hypo">Hypothetical scenario, not news</span>' : ''}` : 'Earlier post';
    return `<div class="rq" style="border-left-color:${q.author ? colorOf(q.author) : 'var(--brand-2)'}"><b style="color:${q.author ? colorOf(q.author) : 'var(--fg)'}">${who}</b><span>${esc(q.author ? textOf({author: q.author, text: q.text}) : q.text)}</span></div>`;
  };
  const engageHTML = p => {
    const bits = [];
    if (p.likes) bits.push(`${p.likes} like${p.likes === 1 ? '' : 's'}`);
    if (p.shares) bits.push(`${p.shares} share${p.shares === 1 ? '' : 's'}`);
    return bits.length ? `<span class="muted" style="font-size:11.5px">${bits.join(' · ')}</span>` : '';
  };
  function renderDebate() {
    const w = isWhatIf(cur);
    $('#roomtitle').textContent = `${runLabel(cur)}${w ? ' · hypothetical scenario' : ''}`;
    $('#roomsub').textContent = `${cur.run} · ${dateTxt(cur)} · ${has(cur.n_action_posts) ? cur.n_action_posts + ' posts' : 'posts ' + NM} · ${has(cur.n_agents_active) ? cur.n_agents_active + ' agents active' : ''}`;
    const counts = new Map();
    (cur._posts || []).forEach(p => p.kind !== 'seed' && counts.set(p.author, (counts.get(p.author) || 0) + 1));
    $('#roomstack').innerHTML = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => avatar(id, 'sm')).join('');

    const added = new Set(addedSeeds);
    const hasHyp = (cur.seeds || []).some(s => added.has(s.content.trim()));
    $('#briefing').innerHTML = (cur.seeds && cur.seeds.length) ? `<details class="seedbox"${hasHyp ? ' open' : ''}><summary><span class="kick">Briefing posts</span><span class="muted" style="font-size:12.5px">${cur.seeds.length}, written by the operator from real news, not labelled${hasHyp ? ' · includes a hypothetical scenario' : ''}</span></summary>${cur.seeds.map(s => {
      const hyp = added.has(s.content.trim());
      return `<div class="seed"><div class="sh">${avatar(s.poster, 'xs')}<b>${esc(nameOf(s.poster))}</b><span class="syn">SYNTHETIC</span><span class="muted" style="font-size:12px">${esc(tagOf(s.poster))}</span>${hyp ? '<span class="hypo">Hypothetical scenario, not news</span>' : ''}</div><p>${esc(s.content)}</p></div>`;
    }).join('')}</details>` : `<div class="nm">Briefing posts: <b>${NM}</b></div>`;

    if (!cur._posts) {
      $('#stancefilter').innerHTML = '';
      $('#feed').innerHTML = `<div class="nm" style="margin-top:12px">Post feed for ${esc(runLabel(cur))}: <b>${NM}</b>.</div>`;
      return;
    }
    const posts = cur._posts.filter(p => p.kind !== 'seed');
    const present = STANCES.filter(s => posts.some(p => p.stance === s));
    const cnt = s => posts.filter(p => p.stance === s).length;
    $('#stancefilter').innerHTML = [`<button class="chip" data-st="" aria-pressed="${!stanceFilter}">All <span class="muted num">${posts.length}</span></button>`, ...present.map(s => `<button class="chip" data-st="${s}" aria-pressed="${stanceFilter === s}"><i class="dot" style="background:${SCOL[s]}"></i>${s} <span class="muted num">${cnt(s)}</span></button>`)].join('');
    const shown = posts.filter(p => !stanceFilter || p.stance === stanceFilter);
    let lastRound = null, lastAuthor = null;
    $('#feed').innerHTML = shown.length ? shown.map(p => {
      let sep = '';
      if (has(p.round) && p.round !== lastRound) { sep = `<div class="round">Round ${esc(p.round)}</div>`; lastRound = p.round; lastAuthor = null; }
      const cont = lastAuthor === p.author; lastAuthor = p.author;
      const body = p.kind === 'repost' ? `<div class="muted" style="font-size:12px;font-style:italic;margin-bottom:4px">Reposted</div>${quotedHTML(p)}` : `${p.kind === 'quote' ? quotedHTML(p) : ''}<div class="bt">${esc(textOf(p))}</div>`;
      const st = p.kind === 'repost' ? '' : (p.stance ? chip(p.stance) : '<span class="st-chip NONE">unlabelled</span>');
      const args = (p.arguments || []).map(a => `<span class="tag">${esc(a)}</span>`).join('');
      const head = cont ? '' : `<div class="snd" style="color:${colorOf(p.author)}"><button data-agent="${esc(p.author)}">${esc(nameOf(p.author))}</button><small>${esc(tagOf(p.author))}</small></div>`;
      return `${sep}<div class="msg${cont ? ' cont' : ''}"><div class="mav">${cont ? '' : `<button data-agent="${esc(p.author)}" aria-label="About ${esc(nameOf(p.author))}">${avatar(p.author)}</button>`}</div><div class="bcol"><div class="bub">${head}${body}<div class="bf"><span class="syn">SYNTHETIC</span>${st}${args}${engageHTML(p)}<span class="rd">post ${esc(p.id)}</span></div></div></div></div>`;
    }).join('') : `<div class="nm" style="margin-top:12px">No posts with this stance in this run.</div>`;
  }
  $('#stancefilter').addEventListener('click', e => { const b = e.target.closest('[data-st]'); if (!b) return; stanceFilter = b.dataset.st || null; renderDebate(); });

  // ---------- cast ----------
  function personBtn(id) {
    const m = majorityOf(cur, id);
    const right = m === null ? '' : m === 'DID_NOT_ACT' ? '<span class="st-chip NONE">did not act</span>' : chip(m);
    return `<button class="person${m === 'DID_NOT_ACT' ? ' quiet' : ''}" data-agent="${esc(id)}">${avatar(id, 'sm', m && m !== 'DID_NOT_ACT' ? m : null)}<span class="pt"><span class="pn">${esc(nameOf(id))}</span><span class="pr"><span class="syn">SYNTHETIC</span>${esc(tagOf(id).replace(/^Voter · Faction [A-E] · /, ''))}</span></span>${right}</button>`;
  }
  function renderCast() {
    const cast = [...CAST.values()];
    const by = role => cast.filter(c => c.role === role);
    const voters = by('voter');
    const counts = ['voter', 'actor', 'media', 'amplifier'].map(r => [r, by(r).length]).filter(x => x[1]);
    const word = {voter: 'invented voters', actor: CFG.roleLabels ? 'political roles' : 'political actors', media: 'newsrooms', amplifier: 'amplifiers (counted apart)'};
    const acted = cur._agents ? cast.filter(c => cur._agents.has(c.id)).length : null;
    $('#castlead').textContent = `${cast.length} synthetic agents: ${counts.map(([r, n]) => `${n} ${word[r]}`).join(', ')}. ` +
      (acted === null ? `Per-agent stances for ${runLabel(cur)}: ${NM}.` : `${acted} acted in ${runLabel(cur)}. The ring and chip show each agent's majority stance there. Tap anyone for their posts.`);
    $('#castlegend').innerHTML = MAJ.map(k => `<span><i class="sw" style="background:${SCOL[k]}"></i>${k}</span>`).join('') + '<span><span class="st-chip NONE">did not act</span></span>';
    const factions = [...new Set(voters.map(v => v.faction).filter(Boolean))].sort();
    const ages = ['Gen Z', 'Young adult', 'Older'].filter(g => voters.some(v => v.age === g));
    let html = '';
    if (factions.length && ages.length) {
      let m = `<div class="h"></div>${ages.map(a => `<div class="h">${a}</div>`).join('')}`;
      factions.forEach(f => {
        const label = (voters.find(v => v.faction === f) || {}).faction_label || '';
        m += `<div class="flabel"><b><i class="sw" style="background:${FCOL[f]}"></i>Faction ${f}</b><span>${esc(label)}</span></div>`;
        ages.forEach(age => { m += `<div class="cell"><span class="agehead">${age}</span>${voters.filter(v => v.faction === f && v.age === age).map(v => personBtn(v.id)).join('')}</div>`; });
      });
      html += `<h3 class="castsec">Voters</h3><div class="matrix">${m}</div>`;
    } else if (voters.length) {
      html += `<h3 class="castsec">Voters</h3><div class="plist">${voters.map(v => personBtn(v.id)).join('')}</div>`;
    }
    if (by('actor').length) html += `<h3 class="castsec">${CFG.roleLabels ? 'Political roles' : 'Political actors'}</h3><div class="plist">${by('actor').map(c => personBtn(c.id)).join('')}</div>`;
    if (by('media').length) html += `<h3 class="castsec">Newsrooms</h3><div class="plist">${by('media').map(c => personBtn(c.id)).join('')}</div>`;
    if (by('amplifier').length) html += `<h3 class="castsec">Amplifiers, never in the lean</h3><div class="plist">${by('amplifier').map(c => personBtn(c.id)).join('')}</div>`;
    if (by('other').length) html += `<h3 class="castsec">Other agents</h3><div class="plist">${by('other').map(c => personBtn(c.id)).join('')}</div>`;
    $('#castbody').innerHTML = html || `<div class="nm">Cast: <b>${NM}</b></div>`;
  }

  // ---------- agent drawer ----------
  let lastFocus = null;
  function openAgent(id) {
    const a = agentOf(id);
    const m = majorityOf(cur, id);
    const entry = cur._agents ? cur._agents.get(id) : null;
    const rl = (entry && entry.role_label) || roleLabelOf(id);
    let h = `<div style="display:flex;gap:12px;align-items:center;margin-bottom:14px">${avatar(id)}<div style="min-width:0"><div style="font-weight:700;font-size:17px">${esc(nameOf(id))}</div><div class="muted" style="font-size:12.5px">${esc(tagOf(id))}${a.place ? ' · ' + esc(a.place) : ''}</div><div style="margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span class="syn">SYNTHETIC</span>${rl ? `<span class="muted" style="font-size:12px">${esc(rl)}</span>` : ''}</div></div></div>`;
    h += `<div class="card" style="padding:14px"><div class="kick" style="margin-bottom:4px">${esc(runLabel(cur))}${isWhatIf(cur) ? ' · hypothetical scenario' : ''}</div>`;
    if (m === null) h += `<div class="kv"><span>Majority stance</span><span>${NM}</span></div>`;
    else if (m === 'DID_NOT_ACT') h += `<div class="kv"><span>Majority stance</span><span>Did not act in this run</span></div>`;
    else h += `<div class="kv"><span>Majority stance</span><span>${chip(m)}</span></div><div class="kv"><span>Posts by stance</span><span class="cnt">${STANCES.filter(s => entry.stances[s]).map(s => chip(s, entry.stances[s])).join('')}</span></div>`;
    const seeded = (cur.seeds || []).filter(s => s.poster === id);
    if (seeded.length) h += `<div class="kv"><span>Briefing post</span><span>Posted ${seeded.length} operator-written briefing post${seeded.length > 1 ? 's' : ''}</span></div>`;
    h += `</div>`;
    if (D.movement_available) {
      const mv = (D.agents_moved || []).find(x => x.agent === id);
      const facts = [];
      if (mv) facts.push(`<span>Majority stance</span><span class="cnt">${chip(mv.from)}<span class="arrow">→</span>${chip(mv.to)}</span>`);
      if ((D.agents_went_quiet || []).includes(id)) facts.push('<span>Went quiet in the what-if</span><span></span>');
      if ((D.agents_appeared || []).includes(id)) facts.push('<span>Spoke only in the what-if</span><span></span>');
      h += `<div class="sub">${esc(runLabel(BASE))} (baseline) → what-if</div><div class="card" style="padding:12px 14px">${facts.length ? facts.map(f => `<div class="kv">${f}</div>`).join('') : '<div class="muted" style="font-size:13px">No change recorded for this agent.</div>'}</div>`;
    }
    h += `<div class="sub">Posts in ${esc(runLabel(cur))}</div>`;
    if (!cur._posts) h += `<div class="nm">Posts: <b>${NM}</b></div>`;
    else {
      const mine = cur._posts.filter(p => p.author === id && p.kind !== 'seed');
      h += mine.length ? mine.map(p => `<div class="bub" style="margin-bottom:10px;border-top-left-radius:18px">${p.kind === 'quote' ? quotedHTML(p) : ''}<div class="bt">${esc(textOf(p))}</div><div class="bf"><span class="syn">SYNTHETIC</span>${p.stance ? chip(p.stance) : '<span class="st-chip NONE">unlabelled</span>'}${(p.arguments || []).map(x => `<span class="tag">${esc(x)}</span>`).join('')}<span class="rd">round ${esc(p.round)} · post ${esc(p.id)}</span></div></div>`).join('') : `<div class="nm">No posts by this agent in this run.</div>`;
    }
    $('#drawer-title').textContent = nameOf(id);
    $('#drawerbody').innerHTML = h;
    lastFocus = document.activeElement;
    $('#drawer').classList.add('on'); $('#scrim').classList.add('on'); $('#drawer').setAttribute('aria-hidden', 'false');
    $('#drawerbody').scrollTop = 0;
    $('#close').focus();
  }
  function closeAgent() {
    $('#drawer').classList.remove('on'); $('#scrim').classList.remove('on'); $('#drawer').setAttribute('aria-hidden', 'true');
    lastFocus?.focus?.();
  }
  $('#close').addEventListener('click', closeAgent);
  $('#scrim').addEventListener('click', closeAgent);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAgent(); });

  // ---------- pipeline ----------
  (function renderPipeline() {
    const same = STAB.length > 1 && STAB.every(r => JSON.stringify((r.seeds || []).map(s => s.content)) === JSON.stringify((STAB[0].seeds || []).map(s => s.content)));
    const seeds = (STAB[0] || RUNS[0] || {}).seeds || [];
    const castCounts = ['voter', 'actor', 'media', 'amplifier'].map(r => [r, [...CAST.values()].filter(c => c.role === r).length]).filter(x => x[1]);
    const word = {voter: 'voters', actor: CFG.roleLabels ? 'political roles' : 'political actors', media: 'newsrooms', amplifier: 'amplifiers'};
    const labelled = RUNS.some(r => r._posts && r._posts.some(p => p.stance));
    const totalPosts = RUNS.reduce((s, r) => s + (r._posts ? r._posts.filter(p => p.kind !== 'seed').length : 0), 0);
    const stat = (n, l) => `<div class="stat"><b>${n}</b><span>${esc(l)}</span></div>`;
    const stages = [
      {t: 'Briefing posts from real news', d: 'Short posts written by the operator from real headlines open each debate. They are not labelled.', b: `
        <div class="statrow">${seeds.length ? stat(seeds.length, 'briefing posts') : ''}${STAB.length ? stat(STAB.length, same ? 'stability runs, identical briefing' : 'stability runs') : ''}${D.seed_changed ? stat((D.seed_removed || []).length, 'swapped in the what-if') : ''}</div>
        ${seeds.length ? '' : `<div class="nm">Briefing posts: <b>${NM}</b></div>`}`},
      {t: 'The cast', d: 'Invented voters across factions and age bands, plus political roles and newsrooms. Every agent is synthetic.', b: `
        <div class="statrow">${castCounts.map(([r, n]) => stat(n, word[r])).join('') || `<div class="nm">Cast list: <b>${NF}</b></div>`}</div><button class="linkbtn" data-goto="cast">See the cast →</button>`},
      {t: 'The debate runs', d: 'MiroFish with the fixed engine guidance: short timeline posts, no repetition, newsrooms observe rather than take sides, IEBC voices speak on process and neutrality only, and non-Latin-script posts filtered out.', b: `
        <div class="tw"><table class="rtable"><thead><tr><th>Run</th><th>Id</th><th>Model</th><th>Ended</th><th>Runtime</th><th>Posts</th><th>Active</th></tr></thead><tbody>${RUNS.map(r => `<tr><td><b>${esc(runLabel(r))}</b>${isWhatIf(r) ? ' <span class="hypo">hypothetical</span>' : r === BASE ? ' <span class="muted">baseline</span>' : ''}</td><td>${esc(r.run)}</td><td>${esc(r.model_logged || D.model || NF)}</td><td>${esc(dateTxt(r).replace(/^ended /, ''))}</td><td>${esc(runtimeTxt(r))}</td><td>${has(r.n_action_posts) ? r.n_action_posts : NM}</td><td>${has(r.n_agents_active) ? r.n_agents_active : NM}</td></tr>`).join('')}</tbody></table></div>`},
      {t: 'Every post labelled', d: 'Each agent post gets one stance (YES, NO, CONDITIONAL or OPEN) and up to three argument tags. Each agent then has a majority stance, with ties shown as MIXED.', b: `
        <div class="statrow">${labelled ? stat(totalPosts, 'posts labelled across all runs') : `<div class="nm">Per-post labels: <b>${NM}</b></div>`}</div><div class="note">Labelling model: ${esc(D.model || NF)}.</div><button class="linkbtn" data-goto="method">How labelling works →</button>`},
      {t: 'Compare', d: 'The stability runs show how much the lean moves on its own. The what-if shows what moves when one briefing post changes.', b: `
        <div class="statrow">${D.spread_majority ? stat(STAB.length, 'runs in the stability spread') : ''}${D.movement_available ? stat((D.agents_moved || []).length, 'agents changed majority stance') : ''}</div>${D.spread_majority || D.movement_available ? '' : `<div class="nm">Comparison: <b>${NM}</b></div>`}<button class="linkbtn" data-goto="compare">Open the comparison →</button>`}
    ];
    $('#pipeline').innerHTML = stages.map((s, i) => `<div class="step"><div class="sn">${i + 1}</div><div class="card sc"><h3>${esc(s.t)}</h3><p class="sd">${esc(s.d)}</p><div class="sb">${s.b}</div></div></div>`).join('');
  })();

  // ---------- tabs and navigation ----------
  function showTab(name) {
    $$('.tab').forEach(t => t.setAttribute('aria-selected', t.dataset.tab === name));
    $$('.panel').forEach(p => p.classList.toggle('on', p.id === 'p-' + name));
  }
  $('#tabs').addEventListener('click', e => { const t = e.target.closest('.tab'); if (t) showTab(t.dataset.tab); });
  document.addEventListener('click', e => {
    const ag = e.target.closest('[data-agent]');
    if (ag) { openAgent(ag.dataset.agent); return; }
    const op = e.target.closest('[data-openrun]');
    if (op) { selectRun(op.dataset.openrun); showTab('debate'); window.scrollTo({top: $('.tabbar').offsetTop}); return; }
    const fl = e.target.closest('[data-flip]');
    if (fl) { flip(fl.dataset.flip); $('#cmpmode').scrollIntoView({behavior: 'smooth', block: 'start'}); return; }
    const g = e.target.closest('[data-goto]');
    if (g) { showTab(g.dataset.goto); window.scrollTo({top: $('.tabbar').offsetTop}); }
  });

  selectRun(cur.run);
  showTab('compare');
})();
