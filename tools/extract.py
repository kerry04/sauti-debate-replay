#!/usr/bin/env python3
"""Extract Sauti debate runs from MiroFish sim databases (READ-ONLY) into data/runs.json.

Sources (never modified; opened with mode=ro):
  sim_sifuna_demo, sim_sifuna_voice_test, sim_sifuna_voice_v2, sim_kalonzo_test
  under ~/workspace/mirofish/backend/uploads/simulations/

Display names come from each sim dir's twitter_profiles.csv (CSV user_id == DB user_id).
Post text = content for originals, quote_content for quotes. Pure reposts carry no
own text and render as a repost of their original.

Stance tags follow the run readout.md groupings. Where a readout names post ids,
those are authoritative. Where it describes groups (e.g. Kalonzo "all wire debate
posts except KBC News"), the script applies that group rule and prints the counts
next to the readout totals so any mismatch is visible. Seeds and untagged posts
carry stance=null and never move the lean bar.

Sanitisation: any @handle-like token in sim text is replaced with the plain
person name (one occurrence: @edwinsifuna -> Edwin Sifuna). The output is
asserted to contain no @handle tokens and no URLs.
"""
import csv
import json
import re
import sqlite3
from pathlib import Path

SIMS = Path.home() / "workspace/mirofish/backend/uploads/simulations"
OUT = Path(__file__).resolve().parent.parent / "data" / "runs.json"

# CSV index -> voice type (run 4 / Kalonzo cast; same 31 names in all four runs).
WIRE = {0, 16, 18, 19, 20, 21, 22, 25, 27, 29}
INSTITUTIONAL = {1, 2, 3, 4, 5, 7, 9, 13, 14, 17, 23, 24, 30}
BANTER = {10, 12, 28}
EARNEST = {26}
ARGUMENT = {6, 8, 11, 15}
IEBC_FAMILY = {4, 13, 23, 24}  # IEBC personas + commission + enforcement + chair


def stance_maps():
    """post_id -> stance, per run, from the run readouts."""
    run2 = {}
    for p in (12, 13, 15, 18, 25, 27, 30, 34):
        run2[p] = "yes"
    for p in (24, 29, 20, 10, 11, 32, 38, 35, 36,
              9, 14, 17, 21, 22, 26, 31, 33, 16, 23):
        run2[p] = "sceptical"
    run3 = {}
    for p in (12, 16, 35, 47):
        run3[p] = "pro"
    for p in (20, 31, 32, 42, 43, 46, 49, 53, 57, 55, 58, 26, 34, 37):
        run3[p] = "conditional"
    for p in (9, 10, 13, 14, 17, 18, 19, 22, 27, 28, 33, 36, 39, 40, 41, 45, 48, 50, 54, 59):
        run3[p] = "sceptical"
    for p in (21, 30, 38, 44, 56):
        run3[p] = "government"
    for p in (23, 24, 25, 29, 51, 52):
        run3[p] = "neutral"
    run4 = {}
    for p in (31, 57, 95):
        run4[p] = "yes"
    for p in (20, 44, 51, 70, 75, 89):
        run4[p] = "neutral"
    for p in (62, 83, 91):
        run4[p] = "no"  # readout: "unlikely at this stage / for now", but they land on NO
    kalonzo = {}
    for p in (19, 24, 63, 13, 43, 52, 77, 65, 83):
        kalonzo[p] = "government"
    for p in (78, 90):
        kalonzo[p] = "neutral"  # UDA present-tense observations, per readout
    kalonzo[85] = "government"  # Omar's third post: government-side banter countering Maraga (readout names Omar twice, but all 3 of his posts argue the government side)
    kalonzo[72] = "neutral"  # Senate "takes note" note in the DCP/IEBC process chain, not a position
    return {"sim_sifuna_demo": run2, "sim_sifuna_voice_test": run3,
            "sim_sifuna_voice_v2": run4, "sim_kalonzo_test": kalonzo}


def clean(text):
    """Drop @handle tokens; the debate is about public figures, their names stay."""
    if not text:
        return ""
    text = text.replace("@edwinsifuna", "Edwin Sifuna")
    text = re.sub(r"@[A-Za-z0-9_]+", "", text)
    return text.strip()


