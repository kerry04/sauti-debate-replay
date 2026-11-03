"""Add display data to data/comparison.json without touching any number readout.py wrote.

The page reads one file, data/comparison.json. readout.py writes the counts. This
tool only ADDS keys next to them, and refuses to write if any existing key would
change.

Two jobs:

1. Cast block (names, roles, factions, age bands, public role labels, and the
   names a newsroom uses for itself, so the page can swap them for its role
   label inside its own posts when role labels are on):
     python3 -I tools/enrich.py data/comparison.json --cast <twitter_profiles.csv> [--roles <public_roles.json>]
   Adds top-level "cast". Agent ids are the cast's usernames, which is what
   readout.py uses (e.g. "abdi_hassan_105").

2. Per-run posts, per-agent stances, date and runtime (needs the run folders):
     python3 -I tools/enrich.py data/comparison.json \
         --run sim_ruto_fixed_v1=<run_dir> [--labels sim_ruto_fixed_v1=<labels file>] \
         --run sim_ruto_fixed_v2=<run_dir> [--labels ...] ...
   Adds to the matching run: "posts" (from twitter_simulation.db, read-only),
   "date" (UTC date of the database file), "runtime_s" (from the runner's
   "总耗时" log line), and "model_logged" (from the runner's "model=" log line).
   If a labels file is given, each post gets its stance and argument tags, and
   the run gets "agents" (each agent's majority stance; ties are MIXED).
   Before writing "agents", the tool recounts distinct_agents_majority and
   distinct_agents_overlapping from the labels and stops if they differ from the
   numbers readout.py wrote. The page never shows per-agent stances that
   disagree with the headline counts.

Labels file: JSON lines or a JSON list, one object per post. Accepted keys:
post id as "post", "post_id" or "id"; stance as "stance" (YES, NO, CONDITIONAL,
OPEN); tags as "arguments", "argument_tags" or "tags".
"""

import csv
import json
import re
import sqlite3
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

STANCES = ("YES", "NO", "CONDITIONAL", "OPEN")


def read_labels(path):
    text = Path(path).read_text().strip()
    rows = json.loads(text) if text.startswith("[") else [json.loads(l) for l in text.splitlines() if l.strip()]
    out = {}
    for r in rows:
        pid = r.get("post", r.get("post_id", r.get("id")))
        if pid is None:
            continue
        stance = str(r.get("stance") or "").upper() or None
        tags = r.get("arguments", r.get("argument_tags", r.get("tags"))) or []
        out[int(pid)] = {"stance": stance if stance in STANCES else None, "arguments": [str(t).lower() for t in tags][:3]}
    return out


def load_cast(csv_path, roles_path):
    roles_doc = json.loads(Path(roles_path).read_text()) if roles_path else {}
    roles, self_names = roles_doc.get("roles", {}), roles_doc.get("selfNames", {})
    cast = []
    with open(csv_path, newline="") as fh:
        for r in csv.DictReader(fh):
            desc, char = r["description"], r["user_char"]
            role = ("voter" if desc.startswith("Ordinary voter") else "actor" if desc.startswith("Named public actor")
                    else "media" if desc.startswith("Media house") else "amplifier" if "amplifier" in desc.lower() else "other")
            entry = {"id": r["username"], "user_id": int(r["user_id"]), "name": r["name"], "role": role}
            f = re.search(r"Faction ([A-E]) — ([^.]+)\.", char)
            i = re.search(r"IDENTITY: [^,]+, (Gen Z|Young adult|Older), ([^.]+)\.", char)
            b = re.search(r"Base: ([^.]+)\.", desc)
            if f:
                entry["faction"], entry["faction_label"] = f.group(1), f.group(2).strip()
            if i:
                entry["age"], entry["place"] = i.group(1), i.group(2).strip()
            elif b:
                entry["place"] = b.group(1).strip()
            if str(r["user_id"]) in roles and role in ("actor", "media"):
                entry["public_label"] = roles[str(r["user_id"])]
            if str(r["user_id"]) in self_names:
                entry["self_names"] = self_names[str(r["user_id"])]
            cast.append(entry)
    return cast


def run_posts(run_dir, labels):
    db = sqlite3.connect(f"file:{Path(run_dir) / 'twitter_simulation.db'}?mode=ro", uri=True)
    # OASIS stores the cast username in user_name or, in some builds, in name.
    users = {uid: un or nm for uid, un, nm in db.execute("select user_id, user_name, name from user")}
    target = {}
    for action, info in db.execute("select action, info from trace where action in ('quote_post','repost')"):
        d = json.loads(info)
        t = d.get("quoted_id", d.get("reposted_id", d.get("post_id")))
        if d.get("new_post_id") is not None and t is not None:
            target[d["new_post_id"]] = t
    posts = []
    for pid, uid, orig, content, quote, step in db.execute(
            "select post_id, user_id, original_post_id, content, quote_content, created_at from post order by post_id"):
        if orig is None:
            kind, text = "post", content
        elif quote:
            kind, text = "quote", quote
        else:
            kind, text = "repost", ""
        p = {"id": pid, "author": users.get(uid, str(uid)), "kind": kind, "text": text or "", "round": step,
             "quote_of": target.get(pid, orig) if kind != "post" else None}
        if labels is not None and pid in labels:
            p["stance"], p["arguments"] = labels[pid]["stance"], labels[pid]["arguments"]
        posts.append(p)
    db.close()
    return posts


