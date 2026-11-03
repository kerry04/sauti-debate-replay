# Sauti: simulated Kenyan debate, measured

A static viewer for Sauti runs. It reads one file, `data/comparison.json`, written by
`readout.py`, and shows three things from it: whether the lean holds across repeated
runs, what moves when one briefing post changes, and each agent's posts and stance.

Simulated debate, not a poll. Every post is marked SYNTHETIC. Sauti never sets a price,
resolves a market, or moves money.

## Files

| File | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The page. No build step, no dependencies, no network calls except `data/comparison.json`. |
| `config.js` | One setting: `roleLabels` (on by default). Shows public figures and real newsrooms by role, so no simulated post reads as a real person's or outlet's statement. |
| `data/comparison.json` | The only data source. Every number on the page comes from here. |
| `tools/enrich.py` | Adds display data (cast, posts, per-agent stances, run date and runtime) next to readout.py's numbers. Never changes an existing key. |
| `tools/test_enrich.py` | Offline checks for enrich.py's counting rules. |
| `tools/public_roles.json` | Role labels and newsroom self-names used by `--cast`. |
| `tools/build_preview.py` | Builds `preview.html`, the whole page in one file with the data inlined, for review in chat or email. Not for the repo. |
| `vercel.json` | Static hosting config (unchanged from the current repo). |

## Data flow

1. `readout.py` writes `data/comparison.json`: counts, arguments, spread, movement, seeds,
   and per run `posts` (with stance and argument tags), `agents` (majority stance, stance
   counts, role label) and `ended_at`.
2. `tools/enrich.py --cast` adds the `cast` block (all 47 agents with names, roles, factions,
   age bands, role labels and newsroom self-names). Already done in this delivery. It adds one
   key and checks that no existing key changes.

The page reads posts in readout.py's shape (`post_id`, `agent`, `step`, `content`,
`quote_content`) and agents in its shape (`majority_stance`, `stance_counts`). A quote's own
words are `quote_content`; `content` is the post it quotes, which the page matches to the
briefing post or earlier post with that text to show who said it.

`enrich.py --run` (posts and agents straight from run folders) is kept for future runs but is
not needed for this file.

## Run locally

```bash
python3 -m http.server 8000   # the page fetches data/comparison.json, which file:// blocks
```

## Sample discipline

If `comparison.json` has `"sample": true`, a red banner says the numbers are sample data. With
`"sample": false` (the current file) the banner is hidden. The page code holds no fallback
numbers; anything missing is shown as "not measured yet" or "not in the data file".

## Credits

Simulation engine: MiroFish (open source, AGPL-3.0). Debate and labelling model: Meta's Muse
Spark Open via Baseten. This repo contains no MiroFish code.
