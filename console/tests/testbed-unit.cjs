const {test}=require('node:test');
const assert=require('node:assert/strict');
const {aggregate}=require('../testbed.js');
const now=Date.now();
const origin={data_origin:'measured',simulated:false};
const node=(id='GPU-a',cluster='c',pod='p')=>({data:{id,kind:'gpu',pod,attrs:{gpu_uuid:id,cluster,node:'n',model:'A2'}},provenance:{...origin},quality:{}});
const work=(id='w')=>({data:{workload_id:id,pod:'p',ended_at:null,placement:{cluster:'c',nodes:['n'],active_gpu_uuids:['GPU-a'],registry:{state:'running',observed_at:new Date(now-1000).toISOString(),valid_until:new Date(now+60000).toISOString()}}},provenance:{...origin},quality:{binding_verified:true,registry_stale:false}});
const fixture=()=>({schema_version:1,complete:true,captured_at:new Date(now).toISOString(),nodes:[node()],workloads:[work()]});
test('measured inventory and observed relation; shared GPU counted once',()=>{const d=fixture();d.workloads.push(work('shared'));const a=aggregate(d,now);assert.equal(a.registered,1);assert.equal(a.linked,1);assert.equal(a.validJobs.length,2);});
test('simulation excluded from measured totals',()=>{const d=fixture();const s=work('sim');s.provenance={data_origin:'simulation',simulated:true};d.workloads=[s];const n=node('GPU-sim');n.provenance=s.provenance;d.nodes.push(n);const a=aggregate(d,now);assert.equal(a.registered,1);assert.equal(a.linked,0);assert.equal(a.origins.simulation,1);});
for(const [name,change] of [
 ['ended',w=>w.data.ended_at=new Date(now).toISOString()],
 ['expired',w=>w.data.placement.registry.valid_until=new Date(now-1).toISOString()],
 ['stale quality',w=>w.quality.registry_stale=true],
 ['unknown',w=>w.data.placement.registry.state='unknown'],
 ['conflict',w=>w.data.placement.registry.state='conflict'],
 ['missing UUID',w=>w.data.placement.active_gpu_uuids=['missing']],
 ['wrong node',w=>w.data.placement.nodes=['other']],
 ['wrong pod',w=>w.data.pod='other'],
 ['missing quality',w=>delete w.quality],
 ['missing provenance',w=>delete w.provenance],
 ['unknown lease',w=>w.data.placement.registry.valid_until=null],
 ['future observed',w=>w.data.placement.registry.observed_at=new Date(now+60000).toISOString()],
])test(name+' not counted',()=>{const d=fixture();change(d.workloads[0]);assert.equal(aggregate(d,now).linked,0);});
test('old snapshot gives unknown rather than zero',()=>{assert.equal(aggregate(fixture(),now+16000).linked,null);});
test('cluster/POD scope matches inventory',()=>{const d=fixture();d.nodes.push(node('GPU-b','other','p2'));assert.equal(aggregate(d,now,'other','p2').registered,1);assert.equal(aggregate(d,now,'other','p2').linked,0);});
test('ambiguous inventory not counted',()=>{const d=fixture();d.nodes.push(node());const a=aggregate(d,now);assert.equal(a.ambiguous,1);assert.equal(a.registered,0);assert.equal(a.linked,0);});
test('partial snapshot fails',()=>{const d=fixture();d.complete=false;assert.throws(()=>aggregate(d,now));});