def mark_seeds(posts, seeds):
    contents = [s["content"].strip() for s in seeds]
    for p in posts:
        if p["kind"] == "post" and p["text"].strip() in contents:
            p["kind"] = "seed"
            p.pop("stance", None)
            p.pop("arguments", None)


def agents_from(posts):
    per = {}
    for p in posts:
        if p["kind"] == "seed" or not p.get("stance"):
            continue
        per.setdefault(p["author"], Counter())[p["stance"]] += 1
    agents, majority, overlapping = [], Counter(), Counter()
    for a, c in per.items():
        top = max(c.values())
        leaders = [s for s in STANCES if c[s] == top]
        pos = leaders[0] if len(leaders) == 1 else "MIXED"
        agents.append({"agent": a, "majority": pos, "stances": {s: c[s] for s in STANCES if c[s]}})
        majority[pos] += 1
        for s in c:
            overlapping[s] += 1
    return sorted(agents, key=lambda x: x["agent"]), majority, overlapping


def run_meta(run_dir):
    d = Path(run_dir)
    meta = {}
    db = d / "twitter_simulation.db"
    if db.exists():
        meta["date"] = datetime.fromtimestamp(db.stat().st_mtime, tz=timezone.utc).date().isoformat()
    for log in sorted(d.glob("run*.log")):
        t = log.read_text(errors="replace")
        m = re.search(r"总耗时:\s*([\d.]+)", t)
        if m and "runtime_s" not in meta:
            meta["runtime_s"] = round(float(m.group(1)), 1)
        m = re.search(r"model=([^,\s]+)", t)
        if m and "model_logged" not in meta:
            meta["model_logged"] = m.group(1)
    return meta


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 2
    path = Path(argv[1])
    data = json.loads(path.read_text())
    before = json.dumps(data, sort_keys=True)
    args = argv[2:]
    runs_arg, labels_arg, cast_csv, roles = {}, {}, None, None
    while args:
        flag, val = args[0], args[1] if len(args) > 1 else None
        if val is None:
            print(__doc__); return 2
        if flag == "--cast":
            cast_csv = val
        elif flag == "--roles":
            roles = val
        elif flag == "--run":
            k, v = val.split("=", 1); runs_arg[k] = v
        elif flag == "--labels":
            k, v = val.split("=", 1); labels_arg[k] = v
        else:
            print(__doc__); return 2
        args = args[2:]

    added = []
    if cast_csv:
        data["cast"] = load_cast(cast_csv, roles)
        added.append(f"cast ({len(data['cast'])} agents)")

    by_id = {r["run"]: r for r in data["runs"]}
    for name, run_dir in runs_arg.items():
        if name not in by_id:
            raise SystemExit(f"run {name} is not in {path}")
        r = by_id[name]
        labels = read_labels(labels_arg[name]) if name in labels_arg else None
        posts = run_posts(run_dir, labels)
        mark_seeds(posts, r.get("seeds", []))
        r["posts"] = posts
        r.update(run_meta(run_dir))
        note = f"{name}: {len(posts)} posts"
        if labels is not None:
            agents, majority, overlapping = agents_from(posts)
            want_m = {k: v for k, v in r["distinct_agents_majority"].items() if v}
            want_o = {k: v for k, v in r["distinct_agents_overlapping"].items() if v}
            if dict(majority) != want_m or dict(overlapping) != want_o:
                raise SystemExit(f"{name}: per-agent recount does not match readout.py\n  majority  {dict(majority)} vs {want_m}\n  overlapping {dict(overlapping)} vs {want_o}\nNothing written.")
            r["agents"] = agents
            note += f", {len(agents)} agents (recount matches readout.py)"
        added.append(note)

    # Every key readout.py wrote must be unchanged.
    after_original = json.loads(before)
    def strip(d):
        d = json.loads(json.dumps(d))
        d.pop("cast", None)
        for r in d.get("runs", []):
            for k in ("posts", "agents", "date", "runtime_s", "model_logged"):
                r.pop(k, None)
        return d
    if json.dumps(strip(data), sort_keys=True) != json.dumps(strip(after_original), sort_keys=True):
        raise SystemExit("an existing key would change; nothing written")

    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print("added: " + "; ".join(added) if added else "nothing to add")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
