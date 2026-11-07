"""Build a standalone review HTML for browser preview without a web server."""
import argparse
import json
from pathlib import Path

def build(output):
    root = Path(__file__).resolve().parent
    html = (root / 'index.html').read_text()
    css = (root / 'review.css').read_text()
    js = (root / 'review.js').read_text()
    data = json.loads((root / 'review-contracts.json').read_text())
    # Escape HTML raw-text terminators in embedded JSON.
    encoded = json.dumps(data, ensure_ascii=False).replace('<', '\\u003c')
    assert '</script' not in js.lower() and '</style' not in css.lower()
    html = html.replace('<link rel="stylesheet" href="review.css">', '<style>'+css+'</style>')
    html = html.replace('<script src="review.js"></script>',
        '<script id="gpuflow-review-data" type="application/json">'+encoded+'</script>\n<script>'+js+'</script>')
    html = html.replace('href="../"', 'href="https://gpuflow-io.github.io/"')
    # Fonts remain optional: the browser falls back to system fonts offline.
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html)
    print('Created', output, output.stat().st_size, 'bytes')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('output', type=Path)
    build(parser.parse_args().output)
