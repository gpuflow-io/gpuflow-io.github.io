"""Build a standalone review HTML for browser preview without a web server."""
import argparse
import json
from pathlib import Path

def build(output, snapshot=None, workload=None, screen=None):
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
    html = html.replace('<link rel="stylesheet" href="testbed.css">', '<style>'+(root/'testbed.css').read_text()+'</style>')
    mapping_js=(root/'mapping.js').read_text()
    assert '</script' not in mapping_js.lower()
    html=html.replace('<script src="mapping.js"></script>','<script>'+mapping_js+'</script>')
    testbed_js=(root/'testbed.js').read_text()
    assert '</script' not in testbed_js.lower()
    embedded=''
    if snapshot:
        sample=json.loads(snapshot.read_text())
        sample['review_api_samples']=json.loads((root/'samples/review-api.fixtures.json').read_text())
        encoded_snapshot=json.dumps(sample,ensure_ascii=False).replace('<','\\u003c')
        embedded='<script id="gpuflow-testbed-data" type="application/json">'+encoded_snapshot+'</script>\n'
        embedded+='<script>if(!new URL(location.href).searchParams.has("data")){const u=new URL(location.href);u.searchParams.set("data","snapshot");history.replaceState(null,"",u);}</script>\n'
    if workload:
        selected=json.dumps(workload).replace('<','\\u003c')
        embedded+='<script>{const u=new URL(location.href);if(!u.searchParams.has("workload")){u.searchParams.set("workload",'+selected+');history.replaceState(null,"",u);}}</script>\n'
    if screen:
        encoded_screen=json.dumps(screen)
        embedded+='<script>{const u=new URL(location.href);if(!u.searchParams.has("screen")){u.searchParams.set("screen",'+encoded_screen+');history.replaceState(null,"",u);}}</script>\n'
    html=html.replace('<script src="testbed.js"></script>', embedded+'<script>'+testbed_js+'</script>')
    html = html.replace('href="../"', 'href="https://gpuflow-io.github.io/"')
    # Fonts remain optional: the browser falls back to system fonts offline.
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html)
    print('Created', output, output.stat().st_size, 'bytes')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('output', type=Path)
    parser.add_argument('--snapshot', type=Path)
    parser.add_argument('--workload')
    parser.add_argument('--screen', choices=('overview','path','workload','analysis'))
    args=parser.parse_args()
    build(args.output,args.snapshot,args.workload,args.screen)
