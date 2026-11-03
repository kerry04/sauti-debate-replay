# Compare page — how it works

`compare.html` reads `data/comparison.json` and shows two runs side by
side: distinct-agent lean bars, raw post counts, top arguments, and —
when the file carries it — what moved between the runs (agents who
changed stance, agents who went quiet, arguments that appeared or
disappeared, and seed differences).

## Where the data comes from

- `readout.py` (in `swahili-voice/`) writes `comparison.json` in exactly
  this shape. Point it at two or more run databases and copy its
  `comparison.json` over `data/comparison.json`.
- The file shipped here is SAMPLE data: rule-based echo numbers for the
  two Sifuna runs, with `movement_available: false`. The page says so in
  a banner. It proves the template; it is not Spark-labelled output.

## Fields the page reads

- `question`, `sample`, `sample_note`, `model`
- `runs[]`: `run`, `title`, `n_action_posts`, `n_agents_active`,
  `raw_counts`, `distinct_agents_overlapping`,
  `distinct_agents_majority` (may be null), `top_arguments[]`
  (`argument`, `posts`, `agents` may be null), `seeds[]`
- Two-run movement: `movement_available`, `movement_note`,
  `agents_moved[]` (`agent`, `from`, `to`), `agents_went_quiet[]`,
  `agents_appeared[]`, `arguments_disappeared[]`, `arguments_appeared[]`,
  `seed_changed`, `seed_added[]`, `seed_removed[]` (each `poster`,
  `content`).

## Honesty rules baked into the page

- Lean bars count distinct agents, never raw posts.
- A what-if run's added seeds are labelled hypothetical scenarios, not
  news, in the Seeds section.
- The top banner always says simulated debate, not a poll.

## Data corrections (2026-11-03, KERRY)
Original queue output kept at backups/comparison.json.queue-original (working dir, not shipped).
1. `spread_majority` was computed over all 4 runs, including the what-if run, so it
   overstated the YES range (max 14, the what-if value) and understated CONDITIONAL
   (min 9, the what-if value). Recomputed over the 3 stability runs only:
   YES 3-11, NO 5-6, CONDITIONAL 10-18, OPEN 5-7, MIXED 8-11. MIXED added (was absent).
2. `movement_available` was missing even though all movement fields are present
   (v1 vs what-if pair: 18 agents moved, 4 went quiet, 4 appeared). Set to true so
   the "What moved" section renders instead of "Movement data not in this file."
No measured count was changed; both fixes are derived from values already in the file.
