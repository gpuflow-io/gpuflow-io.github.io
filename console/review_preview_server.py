"""Loopback preview adapter for existing APIs; never exposes a browser token.

Reference implementation, not an installed service. Run with API URL and a
local token file. No equipment mutation or arbitrary upstream path is exposed.
"""
import argparse
import datetime as dt
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request

LISTS = ('policies', 'policy-history', 'scorecard-runs')

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        raise ValueError('upstream_redirect')

class API:
    def __init__(self, base, token):
        u=urllib.parse.urlsplit(base)
        if u.scheme not in ('http','https') or not u.hostname or u.username or u.password or u.query or u.fragment:
            raise ValueError('invalid_api_url')
        if not token or any(x in token for x in '\r\n'):
            raise ValueError('invalid_token')
        self.base,self.token=base.rstrip('/'),token
        self.opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())

    def request(self, path, body=None):
        headers={'Accept':'application/json','Authorization':'Bearer '+self.token}
        payload=None
        if body is not None:
            payload=json.dumps(body).encode();headers['Content-Type']='application/json'
        req=urllib.request.Request(self.base+path,headers=headers,data=payload)
        try: response=self.opener.open(req,timeout=10)
        except urllib.error.HTTPError as e: response=e
        with response:
            raw=response.read(2*1024*1024+1);status=response.code
        if len(raw)>2*1024*1024: raise ValueError('response_too_large')
        data=json.loads(raw)
        if not isinstance(data,dict): raise ValueError('invalid_response')
        return status,data

    def collect(self, resource):
        if resource not in LISTS+('workloads','topology-nodes','topology-edges'):raise ValueError('invalid_resource')
        items=[];seen=set();cursor='';started=time.monotonic()
        for _ in range(50):
            if time.monotonic()-started>20:raise ValueError('collection_timeout')
            params={'page_size':200}
            if cursor:params['cursor']=cursor
            status,data=self.request('/v1/'+resource+'?'+urllib.parse.urlencode(params))
            if status!=200 or data.get('backend')!='postgres_read_only' or not isinstance(data.get('items'),list):raise ValueError('upstream_list_failed')
            if any(not isinstance(x,dict) or not isinstance(x.get('data'),dict) or not isinstance(x.get('provenance'),dict) or not isinstance(x.get('quality'),dict) for x in data['items']):raise ValueError('invalid_record')
            items.extend(data['items']);cursor=data.get('next_cursor')
            if cursor=='':return {'items':items,'next_cursor':'','backend':'postgres_read_only','complete':True,'captured_at':dt.datetime.now(dt.timezone.utc).isoformat()}
            if not isinstance(cursor,str) or cursor in seen:raise ValueError('invalid_cursor')
            seen.add(cursor)
        raise ValueError('page_limit')

    def snapshot(self):
        result={'schema_version':1,'complete':True,'snapshot_consistent':False,'captured_at':dt.datetime.now(dt.timezone.utc).isoformat(),'source':'review_api_read_only'}
        for resource,key in [('workloads','workloads'),('topology-nodes','nodes'),('topology-edges','edges')]:result[key]=self.collect(resource)['items']
        return result

    def review_resources(self):
        result={}
        for name in LISTS:
            try:result[name]=self.collect(name)
            except Exception:result[name]={'error':{'code':'UPSTREAM_UNAVAILABLE'},'complete':False}
        return result

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def allowed(self):
        host=self.headers.get('Host','').split(':')[0]
        return host in ('localhost','127.0.0.1') and self.headers.get('Sec-Fetch-Site')!='cross-site' and self.headers.get('Origin') in (None,'http://'+self.headers.get('Host',''))
    def reply(self,status,data,mime='application/json; charset=utf-8'):
        raw=json.dumps(data,ensure_ascii=False,allow_nan=False).encode() if isinstance(data,dict) else data
        self.send_response(status)
        for key,value in [('Content-Type',mime),('Content-Length',str(len(raw))),('Cache-Control','no-store'),('X-Content-Type-Options','nosniff')]:self.send_header(key,value)
        self.end_headers();self.wfile.write(raw)
    def do_GET(self):
        if not self.allowed():return self.reply(403,{'error':{'code':'FORBIDDEN'}})
        p=urllib.parse.urlsplit(self.path)
        try:
            if p.path=='/testbed-api/snapshot':return self.reply(200,self.server.api.snapshot())
            if p.path=='/testbed-api/review-resources':return self.reply(200,self.server.api.review_resources())
            if p.path=='/testbed-api/workload-series':return self.reply(503,{'error':{'code':'SERIES_ADAPTER_NOT_CONFIGURED'}})
            if p.path=='/testbed-api/storage-series':
                if p.query:return self.reply(400,{'error':{'code':'INVALID_ARGUMENT'}})
                if not getattr(self.server,'storage',None):return self.reply(503,{'error':{'code':'STORAGE_ADAPTER_NOT_CONFIGURED'}})
                with self.server.storage_lock:
                    if time.monotonic()-self.server.storage_cached_at>5:
                        self.server.storage_cache=self.server.storage.capture()
                        self.server.storage_cached_at=time.monotonic()
                    return self.reply(200,self.server.storage_cache)
            if p.path=='/testbed-api/storage-ops':
                if p.query:return self.reply(400,{'error':{'code':'INVALID_ARGUMENT'}})
                if not getattr(self.server,'storage',None):return self.reply(503,{'error':{'code':'STORAGE_ADAPTER_NOT_CONFIGURED'}})
                with self.server.storage_ops_lock:
                    if time.monotonic()-self.server.storage_ops_cached_at>5:
                        self.server.storage_ops_cache=self.server.storage.capture(kind='ops')
                        self.server.storage_ops_cached_at=time.monotonic()
                    return self.reply(200,self.server.storage_ops_cache)
            files={'/storage-extra.js':'storage-extra.js','/storage.js':'storage.js','/':'index.html','/index.html':'index.html','/testbed.js':'testbed.js','/mapping.js':'mapping.js','/review.js':'review.js','/testbed.css':'testbed.css','/review.css':'review.css','/review-contracts.json':'review-contracts.json'}
            if p.path not in files:return self.reply(404,{'error':{'code':'NOT_FOUND'}})
            name=files[p.path];mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'}[Path(name).suffix]
            return self.reply(200,(self.server.root/name).read_bytes(),mime+'; charset=utf-8')
        except Exception:return self.reply(503,{'error':{'code':'UPSTREAM_UNAVAILABLE'}})
    def do_POST(self):
        if not self.allowed():return self.reply(403,{'error':{'code':'FORBIDDEN'}})
        if self.path!='/testbed-api/llm':return self.reply(404,{'error':{'code':'NOT_FOUND'}})
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=4096:raise ValueError()
            body=json.loads(self.rfile.read(size))
            if set(body)!={'question_id','scenario'} or body['question_id'] not in ('Q01','Q02','Q03') or body['scenario'] not in ('normal','no_evidence','timeout'):raise ValueError()
        except Exception:return self.reply(400,{'error':{'code':'INVALID_ARGUMENT'}})
        try:
            status,result=self.server.api.request('/v1/llm/explain',body)
            return self.reply(status,result)
        except Exception:return self.reply(503,{'error':{'code':'UPSTREAM_UNAVAILABLE'}})

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--api-url',required=True);parser.add_argument('--token-file',type=Path,required=True);parser.add_argument('--port',type=int,default=8000);parser.add_argument('--vm-url');parser.add_argument('--storage-cluster');a=parser.parse_args()
    server=ThreadingHTTPServer(('127.0.0.1',a.port),Handler);server.api=API(a.api_url,a.token_file.read_text().strip());server.root=Path(__file__).parent
    if bool(a.vm_url)!=bool(a.storage_cluster):parser.error('--vm-url and --storage-cluster must be set together')
    if a.vm_url:
        import threading
        from storage_query import StorageVM
        server.storage=StorageVM(a.vm_url,a.storage_cluster);server.storage_lock=threading.Lock();server.storage_cached_at=-float('inf');server.storage_ops_lock=threading.Lock();server.storage_ops_cached_at=-float('inf')
    server.serve_forever()
if __name__=='__main__':main()