META = {
    "sim_sifuna_demo": {
        "id": "sifuna-run2", "short": "Run 2",
        "title": "Sifuna, run 2 — the debate works",
        "question": "Will Edwin Sifuna lead the opposition coalition into Kenya's 2027 general election?",
        "date": "2026-10-30", "rounds": 24, "agents": 31,
        "model": "nvidia/nemotron-3.5-lightning (free, OpenRouter)",
        "runtime": "1490.1s (~25 min)",
        "counts": {"posts": 39, "seeds": 8, "originals": 14, "quotes": 17, "reposts": 0, "likes": 0, "follows": 0},
        "voice": {"code_switch": "84% (26/31)", "sheng": "23% (7/31), 0.3 tokens/post",
                  "emoji": "essentially none", "length": "229 chars / 32.0 words",
                  "grammar": "Broken. Code-switching present, Swahili grammar often wrong (free model, non-fluent)."},
        "lean": "Conditional YES with heavy scepticism. Sifuna CAN lead (mobilisation, voice), but support is conditional on a jobs plan.",
        "lean_note": "A statement about this run's output, not a prediction. Elite/media cast only.",
        "fixed": "Gate 1 passed: 12+ positioned posts, opposing sides present, 6+ reasoned quotes. The runner finally debates instead of echoing seeds.",
        "still_open": "Elite/media cast only — no Sifuna, Orengo, or Gachagua agents. 0 likes, 0 follows. Rate limits skipped some turns.",
    },
    "sim_sifuna_voice_test": {
        "id": "sifuna-run3", "short": "Run 3",
        "title": "Sifuna, run 3 — voice priming",
        "question": "Will Edwin Sifuna lead the opposition coalition into Kenya's 2027 general election?",
        "date": "2026-10-31", "rounds": 24, "agents": 31, "agents_acted": 23,
        "model": "nvidia/nemotron-3.5-lightning (free, OpenRouter) — same model as run 2, so the comparison is clean",
        "runtime": "1718.8s (~29 min)",
        "counts": {"posts": 60, "seeds": 8, "originals": 15, "quotes": 37, "reposts": 0, "likes": 0, "follows": 0},
        "voice": {"code_switch": "98% published (51/52); 78.8% same-method (41/52)",
                  "sheng": "90% published, 2.9 tokens/post; 51.9% same-method, 0.96/post",
                  "emoji": "65% laughing emoji", "length": "204 chars / 30.5 words",
                  "grammar": "NOT fixed. Still invents verb forms (anakuweka, tunawanga, kakaunti, vimbinadamu). Ingredients, not grammar."},
        "lean": "Same as run 2: conditional YES with heavy scepticism, conditional on IEBC transparency and a jobs/cost-of-living plan.",
        "lean_note": "A statement about this run's output, not a prediction. Elite/media cast only.",
        "fixed": "Priming works on the surface: near-universal code-switching, real Sheng density, humour, shorter bursts.",
        "still_open": "Grammar still broken. Template repetition: 21 of 37 quotes target seed 8 (\"marriage of convenience\" / \"divorce court\"). 0 likes, 0 follows.",
    },
    "sim_sifuna_voice_v2": {
        "id": "sifuna-run4", "short": "Run 4",
        "title": "Sifuna, run 4 — grammar fixed, newsroom tone",
        "question": "Will Edwin Sifuna lead the opposition coalition into Kenya's 2027 general election?",
        "date": "2026-10-31", "rounds": 24, "agents": 31, "agents_acted": 28,
        "model": "meta-models/muse-spark-open-1026 (Baseten) — first run on the stronger model",
        "runtime": "1603.5s (~27 min)",
        "counts": {"posts": 98, "seeds": 8, "originals": 31, "quotes": 58, "reposts": 1, "likes": 12, "follows": 0},
        "voice": {"code_switch": "53.3% (48/90) — wire is 48/90 actions and code-switches only 22.9% by design; banter 75%, earnest 100%, argument 100%",
                  "sheng": "18.9% (17/90), 0.23 tokens/post — lexicon gap: the filter list misses current words",
                  "emoji": "10.0% (banter alone 100%; wire/institutional 0% by design)",
                  "length": "356 chars / 53.8 words — nearly doubled; institutional averages 487 chars / 73 words: essays, not tweets",
                  "grammar": "FIXED at the run-3 level. Zero occurrences of all six broken shapes, plus hamfikirii 0 and \"divorce court\" 0."},
        "lean": "NO: Sifuna will not lead the coalition.",
        "lean_note": "STRONG ARTIFACT WARNING. The lean flipped from run 3's conditional YES on the same question, cast, and seeds with only the refs and the model changed. The NO comes overwhelmingly from wire and institutional voices repeating one assessment template. The pro side had only one persona by construction (Mawia, 3 actions). Treat this NO as a statement about this run's output, not evidence about the real question.",
        "fixed": "Grammar fixed — the founder's complaint from run 3. First likes ever (12). Seed-8 anchoring down to 43% of quotes; the run-3 meme is dead.",
        "still_open": "Newsroom tone: wire dominates (48/90), posts read as consensus, not a timeline. 0 follows. Length doubled. Blind test pending founder ratings.",
    },
    "sim_kalonzo_test": {
        "id": "kalonzo", "short": "Kalonzo",
        "title": "Kalonzo test — which side will he pick?",
        "question": "Which side will Kalonzo pick — Ruto's government or the opposition coalition — ahead of Kenya's 2027 general election?",
        "date": "2026-11-01", "rounds": 24, "agents": 31, "agents_acted": 30,
        "model": "meta-models/muse-spark-open-1026 (Baseten) — same cast and voice setup as run 4; only the question and seeds changed",
        "runtime": "~2048s (~34 min)",
        "counts": {"posts": 90, "seeds": 8, "originals": 34, "quotes": 47, "reposts": 1, "likes": 9, "follows": 0},
        "voice": {"code_switch": "56.1% (46/82) — flat vs run 4; wire 16%, institutional 90%, argument 89%, banter 56%",
                  "sheng": "2.4% (2/82), 0.02 tokens/post — lexicon caveat: the 23-word filter misses this run's actual banter Sheng (bana 5x, fala 3x); banter is only 9 actions, so the run is Sheng-thin regardless",
                  "emoji": "11.0% (banter alone 100%; wire/institutional 0% by design)",
                  "length": "350 chars / 53.0 words — institutional 436 chars / 64.4 words: essays, not tweets",
                  "grammar": "FIXED again. Zero run-3 broken shapes across two runs now."},
        "lean": "OPPOSITION 53 vs GOVERNMENT 10, with 19 neutral/process posts.",
        "lean_note": "STRONG ARTIFACT WARNING. Seeds lean opposition (4 of 8 argue the opposition side); the government side is carried almost entirely by the Ruto persona plus KBC News; the opposition template (\"principal + bargaining power + flower girl\") repeats across nearly every type. Treat this lean as a statement about this run's output, not evidence about the real question. The one honest signal inside it: the lean holds only if the opposition has a jobs and cost-of-living plan, not just a shares calculation.",
        "fixed": "Gate-1-style bar passed on all three items (63 positioned posts, 20+ opposition agents vs 4 government, many reasoned quotes). Debate chains exist (post 22 quoted 11 times in run 4; seed 5 and the DCP statement draw 5 quotes each here).",
        "still_open": "Wire (32) + institutional (31) = 77% of actions — still reads as a newsroom. 0 follows. Essay length unchanged. DCP/IEBC process chain drifts off-topic. True faction debate still needs a voter cast (faction x age), not this elite cast.",
    },
}


