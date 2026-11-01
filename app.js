/* Sauti Debate Replay — vanilla JS. No dependencies, no tracking.
   Recorded mode (default): plays runs from data/runs.json.
   Live mode: set window.SAUTI_LIVE in config.js to a MiroFish backend URL
   and simulation id; the page then polls that backend's posts endpoint and
   shows a LIVE badge. The deployed build ships with live mode OFF. */
(function () {
  "use strict";
  var STANCE_LABEL = {
    yes: "YES", pro: "PRO", opposition: "OPPOSITION", no: "NO",
    sceptical: "SCEPTICAL", government: "GOVERNMENT",
    conditional: "CONDITIONAL", neutral: "NEUTRAL"
  };
  var SPEEDS = { 1: 900, 2: 450, 4: 200 };

  var state = { runs: [], run: null, revealed: 0, playing: false, timer: null, speed: 1, filter: "all", live: false };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function initials(name) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join("").toUpperCase();
  }
  function $(id) { return document.getElementById(id); }

  function stanceChip(p) {
    if (!p.stance) return "";
    return '<span class="stance ' + p.stance + '">' + STANCE_LABEL[p.stance] + "</span>";
  }
  function postCard(p, byId) {
    var kindLabel = p.kind === "seed" ? "SEED" : p.kind === "quote" ? "QUOTE" : p.kind === "repost" ? "REPOST" : "POST";
    var html = '<article class="post' + (p.kind === "seed" ? " seed" : "") + '" data-post-id="' + p.id + '">' +
      '<div class="post-head"><span class="avatar">' + esc(initials(p.author)) + "</span>" +
      '<span class="post-name">' + esc(p.author) + '</span>' +
      '<span class="post-kind">' + kindLabel + "</span></div>";
    if (p.kind === "repost") {
      html += '<p class="repost-note">Reposted:</p>';
    } else {
      html += '<p class="post-text">' + esc(p.text) + "</p>";
    }
    if (p.quote_of && byId[p.quote_of]) {
      var q = byId[p.quote_of];
      html += '<div class="quote-card"><span class="post-name">' + esc(q.author) + "</span>" +
        '<p class="post-text">' + esc(q.text) + "</p></div>";
    }
    html += '<div class="post-foot">' + stanceChip(p) +
      "<span>♥ " + p.likes + "</span></div></article>";
    return html;
  }

  function visiblePosts() {
    var posts = state.run.posts.slice(0, state.revealed);
    if (state.filter === "all") return posts;
    return posts.filter(function (p) { return p.stance === state.filter; });
  }

  function renderFeed() {
    var byId = {};
    state.run.posts.forEach(function (p) { byId[p.id] = p; });
    var shown = visiblePosts();
    $("feed").innerHTML = shown.map(function (p) { return postCard(p, byId); }).join("");
    // Animated avatar: the most recently shown post's agent pops, carries a
    // blue pulse ring, and keeps a blue LIVE dot until the next post lands.
    // (renderFeed rebuilds the DOM each tick, so the classes are applied
    // fresh here rather than patched onto nodes that will be wiped.)
    if (shown.length) {
      var newest = $("feed").querySelector('[data-post-id="' + shown[shown.length - 1].id + '"] .avatar');
      if (newest) newest.classList.add("avatar-speaking", "avatar-live");
    }
    $("progress").textContent = "Post " + state.revealed + " of " + state.run.posts.length + " shown";
    $("feedEnd").textContent = state.revealed >= state.run.posts.length
      ? "End of run — " + state.run.posts.length + " posts (8 seeds + " + (state.run.posts.length - 8) + " agent actions). The lean is a statement about this run's output, not a prediction."
      : "";
    renderLean();
  }

  function renderLean() {
    var counts = {};
    state.run.posts.slice(0, state.revealed).forEach(function (p) {
      if (p.stance) counts[p.stance] = (counts[p.stance] || 0) + 1;
    });
    var total = Object.keys(counts).reduce(function (a, k) { return a + counts[k]; }, 0);
    var order = ["yes", "pro", "opposition", "conditional", "neutral", "sceptical", "no", "government"];
    var keys = order.filter(function (k) { return counts[k]; });
    var bar = total === 0
      ? '<div class="lean-empty">Press Play</div>'
      : keys.map(function (k) {
          return '<div class="lean-seg ' + k + '" style="width:' + (counts[k] / total * 100).toFixed(1) + '%" title="' + STANCE_LABEL[k] + " " + counts[k] + '"></div>';
        }).join("");
    $("leanBar").innerHTML = bar;
    $("leanBarSticky").innerHTML = bar;
    $("leanLegend").innerHTML = keys.map(function (k) {
      return "<span><b>" + STANCE_LABEL[k] + "</b> " + counts[k] + "</span>";
    }).join("") || "<span>No tagged posts shown yet.</span>";
    $("leanCountSticky").textContent = total ? total + " tagged" : "";
  }

  function renderFilters() {
    var stances = [];
    state.run.posts.forEach(function (p) {
      if (p.stance && stances.indexOf(p.stance) === -1) stances.push(p.stance);
    });
    var chips = ['<button class="chip' + (state.filter === "all" ? " active" : "") + '" data-f="all">All</button>'];
    stances.forEach(function (s) {
      chips.push('<button class="chip' + (state.filter === s ? " active" : "") + '" data-f="' + s + '">' + STANCE_LABEL[s] + "</button>");
    });
    $("filters").innerHTML = chips.join("");
    $("filters").querySelectorAll(".chip").forEach(function (btn) {
      btn.addEventListener("click", function () { state.filter = btn.getAttribute("data-f"); renderFilters(); renderFeed(); });
    });
  }

  function stopPlayback() {
    state.playing = false;
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
    $("btnPlay").textContent = "▶ Play";
  }
  function tick() {
    if (state.revealed >= state.run.posts.length) { stopPlayback(); renderFeed(); return; }
    state.revealed += 1;
    renderFeed();
  }
  function startPlayback() {
    if (state.revealed >= state.run.posts.length) state.revealed = 0;
    state.playing = true;
    $("btnPlay").textContent = "⏸ Pause";
    state.timer = setInterval(tick, SPEEDS[state.speed]);
  }

  function renderRunHead() {
    var r = state.run;
    $("runTitle").textContent = r.title;
    $("runQuestion").textContent = r.question;
    $("runMeta").innerHTML = [
      "<span>" + esc(r.date) + "</span>",
      "<span>" + esc(r.model) + "</span>",
      "<span>" + esc(r.runtime) + "</span>",
      "<span>" + r.rounds + " rounds</span>",
      "<span>" + (r.agents_acted ? r.agents_acted + " of " : "") + r.agents + " agents</span>",
      "<span>" + r.counts.posts + " posts · " + r.counts.quotes + " quotes · " + r.counts.likes + " likes · " + r.counts.follows + " follows</span>"
    ].join("");
    $("readoutLean").innerHTML = "<strong>Readout lean:</strong> " + esc(r.lean) +
      ' <span style="color:var(--muted)">' + esc(r.lean_note) + "</span>";
    renderFilters();
    renderFeed();
  }

  function renderImpact() {
    var rows = state.runs.map(function (r) {
      return "<tr><td>" + esc(r.short) + "</td><td>" + r.counts.follows + "</td><td>" + r.counts.likes + "</td><td>" + r.counts.quotes + "</td></tr>";
    }).join("");
    $("followTable").querySelector("tbody").innerHTML = rows;
    // Top quoted posts in the selected run.
    var qcounts = {};
    state.run.posts.forEach(function (p) { if (p.quote_of) qcounts[p.quote_of] = (qcounts[p.quote_of] || 0) + 1; });
    var byId = {};
    state.run.posts.forEach(function (p) { byId[p.id] = p; });
    var top = Object.keys(qcounts).map(function (k) { return { id: +k, n: qcounts[k] }; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 4);
    $("topQuoted").innerHTML = "<p class=\"panel-note\"><strong>Most quoted in this run:</strong></p>" +
      (top.length ? top.map(function (t) {
        var q = byId[t.id];
        return "<p class=\"panel-note\">" + t.n + "× — " + esc(q.author) + ": “" + esc(q.text.slice(0, 90)) + (q.text.length > 90 ? "…" : "") + "”</p>";
      }).join("") : "<p class=\"panel-note\">No quotes yet.</p>");
  }

  function renderRunsSection() {
    $("runsTable").querySelector("tbody").innerHTML = state.runs.map(function (r) {
      return "<tr><td><strong>" + esc(r.short) + "</strong><br><span style=\"color:var(--muted)\">" + esc(r.title) + "</span></td>" +
        "<td>" + esc(r.date) + "</td><td>" + esc(r.model) + "</td><td>" + r.counts.posts + "</td>" +
        "<td>" + esc(r.lean) + "</td></tr>";
    }).join("");
    $("runsCards").innerHTML = state.runs.map(function (r) {
      return '<div class="run-card"><h4>' + esc(r.title) + "</h4>" +
        "<p><b>Date:</b> " + esc(r.date) + " · <b>Posts:</b> " + r.counts.posts + "</p>" +
        "<p><b>Model:</b> " + esc(r.model) + "</p>" +
        "<p><b>Lean:</b> " + esc(r.lean) + "</p>" +
        "<p><b>Fixed:</b> " + esc(r.fixed) + "</p>" +
        "<p><b>Still open:</b> " + esc(r.still_open) + "</p></div>";
    }).join("");
  }

  function selectRun(id) {
    stopPlayback();
    state.run = state.runs.filter(function (r) { return r.id === id; })[0] || state.runs[0];
    state.revealed = 0;
    state.filter = "all";
    document.querySelectorAll(".run-tab").forEach(function (t) {
      t.classList.toggle("active", t.getAttribute("data-run") === state.run.id);
    });
    $("runSelect").value = state.run.id;
    renderRunHead();
    renderImpact();
  }

  function buildSwitcher() {
    $("runTabs").innerHTML = state.runs.map(function (r) {
      return '<button class="run-tab" data-run="' + r.id + '">' + esc(r.short) + " · " + r.counts.posts + " posts</button>";
    }).join("");
    $("runSelect").innerHTML = state.runs.map(function (r) {
      return '<option value="' + r.id + '">' + esc(r.short) + " — " + esc(r.title) + "</option>";
    }).join("");
    $("runTabs").querySelectorAll(".run-tab").forEach(function (t) {
      t.addEventListener("click", function () { selectRun(t.getAttribute("data-run")); });
    });
    $("runSelect").addEventListener("change", function () { selectRun($("runSelect").value); });
  }

  function wireControls() {
    $("btnPlay").addEventListener("click", function () {
      if (state.playing) stopPlayback(); else startPlayback();
    });
    $("btnShowAll").addEventListener("click", function () {
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
      buildSwitcher();
      wireControls();
      selectRun("kalonzo");
      renderRunsSection();
      maybeLive();
    })
    .catch(function (err) {
      $("feed").innerHTML = "<p>Could not load run data. If you are running this page from a file URL, serve the folder over HTTP instead (see README).</p>";
      console.error(err);
    });
})();
