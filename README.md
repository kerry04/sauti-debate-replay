# Sauti Debate Replay

A demo module for the Meta Global AI Developer Hackathon, Startup track.
It replays simulated Kenyan debates as a social timeline, with a live lean
bar and a company impact panel showing what a debate reading would mean for
SokoResult. It is a demo module only — it contains no market, pricing, or
production code.

## What judges see

- **A social feed that plays like a timeline.** Posts drop in on a timer
  (Play/Pause, 1×/2×/4×, Show all), quotes thread under the post they
  answer, stance filters, and a lean bar that moves as tagged posts land.
- **All four runs, full posts, not excerpts:**
  - Run 2 (Sifuna, 2026-10-30): 39 posts — the debate works, broken Swahili.
  - Run 3 (Sifuna, 2026-10-31): 60 posts — voice priming, ingredients not grammar.
  - Run 4 (Sifuna, 2026-10-31): 98 posts — grammar fixed, newsroom tone, lean flipped NO.
  - Kalonzo (2026-11-01): 90 posts — lean opposition 53 vs government 10.
- **A company impact panel, labelled SHADOW MODE / ILLUSTRATIVE:**
  signal (blind and shared-keyword markets), sentiment (news vs the street),
  and what improves. Sauti never sets prices, never resolves a market,
  never moves money; its weight is 0 until it clears a founder-set
  backtest bar.
- **An improvements arc** (run 2 → run 3 → run 4 → Kalonzo) and the open
  list: 0 follows in every run, newsroom tone, thin Sheng, lean flips as
  artifact warnings.
- **An honesty panel.** Every lean is a statement about that run's output,
  never a prediction. No tribal breakdowns in any published readout.

## Honesty notes on the data

- Posts are simulated. Display names come from the sim cast lists; no real
  person's posts and no real handles appear. One simulated `@handle` token
  in run 2 was sanitised to the plain person name during extraction.
- Stance tags follow each run's `readout.md` groupings. Where a readout
  names post ids, those are authoritative. Where it describes groups, the
  extractor applies that group rule. Kalonzo tags reconcile exactly to the
  readout (53/10/19). Run 2 has 4 untagged agent posts and run 3 has 3;
  untagged posts and seeds never move the lean bar.
- Voice percentages are the readouts' own numbers, including their
  methodology caveats (run 3 published vs same-method figures).

## Run locally

No build step. Serve the folder over HTTP (the page fetches
`data/runs.json`, which browsers block from `file://`):

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

To regenerate `data/runs.json` from the sim databases (read-only):

```sh
python3 tools/extract.py
```

## Deploy

This is a static site. On Vercel: import this repo, no build command, no
output directory override. `vercel.json` is already included. Deploying is
one step and is intentionally not done by the repo itself.

## Live mode (MiroFish connection)

The page can read a running MiroFish backend when configured in
`config.js`: set `window.SAUTI_LIVE.backendUrl` and `simulationId`. It then
polls `GET {backendUrl}/api/simulation/{id}/posts` every 15 seconds and
shows a LIVE badge. With `backendUrl: null` (the shipped default) it plays
recorded runs and says RECORDED RUN. No keys, tokens, or cookies are used
or stored, and no backend URL is hardcoded into the deployed build.

## Credits

- Simulation engine: MiroFish (third-party open source, AGPL-3.0).
- Debate model: Built with Muse Spark Open.
- Data: four MiroFish simulation runs (Oct 30 – Nov 1, 2026), extracted
  read-only. Nothing here writes to any production system.
