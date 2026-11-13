import importlib.util
import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from storage_query import StorageVM

class StorageTests(unittest.TestCase):
    def setUp(self):
        self.vm=StorageVM('http://127.0.0.1:8428/raw','test"cluster')
        self.label={'cluster':'test"cluster','node':'node','source':'gluesys','pod':'group','pool':'pool','rank':'0','target':'0','backend':'daos','data_origin':'measured','simulated':'false','job':'gpuflow-measured-daos'}
    def fake(self,q,start,end):
        value=1 if q.startswith('count_') else end if q.startswith('timestamp') else 0
        return [{'metric':dict(self.label),'values':[[end,str(value)]]}]
    def test_fixed_query_scope_and_escape(self):
        q=self.vm.queries('test')['counter'];self.assertIn('cluster="test\\"cluster"',q);self.assertIn('job="gpuflow-measured-daos"',q)
    def test_alignment_and_bounded_capture(self):
        seen=[]
        def query(q,start,end):seen.append((start,end));return self.fake(q,start,end)
        self.vm.query=query;e=self.vm.capture(10003)
        self.assertEqual(len(seen),8);self.assertEqual(e['window']['end'],10000);self.assertEqual(len(e['series']),2)
        self.assertEqual(e['series'][0]['points'][0]['bytes_per_second'],0)
    def test_duplicate_and_unknown_labels_rejected(self):
        for mutation in ['duplicate','label','source','nan']:
            def query(q,start,end):
                r=self.fake(q,start,end)
                if mutation=='duplicate':r.append(r[0])
                if mutation=='label':r[0]['metric']['unreviewed']='x'
                if mutation=='source':r[0]['metric']['source']='keti'
                if mutation=='nan':r[0]['values'][0][1]='NaN'
                return r
            self.vm.query=query
            with self.assertRaises(ValueError):self.vm.capture(10000)
    def test_credentials_and_invalid_urls_not_accepted(self):
        for url in ['file:///tmp/vm','http://user:secret@example.test','http://example.test?token=x']:
            with self.assertRaises(ValueError):StorageVM(url,'cluster')
    def test_missing_series_is_not_zero(self):
        self.vm.query=lambda *args:[]
        self.assertEqual(self.vm.capture(10000)['series'],[])

    def test_ops_capture_keeps_operation_and_uses_rpc_rate_field(self):
        def query(q,start,end):
            rows=self.fake(q,start,end)
            rows[0]['metric']['operation']='read' if 'operation="read"' in q else 'write'
            return rows
        self.vm.query=query
        result=self.vm.capture(10000,kind='ops')
        self.assertEqual(result['kind'],'daos_rpc_ops')
        self.assertEqual(len(result['series']),2)
        self.assertIn('ops_per_second',result['series'][0]['points'][0])
        self.assertNotIn('bytes_per_second',result['series'][0]['points'][0])
    def test_ops_rejects_missing_direction(self):
        self.vm.query=self.fake
        with self.assertRaises(ValueError):self.vm.capture(10000,kind='ops')
if __name__=='__main__':unittest.main()
