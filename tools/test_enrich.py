"""Offline checks for enrich.py's per-agent recount. The fixture is made up and only
tests the counting rules (majority, ties as MIXED, overlapping).

Run: python3 -I tools/test_enrich.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import enrich  # noqa: E402

POSTS = [
    {"id": 1, "author": "a", "kind": "seed", "text": "s"},
    {"id": 2, "author": "a", "kind": "post", "stance": "YES"},
    {"id": 3, "author": "a", "kind": "quote", "stance": "YES"},
    {"id": 4, "author": "a", "kind": "post", "stance": "NO"},
    {"id": 5, "author": "b", "kind": "post", "stance": "CONDITIONAL"},
    {"id": 6, "author": "b", "kind": "post", "stance": "NO"},
    {"id": 7, "author": "c", "kind": "post", "stance": "OPEN"},
    {"id": 8, "author": "d", "kind": "repost"},
]


def test_recount():
    agents, majority, overlapping = enrich.agents_from(POSTS)
    pos = {a["agent"]: a["majority"] for a in agents}
    assert pos == {"a": "YES", "b": "MIXED", "c": "OPEN"}, pos
    assert dict(majority) == {"YES": 1, "MIXED": 1, "OPEN": 1}, majority
    assert dict(overlapping) == {"YES": 1, "NO": 2, "CONDITIONAL": 1, "OPEN": 1}, overlapping


def test_mark_seeds():
    posts = [{"id": 1, "author": "a", "kind": "post", "text": "Brief one", "stance": "YES"}, {"id": 2, "author": "b", "kind": "post", "text": "x"}]
    enrich.mark_seeds(posts, [{"poster": "a", "content": "Brief one"}])
    assert posts[0]["kind"] == "seed" and "stance" not in posts[0] and posts[1]["kind"] == "post"


if __name__ == "__main__":
    test_recount(); print("ok test_recount")
    test_mark_seeds(); print("ok test_mark_seeds")
