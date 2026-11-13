import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('probe',Path(__file__).resolve().parents[1]/'experiments/daos_io_probe.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)

class ProbeTests(unittest.TestCase):
    def test_only_owned_unique_label_and_uuid_can_be_destroyed(self):
        own='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
        rows=[{'uuid':own,'label':'probe'},{'uuid':other,'label':'existing'}]
        self.assertEqual(p.owned(rows,'probe',own),own)
        for r,label,cid in [(rows,'missing',None),(rows,'probe',other),(rows+rows,'probe',own)]:
            with self.assertRaises(RuntimeError):p.owned(r,label,cid)
    def test_degraded_rebuilding_or_low_space_pool_is_refused(self):
        good={'uuid':'pool','state':'Ready','disabled_targets':0,'disabled_ranks':[],'rebuild':{'state':'idle'},'tier_stats':[{'media_type':'scm','free':2**30},{'media_type':'nvme','free':2**31}]}
        p.healthy_pool(good,'pool')
        for update in [{'state':'Degraded'},{'disabled_targets':1},{'disabled_ranks':[0]},{'rebuild':{'state':'busy'}},{'tier_stats':[]}]:
            with self.assertRaises(RuntimeError):p.healthy_pool(dict(good,**update),'pool')
        with self.assertRaises(RuntimeError):p.healthy_pool(good,'other')
    def test_probe_is_bounded_to_128_mib_per_direction(self):
        self.assertEqual(p.COUNT*p.SIZE,128*1024*1024)

if __name__=='__main__':unittest.main()
