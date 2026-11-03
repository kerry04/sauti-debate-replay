"""Build preview.html: the whole viewer in one file, with data/comparison.json inlined.

For review in a chat or by email only. The repo ships index.html + styles.css + app.js +
config.js + data/comparison.json; the page then fetches the data file itself.

Usage: python3 -I tools/build_preview.py [out.html]
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main(argv):
    out = Path(argv[1]) if len(argv) > 1 else ROOT / "preview.html"
    html = (ROOT / "index.html").read_text()
    css = (ROOT / "styles.css").read_text()
    cfg = (ROOT / "config.js").read_text()
    app = (ROOT / "app.js").read_text()
    data = json.dumps(json.loads((ROOT / "data" / "comparison.json").read_text()), ensure_ascii=False).replace("</", "<\\/")
    for tag in ('<link rel="stylesheet" href="styles.css">', '<script src="config.js"></script>', '<script src="app.js"></script>'):
        if html.count(tag) != 1:
            raise SystemExit(f"index.html must contain {tag} once")
    html = html.replace('<link rel="stylesheet" href="styles.css">', "<style>\n" + css + "\n</style>")
    html = html.replace('<script src="config.js"></script>', "<script>\n" + cfg + "\nwindow.SAUTI_DATA = " + data + ";\n</script>")
    html = html.replace('<script src="app.js"></script>', "<script>\n" + app + "\n</script>")
    out.write_text(html)
    print(f"wrote {out} ({len(html) // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
