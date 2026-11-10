const {test}=require('node:test');const assert=require('node:assert/strict');
const {pathEvidence}=require('../testbed.js');
const sha='a'.repeat(64),stamp='2026-11-08T00:00:00Z';
function fixture(){
 const item=data=>({data,provenance:{data_origin:'measured',simulated:false},quality:{}});
 const w=item({workload_id:'w',started_at:stamp,ended_at:stamp,pod:'p',
  placement:{execution_kind:'cuda_daos_host_bounce',execution_status:'completed',gpu_uuids:['GPU-g'],nodes:['j'],cluster:'c'},
  storage:{backend:'daos',system:'s',pool:'p',container:'k',binding:{version:1,state:'verified_read',scope:'completed_io_evidence',basis:'explicit_daos_uri_readback',membership_stable_at_endpoints:true,
    pool_node_id:'pool',container_node_id:'container',pool_members:[{target_id:'rank',node:'a',rank:0}],
    io:{checksum_verified:true,bytes:32,sha256:sha,expected_sha256:sha,client_node:'j'},
    transfer:{path:'host_bounce',gds:false,roundtrip_verified:true,cuda_device_verified:true,bytes:32,host_sha256:sha,device_readback_sha256:sha,gpu_uuid:'GPU-g',read_started_at:stamp,read_ended_at:stamp,transfer_started_at:stamp,transfer_ended_at:stamp}}}});
 const nodes=[['GPU-g','gpu',{gpu_uuid:'GPU-g',node:'j',cluster:'c'}],['pool','storage_pool',{pool:'p',system:'s'}],['container','storage_container',{pool:'p',container:'k',system:'s'}],['rank','storage_target',{node:'a',rank:0}]].map(([id,kind,attrs])=>item({id,kind,attrs}));
 const edges=[['container','contains'],['rank','member']].map(([to_id,link])=>item({from_id:'pool',to_id,link}));
 return {d:{complete:true,nodes,edges},w};
}
test('completed DAOS -> host -> GPU evidence',()=>{const {d,w}=fixture();assert.equal(pathEvidence(d,w).verified,true);});
const cases={
 'partial inventory':(d,w)=>d.complete=false,
 'simulation':(d,w)=>w.provenance.data_origin='simulation',
 'GPU-only workload':(d,w)=>w.data.placement.execution_kind='cuda_memory_smoke',
 'unfinished':(d,w)=>w.data.ended_at=null,
 'storage checksum mismatch':(d,w)=>w.data.storage.binding.io.sha256='b'.repeat(64),
 'device checksum mismatch':(d,w)=>w.data.storage.binding.transfer.device_readback_sha256='b'.repeat(64),
 'GPU UUID mismatch':(d,w)=>w.data.placement.gpu_uuids=['GPU-other'],
 'unsupported GDS claim':(d,w)=>w.data.storage.binding.transfer.gds=true,
 'bad time order':(d,w)=>w.data.storage.binding.transfer.read_ended_at='2027-01-01T00:00:00Z',
 'missing GPU inventory':(d,w)=>d.nodes.shift(),
 'duplicate inventory':(d,w)=>d.nodes.push(structuredClone(d.nodes[0])),
 'missing pool membership':(d,w)=>d.edges.pop(),
 'wrong rank':(d,w)=>w.data.storage.binding.pool_members[0].rank=1,
};
for(const [name,mutate] of Object.entries(cases))test(name,()=>{const {d,w}=fixture();mutate(d,w);assert.equal(pathEvidence(d,w).verified,false);});
