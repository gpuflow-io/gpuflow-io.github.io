"""Fixed, read-only DAOS VM queries for the preview (not a product API contract)."""
import argparse
import datetime as dt
import json
import math
from pathlib import Path
import time
import urllib.parse
import urllib.request

METRICS = {'read': 'gpuflow_storage_target_read_bytes_total',
           'write': 'gpuflow_storage_target_write_bytes_total'}
LABELS = ('cluster', 'node', 'source', 'pod', 'pool', 'rank', 'target', 'backend',
          'data_origin', 'simulated', 'job', 'tier', 'storage_media', 'transport',
          'instance', 'otel_scope_name', 'otel_scope_version')

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        raise ValueError('upstream_redirect')

class StorageVM:
    def __init__(self, base, cluster):
        u = urllib.parse.urlsplit(base)
        if u.scheme not in ('http', 'https') or not u.hostname or u.username or u.password or u.query or u.fragment:
            raise ValueError('invalid_vm_url')
        if not cluster or len(cluster) > 128 or any(ord(c) < 32 for c in cluster):
            raise ValueError('invalid_cluster')
        self.base, self.cluster = base.rstrip('/'), cluster
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def queries(self, metric):
        selector = metric + '{cluster=' + json.dumps(self.cluster) + ',source="gluesys",data_origin="measured",simulated="false",backend="daos",job="gpuflow-measured-daos"}'
        return {'counter': selector, 'bytes_per_second': 'rate(' + selector + '[1m])',
                'sample_at': 'timestamp(' + selector + ')', 'samples': 'count_over_time(' + selector + '[1m])'}

    def query(self, query, start, end):
        url = self.base + '/api/v1/query_range?' + urllib.parse.urlencode({'query': query, 'start': start, 'end': end, 'step': 5, 'nocache': 1, 'latency_offset': '1s'})
        with self.opener.open(url, timeout=8) as r:
            raw = r.read(4 * 1024 * 1024 + 1)
            if r.code != 200 or len(raw) > 4 * 1024 * 1024:
                raise ValueError('invalid_vm_response')
        data = json.loads(raw)
        if data.get('status') != 'success' or data.get('isPartial') or data.get('warnings') or data.get('data', {}).get('resultType') != 'matrix':
            raise ValueError('incomplete_vm_response')
        rows = data['data']['result']
        if not isinstance(rows, list) or len(rows) > 256:
            raise ValueError('series_limit')
        return rows

    def capture(self, end=None):
        end = ((int(time.time()) - 10 if end is None else int(end)) // 5) * 5
        start = end - 900
        result = {'schema_version': 1, 'status': 'ok', 'captured_at': None,
                  'window': {'start': start, 'end': end, 'step': 5, 'rate_window': 60, 'latency_offset': '1s', 'settle_seconds': 10},
                  'scope': {'cluster': self.cluster, 'backend': 'daos'},
                  'provenance': {'data_origin': 'measured', 'simulated': False},
                  'queries': {}, 'series': []}
        began = time.monotonic()
        for direction, metric in METRICS.items():
            combined = {}
            result['queries'][direction] = self.queries(metric)
            for field, query in result['queries'][direction].items():
                if time.monotonic() - began > 25:
                    raise ValueError('capture_deadline')
                rows = self.query(query, start, end)
                seen = set()
                for row in rows:
                    labels = {k: v for k, v in row['metric'].items() if k != '__name__'}
                    if any(not labels.get(k) for k in ('cluster', 'node', 'source', 'pod', 'pool', 'rank', 'target')):
                        raise ValueError('missing_identity')
                    if labels['cluster'] != self.cluster or any(labels.get(k) != v for k, v in {'source':'gluesys','backend':'daos','data_origin':'measured','simulated':'false','job':'gpuflow-measured-daos'}.items()):
                        raise ValueError('wrong_scope')
                    # Project no identity silently: extra labels require review first.
                    if set(labels) - set(LABELS):
                        raise ValueError('unreviewed_labels')
                    key = tuple(sorted(labels.items()))
                    if key in seen:
                        raise ValueError('duplicate_series')
                    seen.add(key)
                    item = combined.setdefault(key, {'labels': labels, 'direction': direction, 'metric': metric, 'points': {}})
                    previous = None
                    if len(row['values']) > 181:
                        raise ValueError('point_limit')
                    for at, raw_value in row['values']:
                        v = float(raw_value)
                        if not math.isfinite(v) or not math.isfinite(at) or at < start or at > end or (previous is not None and at <= previous):
                            raise ValueError('invalid_point')
                        previous = at
                        item['points'].setdefault(at, {'at': at})[field] = v
            for item in combined.values():
                item['points'] = [item['points'][k] for k in sorted(item['points'])]
                result['series'].append(item)
        result['captured_at'] = dt.datetime.now(dt.timezone.utc).isoformat()
        return result

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--vm-url', required=True, help='VM raw base, including /raw when using query-gateway')
    p.add_argument('--cluster', required=True)
    p.add_argument('--output', type=Path)
    a = p.parse_args()
    raw = json.dumps(StorageVM(a.vm_url, a.cluster).capture(), ensure_ascii=False, allow_nan=False, indent=2) + '\n'
    if a.output:
        a.output.write_text(raw)
    else:
        print(raw, end='')
