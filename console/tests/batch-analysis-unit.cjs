const {test}=require('node:test'),assert=require('node:assert/strict');
const {batchExecution,batchPathEvidence,batchComparison}=require('../testbed.js');
const wrap=data=>({data,provenance:{data_origin:'measured',simulated:false},quality:{}});
const time=s=>`2026-11-09T01:00:${String(s).padStart(2,'0')}Z`;
function fixture(){
 const timing={daos_copy_wall_seconds:.2,host_prepare_wall_seconds:.1,input_delay_seconds:0,h2d_wall_seconds:.01,kernel_wall_seconds:.02,kernel_gpu_seconds:.015,d2h_wall_seconds:.01,verify_wall_seconds:.02};
 const row={...timing,batch:1,status:'completed',read_bytes:33554432,input_verified:true,output_verified:true,input_sha256:'a'.repeat(64),output_sha256:'b'.repeat(64),expected_output_sha256:'b'.repeat(64),started_at:time(1),ended_at:time(2)};
 const w=wrap({workload_id:'base',pod:'pod',started_at:time(0),ended_at:time(8),placement:{cluster:'c',nodes:['j'],gpu_uuids:['GPU-g'],execution_kind:'cuda_daos_batches',execution_status:'completed',registry:{state:'completed'},progress:{status:'completed',observed_at:time(9),ended_at:time(8),expected_batches:1,kernel:'xor_bytes_257_rounds',input_delay_requested_seconds:0,failure_injection_batch:0,inter_batch_pause_seconds:1,batches:[row],totals:{...timing,completed_batches:1,verified_read_bytes:33554432}}},storage:{backend:'daos',system:'s',pool:'p',container:'k',binding:{version:1,scope:'observed_batch_io',basis:'explicit_daos_uri_readback',state:'verified_read',observed_before:time(0),pool_node_id:'pool',container_node_id:'container',membership_stable_at_endpoints:null,pool_members:[{target_id:'rank',node:'a',rank:0}],io:{bytes:33554432,checksum_verified:true,sha256:'a'.repeat(64),expected_sha256:'a'.repeat(64),client_node:'j'}}}});
 const nodes=[['GPU-g','gpu',{gpu_uuid:'GPU-g',node:'j',cluster:'c'}],['pool','storage_pool',{pool:'p',system:'s'}],['container','storage_container',{pool:'p',container:'k',system:'s'}],['rank','storage_target',{node:'a',rank:0}]].map(([id,kind,attrs])=>wrap({id,kind,attrs}));
 const d={complete:true,nodes,edges:[['container','contains'],['rank','member']].map(([to_id,link])=>wrap({from_id:'pool',to_id,link})),workloads:[w]};
 return {d,w};
}
test('verified output differs from input; endpoint membership stays unknown',()=>{const {d,w}=fixture();assert.equal(batchExecution(w).verified,true);assert.equal(batchPathEvidence(d,w).membership,'before_only');});
const invalid={
 'input hash mismatch':(d,w)=>w.data.placement.progress.batches[0].input_sha256='c'.repeat(64),
 'output mismatch':(d,w)=>w.data.placement.progress.batches[0].output_sha256='c'.repeat(64),
 'bad total':(d,w)=>w.data.placement.progress.totals.completed_batches=9,
 'simulation':(d,w)=>w.provenance.simulated=true,
 'batch zero':(d,w)=>w.data.placement.progress.batches[0].batch=0,
 'out of bounds':(d,w)=>w.data.placement.progress.batches[0].batch=2,
 'bad time':(d,w)=>w.data.placement.progress.batches[0].ended_at=time(10),
 'terminal mismatch':(d,w)=>w.data.placement.registry.state='failed',
 'partial normal completion':(d,w)=>w.data.placement.progress.expected_batches=2,
 'unknown kernel':(d,w)=>w.data.placement.progress.kernel='unknown',
 'missing condition':(d,w)=>delete w.data.placement.progress.input_delay_requested_seconds,
 'null batch':(d,w)=>w.data.placement.progress.batches[0]=null,
 'node mismatch':(d,w)=>w.data.placement.nodes=['other'],
 'duplicate GPU':(d,w)=>d.nodes.push(structuredClone(d.nodes[0])),
 'missing member edge':(d,w)=>d.edges.pop(),
 'missing GPU':(d,w)=>d.nodes.shift(),
 'incomplete topology':(d,w)=>d.complete=false,
 'future membership':(d,w)=>w.data.storage.binding.observed_before=time(5),
};
for(const [name,fn] of Object.entries(invalid))test(name,()=>{const {d,w}=fixture();fn(d,w);assert.equal(batchPathEvidence(d,w).verified,false);});
test('missing comparison condition is null, not zero',()=>{const {d}=fixture();const v=batchComparison(d,'base');assert(v.verified);assert.equal(v.cases.delayed,null);assert.equal(v.cases.baseline.means.daos_copy_wall_seconds,.2);});
test('separate membership failure does not erase successful processing',()=>{const {d,w}=fixture();d.edges=[];assert(batchExecution(w).verified);assert.equal(batchPathEvidence(d,w).verified,false);});
test('different input cannot be compared',()=>{const {d,w}=fixture();const x=structuredClone(w);x.data.workload_id='other';x.data.placement.progress.input_delay_requested_seconds=1;x.data.storage.binding.io.sha256=x.data.storage.binding.io.expected_sha256=x.data.placement.progress.batches[0].input_sha256='c'.repeat(64);d.workloads.push(x);assert.equal(batchComparison(d,'base').cases.delayed,null);});
test('duplicate workload ID cannot be selected',()=>{const {d,w}=fixture();d.workloads.push(structuredClone(w));assert.equal(batchComparison(d,'base').verified,false);});
test('selected historical case wins over latest same condition',()=>{const {d,w}=fixture();const x=structuredClone(w);x.data.workload_id='new';x.data.ended_at=x.data.placement.progress.ended_at=time(9);x.data.placement.progress.observed_at=time(10);d.workloads.push(x);assert.equal(batchComparison(d,'base').cases.baseline.workload.workload_id,'base');});
test('failed partial time is excluded from success mean',()=>{const {d,w}=fixture(),p=w.data.placement,q=p.progress;p.execution_status=p.registry.state=q.status='failed';q.expected_batches=3;q.failure_injection_batch=2;q.batches.push({batch:2,status:'failed',error:'daos_read_failed',started_at:time(3),ended_at:time(4),daos_copy_wall_seconds:.9});const v=batchComparison(d,'base');assert(v.verified);assert.equal(v.cases.failed.means.daos_copy_wall_seconds,.2);assert.equal(v.cases.failed.failed[0].daos_copy_wall_seconds,.9);});
test('running work may show completed path, never terminal comparison',()=>{const {d,w}=fixture();w.data.ended_at=null;w.data.placement.progress.status='running';assert(batchPathEvidence(d,w).verified);assert.equal(batchComparison(d,'base').verified,false);});
