/* Sauti Debate Replay — vanilla JS. No dependencies, no tracking.
   Recorded mode (default): plays runs from data/runs.json.
   Live mode: set window.SAUTI_LIVE in config.js to a MiroFish backend URL
   and simulation id; the page then polls that backend's posts endpoint and
   shows a LIVE badge. The deployed build ships with live mode OFF.
   Two pages share this script: index.html (feed) and why.html (explainer).
   Every DOM lookup is guarded, so each page only runs its own sections. */
(function () {
  "use strict";
  var STANCE_LABEL = {
    yes: "YES", pro: "PRO", opposition: "OPPOSITION", no: "NO",
    sceptical: "SCEPTICAL", government: "GOVERNMENT",
    conditional: "CONDITIONAL", neutral: "NEUTRAL"
  };
  var SPEEDS = { 1: 900, 2: 450, 4: 200 };
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  var state = { runs: [], run: null, revealed: 0, playing: false, timer: null, speed: 1, filter: "all", live: false };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function initials(name) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join("").toUpperCase();
  }
  function $(id) { return document.getElementById(id); }
  function set(id, html) { var el = $(id); if (el) el.innerHTML = html; }
  function setText(id, text) { var el = $(id); if (el) el.textContent = text; }
  // Run date only ("2026-11-01" -> "Nov 1"). No per-post timestamps exist in
  // the sim DBs (created_at holds small step counters, not clock times), so
  // no clock times, no "x hours ago", and no invented round numbers appear.
  function shortDate(iso) {
    if (!iso) return "";
    var parts = iso.split("-");
    if (parts.length !== 3) return esc(iso);
    return MONTHS[+parts[1] - 1] + " " + (+parts[2]);
  }

  function stanceChip(p) {
    if (!p.stance) return "";
    return '<span class="stance ' + p.stance + '">' + STANCE_LABEL[p.stance] + "</span>";
  }
  // Action counts are computed from the run itself, never invented:
  // replies = quotes targeting this post, reposts = pure reposts of it,
  // likes = the run's likes for it. No view counts exist, so none are shown.
  function actionRow(p, counts) {
    var c = counts[p.id] || { replies: 0, reposts: 0 };
    return '<span class="action">💬 ' + c.replies + "</span>" +
      '<span class="action">🔁 ' + c.reposts + "</span>" +
      '<span class="action">♥ ' + p.likes + "</span>";
  }
  function quotedCard(q) {
    return '<div class="quote-card"><div class="quote-head"><span class="avatar avatar-sm">' + esc(initials(q.author)) + "</span>" +
      '<span class="post-name">' + esc(q.author) + '</span><span class="synthetic-label">SYNTHETIC</span></div>' +
      '<p class="post-text">' + esc(q.text) + "</p></div>";
  }
  function postCard(p, byId, counts, runDate) {
    var kindLabel = p.kind === "seed" ? "SEED" : p.kind === "quote" ? "QUOTE" : p.kind === "repost" ? "REPOST" : "POST";
    var time = runDate ? '<span class="post-time">· ' + runDate + "</span>" : "";
    var html = '<article class="post' + (p.kind === "seed" ? " seed" : "") + '" data-post-id="' + p.id + '">' +
      '<div class="post-head"><span class="avatar">' + esc(initials(p.author)) + "</span>" +
      '<span class="post-name">' + esc(p.author) + "</span>" + time +
      '<span class="post-kind">' + kindLabel + '</span><span class="synthetic-label">SYNTHETIC</span></div>';
    if (p.kind === "repost") {
      // A pure repost carries no text of its own: show the original it
      // reposted, under a "reposted by" line. Nothing is invented.
      html += '<p class="repost-by">🔁 ' + esc(p.author) + " reposted</p>";
      if (p.quote_of && byId[p.quote_of]) html += quotedCard(byId[p.quote_of]);
    } else {
      html += '<p class="post-text">' + esc(p.text) + "</p>";
      if (p.quote_of && byId[p.quote_of]) html += quotedCard(byId[p.quote_of]);
    }
    html += '<div class="post-foot">' + stanceChip(p) + actionRow(p, counts) + "</div></article>";
    return html;
  }

  function visiblePosts() {
    var posts = state.run.posts.slice(0, state.revealed);
    if (state.filter === "all") return posts;
    return posts.filter(function (p) { return p.stance === state.filter; });
  }
  function countActions() {
    var counts = {};
    state.run.posts.forEach(function (p) {
      if (!p.quote_of) return;
      if (!counts[p.quote_of]) counts[p.quote_of] = { replies: 0, reposts: 0 };
      if (p.kind === "quote") counts[p.quote_of].replies += 1;
      if (p.kind === "repost") counts[p.quote_of].reposts += 1;
    });
    return counts;
  }

  function renderFeed() {
    var byId = {};
    state.run.posts.forEach(function (p) { byId[p.id] = p; });
    var counts = countActions();
    var date = shortDate(state.run.date);
    var shown = visiblePosts();
    $("feed").innerHTML = shown.map(function (p) { return postCard(p, byId, counts, date); }).join("");
    // Animated avatar: the most recently shown post's agent pops, carries a
    // blue pulse ring, and keeps a blue LIVE dot until the next post lands.
    // (renderFeed rebuilds the DOM each tick, so the classes are applied
    // fresh here rather than patched onto nodes that will be wiped.)
    if (shown.length) {
      var newest = $("feed").querySelector('[data-post-id="' + shown[shown.length - 1].id + '"] .avatar');
      if (newest) newest.classList.add("avatar-speaking", "avatar-live");
    }
    setText("progress", "Post " + state.revealed + " of " + state.run.posts.length + " shown");
    setText("feedEnd", state.revealed >= state.run.posts.length
      ? "End of run — " + state.run.posts.length + " posts (8 seeds + " + (state.run.posts.length - 8) + " agent actions). The lean is a statement about this run's output, not a prediction."
      : "");
    renderLean();
  }

  function renderLean() {
    // Headline metric is distinct agents per stance; post counts secondary.
    // An author posting under two stances counts in both stances' agent
    // counts, so per-stance agent counts can sum past the distinct total.
    var postCounts = {}, agentSets = {}, distinct = {};
    state.run.posts.slice(0, state.revealed).forEach(function (p) {
      if (!p.stance) return;
      postCounts[p.stance] = (postCounts[p.stance] || 0) + 1;
      if (!agentSets[p.stance]) agentSets[p.stance] = {};
      agentSets[p.stance][p.author] = true;
      distinct[p.author] = true;
    });
    var order = ["yes", "pro", "opposition", "conditional", "neutral", "sceptical", "no", "government"];
    var keys = order.filter(function (k) { return postCounts[k]; });
    var agentTotal = keys.reduce(function (a, k) { return a + Object.keys(agentSets[k]).length; }, 0);
    var tagged = keys.reduce(function (a, k) { return a + postCounts[k]; }, 0);
    var bar = tagged === 0
      ? '<div class="lean-empty">Press Play</div>'
      : keys.map(function (k) {
          var n = Object.keys(agentSets[k]).length;
          return '<div class="lean-seg ' + k + '" style="width:' + (n / agentTotal * 100).toFixed(1) + '%" title="' + STANCE_LABEL[k] + " " + n + " agents · " + postCounts[k] + ' posts"></div>';
        }).join("");
    set("leanBarSticky", bar);
    set("leanBar", bar);
    set("leanLegend", keys.map(function (k) {
      var n = Object.keys(agentSets[k]).length;
      return "<span><b>" + STANCE_LABEL[k] + "</b> " + n + " agents · " + postCounts[k] + " posts</span>";
    }).join("") || "<span>No tagged posts shown yet.</span>");
    setText("leanCountSticky", tagged ? Object.keys(distinct).length + " agents · " + tagged + " tagged" : "");
  }

  function renderFilters() {
    var wrap = $("filters");
    if (!wrap) return;
    var stances = [];
    state.run.posts.forEach(function (p) {
      if (p.stance && stances.indexOf(p.stance) === -1) stances.push(p.stance);
    });
    var chips = ['<button class="chip' + (state.filter === "all" ? " active" : "") + '" data-f="all">All</button>'];
    stances.forEach(function (s) {
      chips.push('<button class="chip' + (state.filter === s ? " active" : "") + '" data-f="' + s + '">' + STANCE_LABEL[s] + "</button>");
    });
    wrap.innerHTML = chips.join("");
    wrap.querySelectorAll(".chip").forEach(function (btn) {
      btn.addEventListener("click", function () { state.filter = btn.getAttribute("data-f"); renderFilters(); renderFeed(); });
    });
  }

  function stopPlayback() {
    state.playing = false;
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
    setText("btnPlay", "▶ Play");
  }
  function tick() {
    if (state.revealed >= state.run.posts.length) { stopPlayback(); renderFeed(); return; }
    state.revealed += 1;
    renderFeed();
  }
  function startPlayback() {
    if (state.revealed >= state.run.posts.length) state.revealed = 0;
    state.playing = true;
    setText("btnPlay", "⏸ Pause");
    state.timer = setInterval(tick, SPEEDS[state.speed]);
  }

  function renderRunHead() {
    var r = state.run;
    setText("runTitle", r.title);
    setText("runQuestion", r.question);
    set("runMeta", [
      "<span><b>Run date:</b> " + esc(r.date) + "</span>",
      "<span><b>Model:</b> " + esc(r.model) + "</span>",
      "<span><b>Runtime:</b> " + esc(r.runtime) + "</span>",
      "<span>" + r.rounds + " rounds</span>",
      "<span>" + (r.agents_acted ? r.agents_acted + " of " : "") + r.agents + " agents</span>",
      "<span>" + r.counts.posts + " posts · " + r.counts.quotes + " quotes · " + r.counts.likes + " likes · " + r.counts.follows + " follows</span>"
    ].join(""));
    set("readoutLean", "<strong>Readout lean:</strong> " + esc(r.lean) +
      ' <span style="color:var(--muted)">' + esc(r.lean_note) + "</span>");
    renderFilters();
    if ($("feed")) renderFeed();
  }

  function renderImpact() {
    var ft = $("followTable");
    if (ft) {
      ft.querySelector("tbody").innerHTML = state.runs.map(function (r) {
        return "<tr><td>" + esc(r.short) + "</td><td>" + r.counts.follows + "</td><td>" + r.counts.likes + "</td><td>" + r.counts.quotes + "</td></tr>";
      }).join("");
    }
    var tq = $("topQuoted");
    if (tq) {
      // Top quoted posts in the featured (Kalonzo) run.
      var qcounts = {};
      state.run.posts.forEach(function (p) { if (p.quote_of) qcounts[p.quote_of] = (qcounts[p.quote_of] || 0) + 1; });
      var byId = {};
      state.run.posts.forEach(function (p) { byId[p.id] = p; });
      var top = Object.keys(qcounts).map(function (k) { return { id: +k, n: qcounts[k] }; })
        .sort(function (a, b) { return b.n - a.n; }).slice(0, 4);
      tq.innerHTML = "<p class=\"panel-note\"><strong>Most quoted in the " + esc(state.run.short) + " run:</strong></p>" +
        (top.length ? top.map(function (t) {
          var q = byId[t.id];
          return "<p class=\"panel-note\">" + t.n + "× — " + esc(q.author) + ": “" + esc(q.text.slice(0, 90)) + (q.text.length > 90 ? "…" : "") + "”</p>";
        }).join("") : "<p class=\"panel-note\">No quotes yet.</p>");
    }
  }

  function renderRunsSection() {
    var rt = $("runsTable");
    if (rt) {
      rt.querySelector("tbody").innerHTML = state.runs.map(function (r) {
        return "<tr><td><strong>" + esc(r.short) + "</strong><br><span style=\"color:var(--muted)\">" + esc(r.title) + "</span></td>" +
          "<td>" + esc(r.date) + "</td><td>" + esc(r.model) + "</td><td>" + r.counts.posts + "</td>" +
          "<td>" + esc(r.lean) + "</td></tr>";
      }).join("");
    }
    var rc = $("runsCards");
    if (rc) {
      rc.innerHTML = state.runs.map(function (r) {
        return '<div class="run-card"><h4>' + esc(r.title) + "</h4>" +
          "<p><b>Date:</b> " + esc(r.date) + " · <b>Posts:</b> " + r.counts.posts + "</p>" +
          "<p><b>Model:</b> " + esc(r.model) + "</p>" +
          "<p><b>Lean:</b> " + esc(r.lean) + "</p>" +
          "<p><b>Fixed:</b> " + esc(r.fixed) + "</p>" +
          "<p><b>Still open:</b> " + esc(r.still_open) + "</p></div>";
      }).join("");
    }
  }

  function selectRun(id) {
    stopPlayback();
    state.run = state.runs.filter(function (r) { return r.id === id; })[0] || state.runs[0];
    state.revealed = 0;
    state.filter = "all";
    document.querySelectorAll(".run-tab").forEach(function (t) {
      t.classList.toggle("active", t.getAttribute("data-run") === state.run.id);
    });
    var sel = $("runSelect");
    if (sel) sel.value = state.run.id;
    renderRunHead();
    renderImpact();
  }

  function buildSwitcher() {
    var tabs = $("runTabs");
    if (tabs) {
      tabs.innerHTML = state.runs.map(function (r) {
        return '<button class="run-tab" data-run="' + r.id + '">' + esc(r.short) + " · " + r.counts.posts + " posts</button>";
      }).join("");
      tabs.querySelectorAll(".run-tab").forEach(function (t) {
        t.addEventListener("click", function () { selectRun(t.getAttribute("data-run")); });
      });
    }
    var sel = $("runSelect");
    if (sel) {
      sel.innerHTML = state.runs.map(function (r) {
        return '<option value="' + r.id + '">' + esc(r.short) + " — " + esc(r.title) + "</option>";
      }).join("");
      sel.addEventListener("change", function () { selectRun(sel.value); });
    }
  }

  function wireControls() {
    var play = $("btnPlay");
    if (play) play.addEventListener("click", function () {
      if (state.playing) stopPlayback(); else startPlayback();
    });
    var all = $("btnShowAll");
    if (all) all.addEventListener("click", function () {
      stopPlayback();
      state.revealed = state.run.posts.length;
      renderFeed();
    });
    document.querySelectorAll(".speed-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        state.speed = +b.getAttribute("data-speed");
        document.querySelectorAll(".speed-btn").forEach(function (x) { x.classList.toggle("active", x === b); });
        if (state.playing) { clearInterval(state.timer); state.timer = setInterval(tick, SPEEDS[state.speed]); }
      });
    });
  }

  // Live mode: poll the MiroFish backend when configured. Never used in the
  // deployed build (config ships with backendUrl null).
  function maybeLive() {
    var cfg = window.SAUTI_LIVE || {};
    if (!cfg.backendUrl || !cfg.simulationId) return;
    var badge = $("modeBadge");
    if (!badge) return;
    badge.textContent = "LIVE";
    badge.classList.add("live");
    state.live = true;
    function poll() {
      fetch(cfg.backendUrl.replace(/\/$/, "") + "/api/simulation/" + cfg.simulationId + "/posts")
        .then(function (res) { return res.json(); })
        .then(function (data) {
          var posts = Array.isArray(data) ? data : (data.posts || []);
          if (!posts.length) return;
          // Append only posts not already shown, in backend order.
          var seen = {};
          state.run.posts.forEach(function (p) { seen[p.id] = true; });
          posts.forEach(function (p, i) {
            var text = p.quote_content || p.content || "";
            if (!text) return;
            var id = p.post_id != null ? p.post_id : 100000 + i;
            if (seen[id]) return;
            seen[id] = true;
            state.run.posts.push({
              id: id, author: p.author_name || p.name || "Live agent", author_idx: -1,
              kind: p.original_post_id ? (p.quote_content ? "quote" : "repost") : "original",
              quote_of: p.original_post_id || null, text: text,
              likes: p.num_likes || 0, stance: null
            });
          });
          state.revealed = state.run.posts.length;
          renderFeed();
        })
        .catch(function () { /* backend unreachable: keep showing recorded posts */ });
    }
    poll();
    setInterval(poll, 15000);
  }

  fetch("data/runs.json")
    .then(function (res) { return res.json(); })
    .then(function (data) {
      state.runs = data.runs;
      if ($("feed")) {
        // Feed page: full playback.
        buildSwitcher();
        wireControls();
        selectRun("kalonzo");
        maybeLive();
      } else {
        // Why page: featured Kalonzo run for readout + most-quoted, all
        // runs for the table and the follows table. No playback wiring.
        state.run = state.runs.filter(function (r) { return r.id === "kalonzo"; })[0] || state.runs[0];
        set("readoutLean", "<strong>Readout lean:</strong> " + esc(state.run.lean) +
          ' <span style="color:var(--muted)">' + esc(state.run.lean_note) + "</span>");
        renderImpact();
        renderRunsSection();
      }
    })
    .catch(function (err) {
      if ($("feed")) $("feed").innerHTML = "<p>Could not load run data. If you are running this page from a file URL, serve the folder over HTTP instead (see README).</p>";
      console.error(err);
    });
})();
