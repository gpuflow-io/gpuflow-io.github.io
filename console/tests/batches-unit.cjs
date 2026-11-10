const {test}=require('node:test'),assert=require('node:assert/strict');
const {batchSummary}=require('../testbed.js');
function fixture(){
 const b={batch:1,status:'completed',read_bytes:33554432,input_verified:true,output_verified:true,output_sha256:'a'.repeat(64),expected_output_sha256:'a'.repeat(64)};
 const timing={daos_copy_wall_seconds:.2,host_prepare_wall_seconds:.1,input_delay_seconds:1,h2d_wall_seconds:.01,kernel_wall_seconds:.02,kernel_gpu_seconds:.015,d2h_wall_seconds:.01,verify_wall_seconds:.02};Object.assign(b,timing);
 return {provenance:{data_origin:'measured',simulated:false},quality:{},data:{placement:{execution_kind:'cuda_daos_batches',progress:{batches:[b],totals:{...timing,completed_batches:1,verified_read_bytes:33554432}}}}};
}
test('batch instrumented totals',()=>assert.equal(batchSummary(fixture()).bytes,33554432));
for(const [name,mutate] of Object.entries({
 'wrong source':x=>x.provenance.data_origin='simulation',
 'missing progress':x=>delete x.data.placement.progress,
 'duplicate batch':x=>x.data.placement.progress.batches.push(x.data.placement.progress.batches[0]),
 'bad output checksum':x=>x.data.placement.progress.batches[0].output_sha256='b'.repeat(64),
 'unverified input':x=>x.data.placement.progress.batches[0].input_verified=false,
 'NaN time':x=>x.data.placement.progress.batches[0].kernel_gpu_seconds=NaN,
 'negative time':x=>x.data.placement.progress.batches[0].h2d_wall_seconds=-1,
 'incorrect aggregate':x=>x.data.placement.progress.totals.verified_read_bytes=0,
 'incorrect kernel sum':x=>x.data.placement.progress.totals.kernel_gpu_seconds=99,
})){test(name,()=>{const x=fixture();mutate(x);assert.equal(batchSummary(x),null);});}
test('failed batch keeps partial values but does not inflate completed totals',()=>{const x=fixture();x.data.placement.progress.batches.push({batch:2,status:'failed',daos_copy_wall_seconds:.3});assert.equal(batchSummary(x).completed,1);});