def tag_rule(run_key, user_idx, named):
    """Group rules for posts the readout describes but does not number."""
    if run_key == "sim_sifuna_voice_v2":
        if user_idx in IEBC_FAMILY:
            return "neutral"  # IEBC-family process posts; readout's named neutral posts are IEBC/Citizen Digital
        return "no"  # readout: NO = all wire debate posts, nearly all institutional, all argument, all banter
    if run_key == "sim_kalonzo_test":
        if user_idx in IEBC_FAMILY or user_idx in (14, 22, 5):
            return "neutral"  # IEBC/DCP process, Capital FM no-confirmation notes, UDA present-tense
        return "opposition"  # readout: all wire debate except KBC News, nearly all institutional, all argument, earnest, Methu banter
    return None


def main():
    maps = stance_maps()
    runs = []
    for sim_dir, meta in META.items():
        with open(SIMS / sim_dir / "twitter_profiles.csv", newline="") as f:
            names = [r["name"] for r in csv.DictReader(f)]
        con = sqlite3.connect(f"file:{SIMS / sim_dir / 'twitter_simulation.db'}?mode=ro", uri=True)
        rows = con.execute(
            "SELECT post_id, user_id, original_post_id, content, quote_content, num_likes "
            "FROM post ORDER BY post_id").fetchall()
        follows = con.execute("SELECT COUNT(*) FROM follow").fetchone()[0]
        assert follows == 0, f"{sim_dir}: follows != 0"
        named = maps[sim_dir]
        posts = []
        for pid, uid, orig, content, quote, likes in rows:
            if orig is None:
                kind = "seed" if pid <= 8 else "original"
                text = content or ""
            elif quote is not None:
                kind, text = "quote", quote
            else:
                kind, text = "repost", ""
            text = clean(text)
            assert "@" not in text and "http" not in text, f"{sim_dir} post {pid}: unsanitised text"
            stance = None if kind == "seed" else named.get(pid)
            if stance is None and kind != "seed":
                stance = tag_rule(sim_dir, uid, named)
            posts.append({
                "id": pid, "author": names[uid], "author_idx": uid,
                "kind": kind, "quote_of": orig, "text": text,
                "likes": likes, "stance": stance,
            })
        kinds = {k: sum(1 for p in posts if p["kind"] == k) for k in ("seed", "original", "quote", "repost")}
        stances = {}
        for p in posts:
            if p["stance"]:
                stances[p["stance"]] = stances.get(p["stance"], 0) + 1
        print(f"{sim_dir}: total={len(posts)} kinds={kinds} stances={stances} "
              f"untagged_agent={sum(1 for p in posts if p['kind'] != 'seed' and not p['stance'])}")
        assert len(posts) == meta["counts"]["posts"], sim_dir
        assert kinds["seed"] == 8 and kinds["quote"] == meta["counts"]["quotes"]
        assert kinds["repost"] == meta["counts"]["reposts"]
        assert sum(p["likes"] for p in posts) == meta["counts"]["likes"]
        runs.append({**meta, "posts": posts})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"runs": runs}, ensure_ascii=False, indent=1))
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
