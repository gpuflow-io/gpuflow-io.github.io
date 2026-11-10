import importlib.util
import json
from pathlib import Path
import threading
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer

spec=importlib.util.spec_from_file_location('gateway',Path(__file__).resolve().parents[1]/'review_preview_server.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)

class Upstream(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def reply(self,status,data):
        raw=json.dumps(data).encode();self.send_response(status);self.end_headers();self.wfile.write(raw)
    def do_GET(self):
        self.server.seen.append((self.path,self.headers.get('Authorization')))
        if self.server.mode=='redirect':self.send_response(302);self.send_header('Location','/sink');self.end_headers();return
        if self.server.mode=='failure' and 'policy-history' in self.path:return self.reply(500,{'error':{}})
        resource=self.path.split('?')[0].split('/')[-1]
        item={'data':{'policy':'sample','indicator':'host_cpu','resource':resource},'provenance':{'data_origin':'simulation','simulated':True},'quality':{}}
        next_cursor='repeat' if self.server.mode=='repeat' or 'cursor=' not in self.path else ''
        self.reply(200,{'items':[item],'backend':'postgres_read_only','next_cursor':next_cursor})
    def do_POST(self):
        self.server.seen.append((self.path,self.headers.get('Authorization')))
        body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        if body['scenario']=='timeout':return self.reply(504,{'error':{'code':'DEADLINE_EXCEEDED'}})
        self.reply(200,{'mock':True,'response':{'question_id':body['question_id'],'status':'no_evidence' if body['scenario']=='no_evidence' else 'ok'}})

class GatewayTests(unittest.TestCase):
    def setUp(self):
        self.up=ThreadingHTTPServer(('127.0.0.1',0),Upstream);self.up.seen=[];self.up.mode='normal'
        self.gateway=ThreadingHTTPServer(('127.0.0.1',0),g.Handler);self.gateway.api=g.API('http://127.0.0.1:'+str(self.up.server_port),'test-backend-only');self.gateway.root=Path(__file__).resolve().parents[1]
        self.threads=[threading.Thread(target=s.serve_forever,daemon=True) for s in [self.up,self.gateway]]
        for t in self.threads:t.start()
        self.base='http://127.0.0.1:'+str(self.gateway.server_port)
    def tearDown(self):
        for s in [self.up,self.gateway]:s.shutdown();s.server_close()
        for t in self.threads:t.join()
    def request(self,path,body=None,headers=None):
        req=urllib.request.Request(self.base+path,data=json.dumps(body).encode() if body is not None else None,headers=headers or {})
        try:r=urllib.request.urlopen(req)
        except urllib.error.HTTPError as e:r=e
        with r:return r.code,json.loads(r.read())
    def test_lists_paginate_and_keep_provenance_backend_only_token(self):
        code,resources=self.request('/testbed-api/review-resources');self.assertEqual(code,200)
        for env in resources.values():self.assertTrue(env['complete']);self.assertEqual(len(env['items']),2);self.assertEqual(env['next_cursor'],'');self.assertEqual(env['items'][0]['provenance']['data_origin'],'simulation')
        self.assertTrue(all(auth=='Bearer test-backend-only' for _,auth in self.up.seen));self.assertNotIn('test-backend-only',json.dumps(resources))
    def test_repeated_cursor_is_failure_not_partial_success(self):
        self.up.mode='repeat';_,resources=self.request('/testbed-api/review-resources');self.assertTrue(all(e['complete'] is False and 'error' in e for e in resources.values()))
    def test_one_failed_list_is_not_an_empty_success(self):
        self.up.mode='failure';_,r=self.request('/testbed-api/review-resources');self.assertIn('error',r['policy-history']);self.assertTrue(r['policies']['complete'])
    def test_redirect_never_follows_with_token(self):
        self.up.mode='redirect';_,r=self.request('/testbed-api/review-resources');self.assertTrue(all('error' in e for e in r.values()));self.assertFalse(any(path=='/sink' for path,_ in self.up.seen))
    def test_llm_preserves_504_and_mock(self):
        code,r=self.request('/testbed-api/llm',{'question_id':'Q01','scenario':'timeout'});self.assertEqual(code,504);self.assertEqual(r['error']['code'],'DEADLINE_EXCEEDED')
        code,r=self.request('/testbed-api/llm',{'question_id':'Q03','scenario':'normal'});self.assertEqual(code,200);self.assertTrue(r['mock'])
        code,r=self.request('/testbed-api/llm',{'question_id':'Q02','scenario':'no_evidence'});self.assertEqual(code,200);self.assertEqual(r['response']['status'],'no_evidence')
    def test_no_arbitrary_equipment_actions_or_origin(self):
        self.assertEqual(self.request('/testbed-api/llm',{'question_id':'SQL','scenario':'normal'})[0],400)
        self.assertEqual(self.request('/v1/policy-demo-sessions',{'policy':'x'})[0],404)
        self.assertEqual(self.request('/testbed-api/llm',{'question_id':'Q01','scenario':'normal'},{'Origin':'https://example.invalid'})[0],403)
        self.assertEqual(self.up.seen,[])
if __name__=='__main__':unittest.main()
