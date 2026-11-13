"""Manual bounded DAOS probe on an existing client; never invoked by the web API.

Creates a uniquely owned disposable POSIX container, writes/reads 8 x 16 MiB,
checks full SHA-256, and destroys only that container. Does not restart services.
Uses existing client configuration/credentials and /dev/shm for local payloads.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time
import uuid

SIZE = 16 * 1024 * 1024
COUNT = 8

def utc():
    return dt.datetime.now(dt.timezone.utc).isoformat()

def emit(kind, **data):
    print(json.dumps(dict(kind=kind, at=utc(), **data), allow_nan=False), flush=True)

def run(args, seconds=20):
    r = subprocess.run(['timeout', '-k', '3s', str(seconds), *args],
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                       universal_newlines=True, timeout=seconds+5)
    if r.returncode:
        raise RuntimeError('command_failed_exit_' + str(r.returncode))
    return r.stdout

def response(args):
    result = json.loads(run(args))
    if result.get('status') != 0 or result.get('error'):
        raise RuntimeError('daos_response_failed')
    return result['response']

def healthy_pool(p, pool):
    if p.get('uuid') != pool or p.get('state') != 'Ready' or p.get('disabled_targets') != 0 or p.get('disabled_ranks'):
        raise RuntimeError('pool_not_ready')
    if p.get('rebuild', {}).get('state') != 'idle':
        raise RuntimeError('pool_rebuild_not_idle')
    free = {x['media_type']: x['free'] for x in p['tier_stats']}
    if free.get('scm', 0) < 256*1024*1024 or free.get('nvme', 0) < 1024*1024*1024:
        raise RuntimeError('pool_space_below_probe_reserve')

def owned(rows, label, container_id=None):
    rows = [x for x in rows if x.get('label') == label]
    if len(rows) != 1 or (container_id and rows[0].get('uuid') != container_id):
        raise RuntimeError('owned_container_identity_not_unique')
    return str(uuid.UUID(rows[0]['uuid']))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pool', required=True, type=lambda x: str(uuid.UUID(x)))
    parser.add_argument('--system', required=True)
    parser.add_argument('--control-config', default='/etc/daos/daos_control.yml')
    a = parser.parse_args()
    if not a.system or a.system.startswith('-'):
        parser.error('invalid system')
    def stop(*unused):raise RuntimeError('probe_interrupted')
    signal.signal(signal.SIGTERM, stop)
    os.nice(10)
    free = os.statvfs('/dev/shm')
    if free.f_bavail*free.f_frsize < 128*1024*1024:
        raise RuntimeError('tmpfs_space_below_probe_reserve')
    daos = ['daos', '-G', a.system]
    json_daos = ['daos', '-j', '-G', a.system]
    def listing():return response(json_daos+['container','list',a.pool])
    def pool_query():return response(['dmg','-j','-o',a.control_config,'pool','query','--show-enabled',a.pool])
    before = listing();pool_before=pool_query();healthy_pool(pool_before,a.pool)
    baseline_ids = {x['uuid'] for x in before}
    label = 'gpf-io-' + uuid.uuid4().hex
    if any(x.get('label') == label for x in before):raise RuntimeError('label_collision')
    container_id=None;created=False;attempted=False;start=time.monotonic()
    result={'started_at':utc(),'status':'running','file_bytes':SIZE,'files':COUNT,'write_bytes':0,'read_bytes':0,'operations':[],'phases':[],'cleanup':{},'container_label':label,'pool':a.pool}
    def phase(name):
        result['phases'].append({'phase':name,'at':utc()});emit('phase',phase=name)
    try:
        attempted=True
        run(daos+['container','create',a.pool,label,'--type','POSIX','--file-oclass','SX','--dir-oclass','S1','--properties','rd_fac:0'])
        container_id=owned(listing(),label);created=True;result['container_uuid']=container_id
        queried=response(json_daos+['container','query',a.pool,container_id])
        if queried.get('container_uuid')!=container_id or queried.get('health')!='HEALTHY' or queried.get('file_object_class')!='SX':raise RuntimeError('container_configuration_not_verified')
        emit('created',container_uuid=container_id,container_label=label)
        with tempfile.TemporaryDirectory(prefix='gpuflow-io-',dir='/dev/shm') as work:
            src=Path(work)/'source.bin';dst=Path(work)/'readback.bin'
            block=os.urandom(1024*1024)
            with src.open('wb') as stream:
                for _ in range(16):stream.write(block)
            digest=hashlib.sha256(src.read_bytes()).hexdigest();result['payload_sha256']=digest
            phase('idle_before');time.sleep(15)
            for operation in ['write','read']:
                phase(operation)
                for i in range(COUNT):
                    if time.monotonic()-start>210:raise RuntimeError('probe_deadline')
                    tick=time.monotonic();begin=utc();uri='daos://'+a.pool+'/'+container_id+'/file%02d.bin'%i
                    source,dest=(str(src),uri) if operation=='write' else (uri,str(dst))
                    run(daos+['filesystem','copy','--src',source,'--dst',dest])
                    row={'operation':operation,'index':i,'bytes':SIZE,'started_at':begin,'ended_at':utc(),'wall_seconds':time.monotonic()-tick}
                    if operation=='read':
                        if dst.stat().st_size!=SIZE or hashlib.sha256(dst.read_bytes()).hexdigest()!=digest:raise RuntimeError('readback_checksum_mismatch')
                        row['sha256_verified']=True;dst.unlink()
                    result['operations'].append(row);result[operation+'_bytes']+=SIZE;emit('io',**row)
                    time.sleep(max(0,4-(time.monotonic()-tick)))
                phase('settle_'+operation);time.sleep(15 if operation=='write' else 75)
            result['cleanup']['tmpfs_files_removed']=True
        result['status']='passed'
    except Exception as e:
        result['status']='failed';result['error']=str(e)
    finally:
        # A failed create may still have created this unique label. Never destroy
        # another label or a container whose UUID differs from the one observed.
        try:
            current=listing()
            if attempted and any(x.get('label')==label for x in current):
                target=owned(current,label,container_id)
                run(daos+['container','destroy',a.pool,target])
            remaining=listing()
            if any(x.get('label')==label for x in remaining):raise RuntimeError('owned_container_remains')
            if not baseline_ids.issubset({x['uuid'] for x in remaining}):raise RuntimeError('preexisting_container_missing')
            after=pool_query();healthy_pool(after,a.pool)
            if after['enabled_ranks']!=pool_before['enabled_ranks']:raise RuntimeError('pool_membership_changed')
            result['cleanup'].update(owned_container_removed=True,preexisting_containers_preserved=True,pool_membership_unchanged=True,pool_ready=True)
        except Exception as e:
            result['status']='failed';result['cleanup_error']=str(e)
        result['ended_at']=utc();emit('result',result=result)
    if result['status']!='passed':raise SystemExit(1)

if __name__=='__main__':main()
