(function(root) {
  'use strict';
  const measured = x => x?.provenance?.data_origin === 'measured' && x.provenance.simulated === false &&
    !x.quality?.provenance_conflict && !x.quality?.provenance_invalid && !x.quality?.origin_unknown;
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function aggregate(data, now=Date.now(), cluster='', pod='') {
    if(data?.schema_version!==1 || data.complete!==true || !Array.isArray(data.nodes) || !Array.isArray(data.workloads)) throw Error('불완전한 조회 결과');
    const captured=Date.parse(data.captured_at), fresh=Number.isFinite(captured) && captured<=now+5000 && now-captured<15000;
    const all=data.nodes.filter(x=>measured(x)&&x.data?.kind==='gpu'&&x.data.attrs?.cluster&&x.data.attrs?.node&&x.data.attrs?.gpu_uuid===x.data.id);
    const selected=all.filter(x=>(!cluster||x.data.attrs.cluster===cluster)&&(!pod||x.data.pod===pod));
    const inventory=new Map(), ambiguous=new Set();
    for(const item of selected){const k=item.data.attrs.cluster+'|'+item.data.id;if(inventory.has(k))ambiguous.add(k);inventory.set(k,item);}
    for(const k of ambiguous)inventory.delete(k);
    const counted=new Set(), validJobs=[], rejected=[];
    const scoped=data.workloads.filter(x=>measured(x)&&(!cluster||x.data?.placement?.cluster===cluster)&&(!pod||x.data?.pod===pod));
    for(const item of scoped){
      const w=item.data,p=w.placement||{},r=p.registry||{};
      if(w.ended_at)continue;
      const expires=Date.parse(r.valid_until), observed=Date.parse(r.observed_at);
      if(!fresh || !item.quality || item.quality.binding_verified!==true || item.quality.registry_stale!==false ||
          r.state!=='running' || r.terminal===true || !Number.isFinite(expires)||expires<=now ||
          !Number.isFinite(observed)||observed>now+5000||observed>expires){rejected.push({id:w.workload_id,reason:'관계 미확인·만료'});continue;}
      const ids=p.active_gpu_uuids;
      if(!Array.isArray(ids)||!ids.length||!Array.isArray(p.nodes)||!p.cluster){rejected.push({id:w.workload_id,reason:'GPU 식별 정보 누락'});continue;}
      const keys=ids.map(id=>p.cluster+'|'+id);
      if(keys.some(k=>!inventory.has(k)||!p.nodes.includes(inventory.get(k).data.attrs.node)||w.pod!==inventory.get(k).data.pod)){
        rejected.push({id:w.workload_id,reason:'인벤토리 연결 불일치'});continue;
      }
      keys.forEach(k=>counted.add(k));validJobs.push(w.workload_id);
    }
    const origins={measured:0,simulation:0,replay:0,backfill:0,unknown:0};
    data.workloads.forEach(x=>{const k=x.provenance?.data_origin;origins[Object.hasOwn(origins,k)?k:'unknown']++;});
    return {fresh,inventory:[...inventory.values()],registered:inventory.size,ambiguous:ambiguous.size,
      linked:fresh?counted.size:null,validJobs,rejected,origins,scoped,
      clusters:[...new Set(all.map(x=>x.data.attrs.cluster))].sort(),
      pods:[...new Set(all.filter(x=>!cluster||x.data.attrs.cluster===cluster).map(x=>x.data.pod))].filter(Boolean).sort()};
  }
  // Snapshot relationships are evaluated at observation time, never at the viewer's clock.
  function observationTime(data, mode, now=Date.now()) {
    return mode==='snapshot'?Date.parse(data?.captured_at):now;
  }
  function overviewModel(data, mode='snapshot', filters={}, now=Date.now()) {
    const at=observationTime(data,mode,now),base=aggregate(data,at);
    const rackOf=x=>x.data.rack||x.data.attrs?.rack||'(미등록)';
    const within=x=>(!filters.cluster||x.data.attrs?.cluster===filters.cluster)&&(!filters.pod||x.data.pod===filters.pod);
    const byRack=x=>within(x)&&(!filters.rack||rackOf(x)===filters.rack);
    const chosen=x=>byRack(x)&&(!filters.node||x.data.attrs?.node===filters.node);
    // Validate relationships against the full inventory before narrowing a multi-node job.
    const inventory=base.inventory.filter(chosen),keys=new Set(inventory.map(x=>x.data.attrs.cluster+'|'+x.data.id));
    const scoped=base.scoped.filter(x=>{
      const w=x.data,p=w.placement||{};
      return (!filters.cluster||p.cluster===filters.cluster)&&(!filters.pod||w.pod===filters.pod)&&
        (!filters.node||(p.nodes||[]).includes(filters.node))&&(!filters.rack||inventory.some(n=>n.data.attrs.cluster===p.cluster&&(p.nodes||[]).includes(n.data.attrs.node)));
    });
    const valid=scoped.filter(w=>base.validJobs.includes(w.data.workload_id));
    const linked=new Set(valid.flatMap(w=>(w.data.placement.active_gpu_uuids||[]).map(id=>w.data.placement.cluster+'|'+id)).filter(k=>keys.has(k)));
    const unique=new Map(),duplicates=new Set();
    for(const row of data.nodes.filter(measured)){
      const k=row.data.attrs?.cluster+'|'+row.data.id;
      if(unique.has(k))duplicates.add(k);unique.set(k,row);
    }
    for(const k of duplicates)unique.delete(k);
    const topology=[...unique.values()].filter(x=>!filters.cluster||x.data.attrs?.cluster===filters.cluster);
    const storage=topology.filter(x=>['storage_pool','storage_container','storage_target'].includes(x.data.kind));
    const pods=[...new Set(base.inventory.filter(x=>!filters.cluster||x.data.attrs.cluster===filters.cluster).map(x=>x.data.pod).filter(Boolean))].sort();
    return {...base,at,inventory,registered:inventory.length,scoped,linked:base.fresh?linked.size:null,
      validJobs:valid.map(w=>w.data.workload_id),pods,topology,storage,
      racks:[...new Set(base.inventory.filter(within).map(rackOf))].sort(),
      nodes:[...new Set(base.inventory.filter(byRack).map(x=>x.data.attrs.node))].sort(),
      podSummaries:[...new Set(inventory.map(x=>x.data.attrs.cluster+'|'+x.data.pod))].map(k=>{
        const rows=inventory.filter(x=>x.data.attrs.cluster+'|'+x.data.pod===k);
        return {cluster:rows[0].data.attrs.cluster,pod:rows[0].data.pod,gpus:rows.length,nodes:new Set(rows.map(x=>x.data.attrs.node)).size};
      })};
  }
  function pathEvidence(data,item){
    const fail=reason=>({verified:false,reason});
    if(data?.complete!==true||!Array.isArray(data.nodes))return fail('불완전한 인벤토리 조회입니다.');
    if(!item||!measured(item))return fail('실측 작업을 선택하세요.');
    const w=item.data,p=w.placement||{},s=w.storage||{},b=s.binding||{},io=b.io||{},t=b.transfer||{};
    if(p.execution_kind!=='cuda_daos_host_bounce')return fail('이 작업의 GPU–DAOS 전달 근거가 없습니다.');
    if(!w.ended_at||p.execution_status!=='completed')return fail('정상 완료된 전달 검증이 아닙니다.');
    if(s.backend!=='daos'||!s.pool||!s.container||b.version!==1||b.state!=='verified_read'||b.scope!=='completed_io_evidence'||b.basis!=='explicit_daos_uri_readback'||b.membership_stable_at_endpoints!==true)return fail('스토리지 사용 근거가 불완전합니다.');
    if(io.checksum_verified!==true||!Number.isSafeInteger(io.bytes)||io.bytes<=0||!/^[a-f0-9]{64}$/.test(io.sha256)||io.sha256!==io.expected_sha256)return fail('DAOS 읽기 체크섬을 확인하지 못했습니다.');
    if(t.path!=='host_bounce'||t.gds!==false||t.roundtrip_verified!==true||t.cuda_device_verified!==true||t.bytes!==io.bytes||t.host_sha256!==io.sha256||t.device_readback_sha256!==io.sha256)return fail('GPU 전달·재조회 근거가 불일치합니다.');
    if(!Array.isArray(p.gpu_uuids)||p.gpu_uuids.length!==1||p.gpu_uuids[0]!==t.gpu_uuid||!Array.isArray(p.nodes)||p.nodes.length!==1||p.nodes[0]!==io.client_node)return fail('실행 노드·GPU 식별자가 불일치합니다.');
    const times=[w.started_at,t.read_started_at,t.read_ended_at,t.transfer_started_at,t.transfer_ended_at,w.ended_at].map(Date.parse);
    if(times.some((v,i)=>!Number.isFinite(v)||(i&&v<times[i-1])))return fail('실행 구간 근거가 불일치합니다.');
    const unique=(id,kind,fields)=>{const rows=data.nodes.filter(i=>i.data.id===id);return rows.length===1&&measured(rows[0])&&rows[0].data.kind===kind&&Object.entries(fields).every(([k,v])=>rows[0].data.attrs?.[k]===v);};
    if(!unique(t.gpu_uuid,'gpu',{gpu_uuid:t.gpu_uuid,node:io.client_node,cluster:p.cluster})||!unique(b.pool_node_id,'storage_pool',{pool:s.pool,system:s.system})||!unique(b.container_node_id,'storage_container',{pool:s.pool,container:s.container,system:s.system}))return fail('등록 인벤토리에서 경로를 확인하지 못했습니다.');
    const members=b.pool_members;
    if(!Array.isArray(members)||!members.length||new Set(members.map(m=>m.target_id)).size!==members.length||!Array.isArray(data.edges))return fail('Pool 구성원 연결 근거가 없습니다.');
    const edge=(to,link)=>data.edges.filter(e=>measured(e)&&e.data.from_id===b.pool_node_id&&e.data.to_id===to&&e.data.link===link).length===1;
    if(!edge(b.container_node_id,'contains')||members.some(m=>!unique(m.target_id,'storage_target',{node:m.node,rank:m.rank})||!edge(m.target_id,'member')))return fail('Pool 구성원 토폴로지가 불일치합니다.');
    return {verified:true,workload:w,storage:s,binding:b,transfer:t,io};
  }
  const batchFields=['daos_copy_wall_seconds','host_prepare_wall_seconds','input_delay_seconds','h2d_wall_seconds','kernel_wall_seconds','kernel_gpu_seconds','d2h_wall_seconds','verify_wall_seconds'];
  function batchSummary(item){
    const p=item?.data?.placement,q=p?.progress;
    if(!measured(item)||p?.execution_kind!=='cuda_daos_batches'||!q||!Array.isArray(q.batches)||!q.totals)return null;
    const totals=Object.fromEntries(batchFields.map(k=>[k,0]));let bytes=0,n=0;const ids=new Set();
    for(const b of q.batches){
      if(!b||!Number.isInteger(b.batch)||ids.has(b.batch)||!['completed','failed'].includes(b.status))return null;ids.add(b.batch);
      if(b.status==='failed')continue;
      if(b.input_verified!==true||b.output_verified!==true||b.read_bytes!==33554432||b.output_sha256!==b.expected_output_sha256||!/^[a-f0-9]{64}$/.test(b.output_sha256))return null;
      for(const k of batchFields){if(!Number.isFinite(b[k])||b[k]<0)return null;totals[k]+=b[k];}
      bytes+=b.read_bytes;n++;
    }
    if(q.totals.completed_batches!==n||q.totals.verified_read_bytes!==bytes||batchFields.some(k=>!Number.isFinite(q.totals[k])||Math.abs(q.totals[k]-totals[k])>1e-7))return null;
    return {progress:q,totals,bytes,completed:n};
  }
  // Batch result verification is independent of end-of-run pool membership.
  function batchExecution(item){
    const fail=reason=>({verified:false,reason}),v=batchSummary(item);
    if(!v)return fail('배치 계측·출처·결과·합계를 확인하지 못했습니다.');
    const w=item.data,p=w.placement,s=w.storage||{},b=s.binding||{},io=b.io||{},q=v.progress;
    if(s.backend!=='daos'||!s.system||!s.pool||!s.container||b.version!==1||b.scope!=='observed_batch_io'||b.basis!=='explicit_daos_uri_readback'||b.state!=='verified_read'||io.checksum_verified!==true||io.bytes!==33554432||!/^[a-f0-9]{64}$/.test(io.sha256)||io.sha256!==io.expected_sha256)return fail('DAOS 읽기 원천 근거가 불완전합니다.');
    if(!p.cluster||!w.pod||!Array.isArray(p.nodes)||p.nodes.length!==1||p.nodes[0]!==io.client_node||!Array.isArray(p.gpu_uuids)||p.gpu_uuids.length!==1||!p.gpu_uuids[0])return fail('실행 노드·GPU 식별자가 불일치합니다.');
    if(!Number.isInteger(q.expected_batches)||q.expected_batches<1||q.expected_batches>32||!Number.isFinite(q.input_delay_requested_seconds)||q.input_delay_requested_seconds<0||!Number.isFinite(q.inter_batch_pause_seconds)||q.inter_batch_pause_seconds<0||!Number.isInteger(q.failure_injection_batch)||q.failure_injection_batch<0||q.failure_injection_batch>q.expected_batches||q.kernel!=='xor_bytes_257_rounds')return fail('실행 조건이 불완전합니다.');
    const start=Date.parse(w.started_at),end=w.ended_at?Date.parse(w.ended_at):Date.parse(q.observed_at),observed=Date.parse(q.observed_at);
    if(!Number.isFinite(start)||!Number.isFinite(end)||!Number.isFinite(observed)||start>end||observed<end||observed>Date.now()+5000)return fail('실행·관측 시각이 불일치합니다.');
    let previous=start,failed=0;
    for(const [index,row] of q.batches.entries()){
      const from=Date.parse(row.started_at),to=Date.parse(row.ended_at);
      if(row.batch!==index+1||row.batch>q.expected_batches||!Number.isFinite(from)||!Number.isFinite(to)||from<previous||to<from||to>end)return fail('배치 순서·시각이 불일치합니다.');
      previous=to;
      if(row.status==='completed'&&(failed||row.input_sha256!==io.sha256))return fail('배치 입력·순서가 불일치합니다.');
      if(row.status==='failed'){
        failed++;if(failed>1||index!==q.batches.length-1||!row.error||batchFields.some(k=>row[k]!=null&&(!Number.isFinite(row[k])||row[k]<0)))return fail('실패 배치 근거가 불완전합니다.');
      }
    }
    if(!v.completed)return fail('검증 완료된 배치가 없습니다.');
    if(w.ended_at){
      if(!['completed','failed'].includes(q.status)||p.execution_status!==q.status||p.registry?.state!==q.status||q.ended_at!==w.ended_at)return fail('종료 상태가 불일치합니다.');
      if(q.status==='completed'&&(v.completed!==q.expected_batches||failed))return fail('정상 종료 배치 수가 불일치합니다.');
    }else if(q.status!=='running'||failed)return fail('실행 중 상태가 불일치합니다.');
    const signature=JSON.stringify([p.cluster,w.pod,p.nodes,p.gpu_uuids,s.system,s.pool,s.container,io.sha256,io.bytes,q.kernel,q.inter_batch_pause_seconds]);
    const condition=q.status==='failed'||q.failure_injection_batch>0?'failed':q.input_delay_requested_seconds>0?'delayed':'baseline';
    return {verified:true,...v,workload:w,storage:s,binding:b,io,signature,condition,failed:q.batches.filter(r=>r.status==='failed')};
  }
  function batchPathEvidence(data,item){
    const e=batchExecution(item);if(!e.verified)return e;
    const fail=reason=>({verified:false,reason});
    if(data?.complete!==true||!Array.isArray(data.nodes)||!Array.isArray(data.edges))return fail('불완전한 토폴로지 조회입니다.');
    const {workload:w,storage:s,binding:b}=e,p=w.placement;
    const unique=(id,kind,fields)=>{const rows=data.nodes.filter(n=>n.data?.id===id);return rows.length===1&&measured(rows[0])&&rows[0].data.kind===kind&&Object.entries(fields).every(([k,v])=>rows[0].data.attrs?.[k]===v);};
    if(!unique(p.gpu_uuids[0],'gpu',{gpu_uuid:p.gpu_uuids[0],node:p.nodes[0],cluster:p.cluster})||!unique(b.pool_node_id,'storage_pool',{pool:s.pool,system:s.system})||!unique(b.container_node_id,'storage_container',{pool:s.pool,container:s.container,system:s.system}))return fail('경로 인벤토리 식별자가 불일치합니다.');
    const members=b.pool_members,edge=(to,link)=>data.edges.filter(x=>measured(x)&&x.data?.from_id===b.pool_node_id&&x.data.to_id===to&&x.data.link===link).length===1;
    if(!Array.isArray(members)||!members.length||new Set(members.map(m=>m.target_id)).size!==members.length||!edge(b.container_node_id,'contains')||members.some(m=>!unique(m.target_id,'storage_target',{node:m.node,rank:m.rank})||!edge(m.target_id,'member')))return fail('등록된 Pool 구성원 연결이 불일치합니다.');
    const before=Date.parse(b.observed_before);
    if(!Number.isFinite(before)||before>Date.parse(w.started_at))return fail('실행 전 구성원 관측 시각을 확인하지 못했습니다.');
    return {...e,membership:'before_only'};
  }
  function batchComparison(data,id){
    const rows=(data?.workloads||[]).filter(i=>i.data?.workload_id===id);
    const anchor=batchPathEvidence(data,rows.length===1?rows[0]:null);
    if(!anchor.verified||!anchor.workload.ended_at)return {verified:false,reason:anchor.reason||'종료된 배치 작업을 선택하세요.'};
    const count=new Map();for(const i of data.workloads)count.set(i.data?.workload_id,(count.get(i.data?.workload_id)||0)+1);
    const candidates=data.workloads.filter(i=>count.get(i.data?.workload_id)===1).map(i=>batchPathEvidence(data,i)).filter(e=>e.verified&&e.workload.ended_at&&e.signature===anchor.signature);
    const cases={};
    for(const kind of ['baseline','delayed','failed']){
      const matching=candidates.filter(e=>e.condition===kind&&(kind==='failed'?e.progress.status==='failed':e.progress.status==='completed'));
      matching.sort((a,b)=>Date.parse(b.workload.ended_at)-Date.parse(a.workload.ended_at)||a.workload.workload_id.localeCompare(b.workload.workload_id));
      const e=matching.find(e=>e.workload.workload_id===id)||matching[0];
      cases[kind]=e?{...e,means:Object.fromEntries(batchFields.map(k=>[k,e.totals[k]/e.completed]))}:null;
    }
    return {verified:true,anchor,cases};
  }
  if(typeof module!=='undefined')module.exports={aggregate,observationTime,overviewModel,pathEvidence,batchSummary,batchExecution,batchPathEvidence,batchComparison};
  root.GPUFlowTestbed={aggregate,observationTime,overviewModel,pathEvidence,batchSummary,batchExecution,batchPathEvidence,batchComparison};
  if(typeof document==='undefined')return;
  let mode=new URL(location.href).searchParams.get('data')||'scenario', snapshot=null, data=null, error='',cluster='',pod='',rack='',node='',busy=false,lastMarkup='';
  if(!['scenario','snapshot','live'].includes(mode))mode='scenario';
  const embedded=document.getElementById('gpuflow-testbed-data');
  if(embedded){try{snapshot=JSON.parse(embedded.textContent);}catch{error='저장된 표본을 읽지 못했습니다.';}}
  const toolbar=document.createElement('div');toolbar.className='tb-toolbar';toolbar.id='tb-toolbar';
  toolbar.innerHTML='<label>데이터 보기 <select id="tb-mode"><option value="scenario">시나리오 목업</option><option value="snapshot">저장된 테스트베드 관측</option><option value="live">테스트베드 조회</option></select></label><span id="tb-mode-note"></span>';
  document.querySelector('.top').after(toolbar);
  const originalNote=document.querySelector('.top .note').innerHTML;
  const footer=document.querySelector('footer');
  let activeScreen='①',selected=new URL(location.href).searchParams.get('workload')||'',originFilter='measured',workMarkup='',seriesState=null,seriesBusy=false,seriesSequence=0;
  const workBox=document.createElement('div');workBox.id='tb-workloads';workBox.className='view';workBox.hidden=true;document.getElementById('ov').after(workBox);
  const pathBox=document.createElement('div');pathBox.id='tb-path';pathBox.className='view';pathBox.hidden=true;workBox.after(pathBox);
  const analysisBox=document.createElement('div');analysisBox.id='tb-analysis';analysisBox.className='view';analysisBox.hidden=true;pathBox.after(analysisBox);
  const extraBox=document.createElement('div');extraBox.id='tb-extra';extraBox.className='view';extraBox.hidden=true;analysisBox.after(extraBox);
  const mappingBox=document.createElement('div');mappingBox.id='tb-contract-widgets';mappingBox.className='view';mappingBox.hidden=true;extraBox.after(mappingBox);
  const modeSelect=document.getElementById('tb-mode');modeSelect.value=mode;
  const kpi=(key,title,value,detail)=>`<div class="panel kpi" ${key?`data-review-key="${key}"`:''}><span class="eyebrow">${esc(title)}</span><span class="v num">${esc(value)}</span><span class="d">${esc(detail)}</span></div>`;
  function stateLabel(item, a){
    const w=item.data,p=w.placement||{},r=p.registry||{};
    if(w.ended_at)return ({completed:'정상 종료',failed:'실패 종료',exited_unknown:'종료 결과 미확인'}[r.state||p.execution_status]||'종료');
    if(!measured(item))return item.provenance?.data_origin==='simulation'?'시나리오 · 실제 실행 여부 미확인':'원천 상태 미확인';
    if(a.validJobs.includes(w.workload_id))return mode==='snapshot'?'관측 시점 실행 중 · GPU 관계 확인':'실행 중 · GPU 관계 확인';
    if(!a.fresh||item.quality?.registry_stale||Date.parse(r.valid_until)<=observationTime(data,mode))return '관계 만료 · 현재 상태 미확인';
    return ({unbound:'GPU 연결 미관측',conflict:'관계 충돌',unknown:'관측 오류'}[r.state]||'관계 미확인');
  }
  function openWorkload(id){selected=id;const u=new URL(location.href);u.searchParams.set('workload',id);u.searchParams.delete('screen');history.replaceState(null,'',u);root.go('②');loadSeries(true);}
  function openMeasured(screen,id=selected){selected=id;const u=new URL(location.href);u.searchParams.set('workload',id);u.searchParams.set('screen',screen==='④'?'analysis':'path');history.replaceState(null,'',u);root.go(screen);}
  function chart(s, window){
    const name=s.metric==='gpuflow_gpu_util_ratio'?'GPU 사용률':'GPU 메모리 사용량';
    const multiplier=s.unit==='ratio'?100:1,unit=s.unit==='ratio'?'%':'MiB';
    if(s.status!=='ok')return `<section class="panel tb-content"><h3>${name}</h3><p>${esc({no_data:'해당 구간 데이터 없음 · 미수집 또는 보존 기간 확인',ambiguous:'중복 시계열 · 구분 필요',unavailable:'시계열 조회 실패'}[s.status]||'미확인')}</p></section>`;
    if(!Array.isArray(s.values)||!Number.isFinite(window?.start)||!Number.isFinite(window?.end)||window.end<=window.start)return '<p>시계열 구간·형식 오류 · 데이터 제공 측 확인 필요</p>';
    const points=s.values.filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1]));
    if(!points.length)return '<p>유효한 시계열 포인트 없음 · 결측을 0으로 대체하지 않습니다.</p>';
    const top=s.unit==='ratio'?100:Math.max(1,...points.map(p=>p[1]));
    let path='',pen=false;
    s.values.forEach(([ts,v])=>{if(!Number.isFinite(ts)||!Number.isFinite(v)){pen=false;return;}const x=50+(ts-window.start)/(window.end-window.start)*700,y=165-v*multiplier/top*140;path+=(pen?' L':' M')+x.toFixed(2)+','+y.toFixed(2);pen=true;});
    const max=Math.max(...points.map(p=>p[1]*multiplier));
    return `<section class="panel tb-content tb-chart"><h3>${name} · GPU 단위</h3><p class="tb-caption">${esc(s.gpu_uuid)} · 최대 ${max.toFixed(1)} ${unit} · 유효 조회 포인트 ${points.length}/${s.values.length}</p><svg viewBox="0 0 800 210" role="img" aria-label="${name} 실행 구간 그래프"><path d="M50 20V165H750" fill="none" stroke="currentColor" opacity=".4"/><text x="4" y="25">${top.toFixed(0)}${unit}</text><text x="18" y="165">0</text><path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5"/><text x="50" y="195">${esc(new Date(window.start*1000).toISOString().slice(11,19))} UTC</text><text x="650" y="195">${esc(new Date(window.end*1000).toISOString().slice(11,19))} UTC</text></svg></section>`;
  }
  function storageDetail(item){
    const s=item.data.storage||{},b=s.binding||{},io=b.io||{};
    if(!s.pool&&!s.container)return '<section id="tb-storage"><h3>스토리지 연결: 미확인</h3><p>실제 사용 저장소를 확인한 근거가 없습니다.</p></section>';
    if(item.data.placement?.execution_kind==='cuda_daos_batches'){
      const e=batchExecution(item),path=batchPathEvidence(data,item);
      return `<section id="tb-storage"><h3>스토리지 사용 · 검증 범위 구분</h3><dl class="tb-detail-fields"><dt>배치 읽기·GPU 결과</dt><dd>${e.verified?`검증 완료 · 성공 ${e.completed}배치 · ${e.bytes/1048576} MiB`:'미확인 · '+esc(e.reason)}</dd><dt>등록 구성원 연결</dt><dd>${path.verified?'실행 전 관측과 등록 토폴로지 일치':'미확인 · '+esc(path.reason)}</dd><dt>종료 시 구성원</dt><dd>미확인 · 종료 시점 재검증 없음</dd><dt>Pool / Container</dt><dd>${esc(s.pool)} / ${esc(s.container)}</dd><dt>실행 전 관측 (UTC)</dt><dd>${esc(b.observed_before||'미확인')}</dd><dt>등록 구성원</dt><dd>${esc((b.pool_members||[]).map(m=>m.node+' (rank '+m.rank+')').join(', ')||'미확인')}</dd></dl><p>성공한 읽기와 GPU 출력 검증은 종료 시 구성원 상태의 보증과 별개입니다. 구성원은 실제 처리 rank나 작업별 pool 사용량을 뜻하지 않습니다.</p></section>`;
    }
    const verified=measured(item)&&b.version===1&&b.state==='verified_read'&&b.basis==='explicit_daos_uri_readback'&&b.scope==='completed_io_evidence'&&b.membership_stable_at_endpoints===true&&io.checksum_verified===true&&io.bytes>0&&/^[a-f0-9]{64}$/.test(io.sha256)&&io.sha256===io.expected_sha256;
    return `<section id="tb-storage"><h3>스토리지 연결: ${verified?'실제 읽기 검증 완료':'미검증 등록 정보'}</h3><dl class="tb-detail-fields"><dt>백엔드 / 시스템</dt><dd>${esc(s.backend||'미확인')} / ${esc(s.system||'미확인')}</dd><dt>Pool UUID</dt><dd>${esc(s.pool||'미확인')}</dd><dt>Container UUID</dt><dd>${esc(s.container||'미확인')}</dd><dt>확인 방식 / 시각</dt><dd>${esc(b.access_mode||'미확인')} / ${esc(b.observed_at||'미확인')}</dd><dt>Pool 구성원</dt><dd>${esc((b.pool_members||[]).map(m=>m.node+' (rank '+m.rank+')').join(', ')||'미확인')}</dd><dt>읽기 결과</dt><dd>${verified?esc(io.bytes)+' bytes · 체크섬 일치':'미확인'}</dd></dl><p>완료된 I/O의 사용 관계입니다. Pool 구성원은 실제 처리 rank 또는 작업별 사용량을 뜻하지 않습니다. 마운트·PVC 연결은 미확인입니다.</p></section>`;
  }
  function batchDetail(item){
    if(item.data.placement?.execution_kind!=='cuda_daos_batches')return '';
    const v=batchExecution(item);
    if(!v.verified)return `<section id="tb-batches"><h3>배치 계측 미확인</h3><p>${esc(v.reason)}</p></section>`;
    const q=v.progress,ms=x=>Number.isFinite(x)?(x*1000).toFixed(2):'—';
    const stages={cuda_init:'GPU 초기화',input_delay:'시험 입력 지연',daos_read:'DAOS 읽기',host_prepare:'호스트 데이터 준비',gpu_compute:'GPU 전달·커널 연산',inter_batch_pause:'배치 간 휴식',terminal:'종료'};
    return `<section id="tb-batches"><h3>작업별 배치 계측</h3><p>완료 <b>${v.completed} / ${esc(q.expected_batches)}</b> · 검증된 읽기 <b>${(v.bytes/1048576).toFixed(0)} MiB</b> · 최근 단계 ${esc(stages[q.stage]||'미확인')}</p><p>계측 시각 ${esc(q.observed_at)} · ${item.data.ended_at?'종료 이력':item.quality?.binding_verified&&!item.quality?.registry_stale&&Date.parse(item.data.placement.registry?.valid_until)>Date.now()?'실행 관계 확인':'현재 실행 관계 미확인·만료'}</p><p>CUDA byte XOR 커널 · 입력 지연 설정 ${esc(q.input_delay_requested_seconds)}초/배치 · 실패 주입 배치 ${q.failure_injection_batch?esc(q.failure_injection_batch):'없음'} · 배치 간 휴식 ${esc(q.inter_batch_pause_seconds)}초</p><div class="tb-table"><table><thead><tr><th>배치</th><th>상태</th><th>읽기 MiB</th><th>입력 지연 ms</th><th>DAOS 읽기 ms</th><th>호스트 준비 ms</th><th>H2D ms</th><th>GPU 커널 ms</th><th>D2H ms</th><th>검증 ms</th></tr></thead><tbody>${q.batches.map(b=>`<tr><td>${b.batch}</td><td>${b.status==='completed'?'결과 일치':'실패 · '+esc(b.error||'원인 미확인')}</td><td>${Number.isFinite(b.read_bytes)?b.read_bytes/1048576:'—'}</td>${['input_delay_seconds','daos_copy_wall_seconds','host_prepare_wall_seconds','h2d_wall_seconds','kernel_gpu_seconds','d2h_wall_seconds','verify_wall_seconds'].map(k=>`<td>${ms(b[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p>성공 배치 합계: DAOS 읽기 ${ms(v.totals.daos_copy_wall_seconds)} ms · H2D ${ms(v.totals.h2d_wall_seconds)} ms · GPU 커널 ${ms(v.totals.kernel_gpu_seconds)} ms.</p><p>GPU 커널 시간은 CUDA event 계측입니다. 나머지는 실행기 경과 시간으로 CLI·복사 비용을 포함합니다. 입력 지연은 시험 조건이며 GPU data wait가 아닙니다. 실패 배치는 성공 합계에 포함하지 않습니다.</p></section>`;
  }
  function renderWorkloads(){
    const box=document.getElementById('tb-workloads');
    if(error||!data){box.innerHTML=`<section class="panel tb-content"><h2>워크로드 조회</h2><p>${esc(error||'조회 중…')}</p></section>`;return;}
    let a;try{a=aggregate(data,observationTime(data,mode));}catch(e){box.innerHTML='<p>불완전한 조회 결과</p>';return;}
    const filtered=data.workloads.filter(x=>originFilter==='all'||(x.provenance?.data_origin||'unknown')===originFilter);
    if(!selected)selected=filtered[0]?.data.workload_id||'';
    const matches=filtered.filter(x=>x.data.workload_id===selected),item=matches.length===1?matches[0]:null;
    const origins={all:'전체 출처',measured:'실측',simulation:'시뮬레이션',replay:'Replay',backfill:'Backfill',unknown:'출처 불명'};
    const list=filtered.map(x=>`<tr ${x.data.workload_id===selected?'class="tb-selected"':''}><td><button class="tb-open" data-workload="${esc(x.data.workload_id)}">${esc(x.data.workload_id)}</button></td><td>${esc(origins[x.provenance?.data_origin]||'출처 불명')}</td><td>${esc(stateLabel(x,a))}</td></tr>`).join('');
    let detail='<p>워크로드를 선택하세요. 없거나 중복된 ID는 상세 조회하지 않습니다.</p>';
    if(item){
      const w=item.data,p=w.placement||{},r=p.registry||{},noGPU=measured(item)&&p.execution_kind==='daos_readback'&&!(p.gpu_uuids||[]).length;
      let graphs='';const result=seriesState?.id===selected&&seriesState.mode===mode?seriesState.result:null;
      const activeUnverified=!w.ended_at&&!a.validJobs.includes(selected);
      if(!measured(item))graphs='<p>실측 작업이 아닙니다. 실측 GPU 그래프를 연결하지 않습니다.</p>';
      else if(p.execution_kind==='daos_readback'&&!(p.gpu_uuids||[]).length)graphs='<p>GPU를 사용하지 않는 DAOS 읽기 검증 작업입니다. GPU 그래프는 해당 없음입니다.</p>';
      else if(activeUnverified)graphs='<p>현재 GPU 관계가 미확인·만료되어 그래프 조회를 보류합니다.</p>';
      else if(!result)graphs=`<p>${esc(seriesState?.error||'시계열 조회 중…')}</p>`;
      else if(!result.series?.length)graphs=`<p>${esc({binding_unverified:'GPU 관계 검증 실패',invalid_window:'실행 시각 미확인',not_found:'작업을 찾지 못함',not_measured:'실측 작업 아님',no_snapshot:'표본 미포함 · GPU 사용률·메모리 시계열이 이 파일에 없습니다. 실행 구간의 DCGM 조회 결과를 추가해야 합니다.'}[result.status]||'시계열 조회 실패')}</p>`;
      else graphs=`<p>그래프 조회 시각 ${esc(result.generated_at)} · ${result.window.end_basis==='exit_detection'?'종료 발견 시각을 상한으로 사용 · 정확한 종료 시각 미확인':w.ended_at?'기록된 실행 시작~종료 구간':'실행 시작~조회 시각'}${result.window.clipped_to_24h?' · 최근 24시간으로 제한':''}</p>`+result.series.map(s=>chart(s,result.window)).join('');
      detail=`<div><h2 id="tb-workload-title">${esc(w.workload_id)}</h2><dl class="tb-detail-fields"><dt>출처 / 상태</dt><dd>${esc(origins[item.provenance?.data_origin]||'출처 불명')} / ${esc(stateLabel(item,a))}</dd><dt>유형</dt><dd>${esc(w.type||'미확인')}</dd><dt>클러스터 / POD</dt><dd>${esc(p.cluster||'미확인')} / ${esc(w.pod||'미확인')}</dd><dt>노드</dt><dd>${esc((p.nodes||[]).join(', ')||'미확인')}</dd><dt>등록 GPU UUID</dt><dd>${esc((p.gpu_uuids||[]).join(', ')||(noGPU?'해당 없음 · GPU 미사용':'미확인'))}</dd><dt>시작 / 종료 (UTC)</dt><dd>${esc(w.started_at||'미확인')} / ${esc(w.ended_at||'미확인')}</dd><dt>관계 유효기간</dt><dd>${esc(w.ended_at?'종료 이력':r.valid_until||'미확인')}</dd></dl></div>${storageDetail(item)}${batchDetail(item)}<div data-review-key="workload-wait"><h3>GPU data wait: ${noGPU?'해당 없음 · GPU 미사용':'미확인'}</h3><p>미계측 · I/O stall과 GPU 할당 시간의 정의·계측이 필요합니다. 제공 담당·가중 방식은 기관 미팅에서 확정합니다. GPU 사용률·유휴율로 대기율을 대신 계산하지 않습니다.</p></div><div class="tb-series-note" ${noGPU?'hidden':''}><b>그래프는 GPU 단위 실측입니다.</b> 공유 여부와 무관하게 이 작업의 단독 사용률로 단정하지 않습니다. ${r.shared_gpu_observed===true?'동시 GPU 프로세스 관측됨.':'GPU 독점 사용은 보장되지 않습니다.'} 다른 GPU의 값은 합산하지 않습니다.</div><div id="tb-series">${graphs}</div><button class="tb-open" id="tb-open-path">③ 경로 보기</button>`;
    }
    const markup=`<section class="panel tb-content" data-review-key="workload-list"><h2>워크로드 목록 · ${mode==='live'?'API 조회':'저장된 관측'}</h2><p class="tb-caption">목록 관측 시각 ${esc(data.captured_at)} · ${mode==='snapshot'?'과거 관측 시점 기준 · 현재 상태 아님':a.fresh?'조회 유효기간 내':'현재 관계 미확인 · 관측 갱신 필요'}</p><label>출처 <select id="tb-origin">${Object.entries(origins).map(([k,v])=>`<option value="${k}" ${k===originFilter?'selected':''}>${v}</option>`).join('')}</select></label><div class="tb-table tb-workload-table"><table><thead><tr><th>워크로드</th><th>출처</th><th>상태</th></tr></thead><tbody>${list||'<tr><td colspan="3">해당 출처의 작업 없음</td></tr>'}</tbody></table></div></section><section class="panel tb-content" id="tb-detail">${detail}</section>`;
    if(workMarkup===markup&&box.querySelector('#tb-origin'))return;
    box.innerHTML=markup+missingWidgets('②')+`<section class="panel tb-content"><h3>워크로드 필드 출처·해석</h3><p>workload_id/type/시작·종료: 실행기·레지스트리 기록. placement: 관측 노드·GPU UUID 연결. storage: Pool/Container와 사용 검증 근거. tenant/namespace: 스케줄러·업무 레지스트리 연동이 필요하며 이 화면은 이를 추정하지 않습니다.</p><p>provenance는 출처, quality는 검증·최신성 상태입니다. 원천 응답의 next_cursor/backend는 조회·페이지 처리 정보이며 성능 지표가 아닙니다. 배치 종료 이력과 현재 유효 관계를 구분합니다.</p></section>`;workMarkup=markup;
    box.querySelector('#tb-origin').onchange=e=>{originFilter=e.target.value;selected='';seriesState=null;renderWorkloads();loadSeries(true);};
    box.querySelectorAll('[data-workload]').forEach(b=>b.onclick=()=>openWorkload(b.dataset.workload));
    const pathButton=box.querySelector('#tb-open-path');if(pathButton)pathButton.onclick=()=>{const u=new URL(location.href);u.searchParams.set('screen','path');history.replaceState(null,'',u);root.go('③');};
    root.dispatchEvent(new Event('gpuflow:testbed-render'));
  }
  async function loadSeries(force=false){
    if(mode==='scenario'||activeScreen!=='②'||!selected||!data)return;
    const id=selected,requestMode=mode,items=data.workloads.filter(x=>x.data.workload_id===id);
    if(items.length!==1||!measured(items[0])||(items[0].data.placement?.execution_kind==='daos_readback'&&!(items[0].data.placement?.gpu_uuids||[]).length))return;
    const item=items[0],now=Date.now(),ended=!!item.data.ended_at,basis=JSON.stringify([item.data.ended_at,item.data.placement?.gpu_uuids,item.data.placement?.active_gpu_uuids]);
    if(!ended&&!aggregate(data,observationTime(data,mode)).validJobs.includes(id))return;
    if(!force&&seriesState?.id===id&&seriesState.mode===mode&&seriesState.basis===basis&&(seriesBusy||(ended&&seriesState.result&&now-seriesState.at<60000)||now-seriesState.at<4500))return;
    const seq=++seriesSequence;seriesBusy=true;seriesState={id,mode,basis,at:now,result:null,error:null};renderWorkloads();
    try{
      let result;
      if(mode==='snapshot')result=data.workload_series?.[id]||{status:'no_snapshot',series:[]};
      else{const response=await fetch('/testbed-api/workload-series?'+new URLSearchParams({workload_id:id}),{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('시계열 조회 실패 · 재시도 대기');result=await response.json();}
      if(seq===seriesSequence&&mode===requestMode&&selected===id){if(!result||!Array.isArray(result.series)||(result.series.length&&(!result.window||!Number.isFinite(result.window.start)||!Number.isFinite(result.window.end))))throw Error('시계열 응답 형식 오류');if(result.workload_id&&result.workload_id!==id)throw Error('시계열 응답 작업 불일치');seriesState={id,mode,basis,at:Date.now(),result,error:null};}
    }catch(e){if(seq===seriesSequence&&mode===requestMode&&selected===id)seriesState={id,mode,basis,at:Date.now(),result:null,error:e.message};}
    finally{if(seq===seriesSequence)seriesBusy=false;renderWorkloads();}
  }

  function renderPath(){
    if(error||!data){pathBox.innerHTML=`<section class="panel tb-content"><h2>실측 데이터 경로</h2><p>${esc(error||'조회 중…')}</p></section>`;return;}
    const items=data.workloads.filter(measured);
    if(!selected)selected=items.find(i=>i.data.placement?.execution_kind==='cuda_daos_host_bounce')?.data.workload_id||items[0]?.data.workload_id||'';
    const matches=items.filter(i=>i.data.workload_id===selected),item=matches.length===1?matches[0]:null,isBatch=item?.data.placement?.execution_kind==='cuda_daos_batches',e=isBatch?batchPathEvidence(data,item):pathEvidence(data,item);
    let body=`<section class="panel tb-content" data-review-key="path"><h2>경로 미확인</h2><p>${esc(e.reason)}</p><p>확인되지 않은 계층에 시나리오 수치를 넣지 않습니다.</p></section>`;
    if(e.verified&&isBatch){
      const {workload:w,storage:s,binding:b,totals:t}=e;
      const ms=x=>(x*1000).toFixed(2)+' ms',steps=[['DAOS 읽기',s.container,ms(t.daos_copy_wall_seconds)],['호스트 준비',w.placement.nodes[0]+' · tmpfs → host buffer',ms(t.host_prepare_wall_seconds)],['HtoD','호스트 → GPU',ms(t.h2d_wall_seconds)],['GPU 커널',w.placement.gpu_uuids[0],ms(t.kernel_gpu_seconds)+' · CUDA event'],['DtoH·출력 검증','GPU → 호스트 · CPU 기대값 대조',ms(t.d2h_wall_seconds)+' / '+ms(t.verify_wall_seconds)]];
      body=`<section class="panel tb-content" data-review-key="path"><h2>배치 데이터 경로 · 성공 구간 검증</h2><p>실측 · ${esc(w.workload_id)} · 관측 ${esc(e.progress.observed_at)} UTC</p><p>${w.ended_at?'종료된 실행 이력': '진행 중 관측 · 현재 관계는 ②에서 확인'} · 성공 ${e.completed}/${e.progress.expected_batches}배치 · ${e.bytes/1048576} MiB · ${e.progress.status==='failed'?'실패 종료 · 전체 실행 성공 아님':'검증된 배치만 집계'}</p><ol class="tb-path-chain">${steps.map(([name,value,timing])=>`<li><b>${esc(name)}</b><span>${esc(value)}</span><strong>${esc(timing)}</strong></li>`).join('')}</ol><p>각 단계 값은 성공 배치 합계입니다. DAOS CLI·호스트 경유 방식이며 GPUDirect/GDS가 아닙니다. 네트워크 구간은 별도로 계측하지 않았습니다.</p><p>별도 시험 입력 지연 합계 ${ms(t.input_delay_seconds)} · 배치 간 휴식 설정 ${esc(e.progress.inter_batch_pause_seconds)}초. 커널 wall time ${ms(t.kernel_wall_seconds)}은 CUDA event 값과 중첩되므로 합산하지 않습니다.</p></section><section class="panel tb-content" data-review-key="placement"><h3>경로 식별과 구성원 관측</h3><p>${esc(w.placement.cluster)} / ${esc(w.pod)} / ${esc(w.placement.nodes[0])}</p><p>Pool ${esc(s.pool)} · ${esc(s.system)}</p><p>구성원 ${esc(b.pool_members.map(m=>m.node+' / rank '+m.rank).join(', '))} · 실행 전 ${esc(b.observed_before)}</p><p>등록 토폴로지와 일치 · 종료 시 구성원은 미확인. 현재 연결·스케줄러 할당·실제 처리 rank는 보증하지 않습니다.</p></section>${e.failed.length?`<section class="panel tb-content"><h3>중단 지점</h3><p>배치 ${e.failed[0].batch} · ${esc(e.failed[0].error)} · ${esc(e.failed[0].ended_at)}</p><p>실패한 배치의 부분 시간은 성공 합계에서 제외했습니다.</p></section>`:''}<section class="panel tb-content"><h3>배치 조건 비교</h3><p>성공 배치 평균과 실패 구간의 부분 시간을 ④에서 비교합니다.</p><button class="tb-open" id="tb-path-analysis">④ 정상·지연·실패 비교</button></section>`;
    }else if(e.verified){
      const {workload:w,storage:s,binding:b,transfer:t,io}=e;
      const steps=[['DAOS container',s.container],['TCP 데이터망',t.fabric_provider+' · '+t.client_interface],['호스트 메모리',io.client_node+' · tmpfs → host buffer'],['CUDA 복사','Host → Device'],['GPU 메모리',t.gpu_uuid]];
      body=`<section class="panel tb-content" data-review-key="path"><h2>실제 전달 검증 완료 · 호스트 메모리 경유</h2><p>완료된 실증 이력 · ${esc(w.started_at)} → ${esc(w.ended_at)}</p><ol class="tb-path-chain">${steps.map(([name,value])=>`<li><b>${esc(name)}</b><span>${esc(value)}</span></li>`).join('')}</ol><p><b>${io.bytes.toLocaleString()} bytes</b> · DAOS 읽기와 GPU 전체 재조회 체크섬 일치</p><p>GPUDirect/GDS 경로가 아닙니다. GPU 연산 성능 시험이 아닌 데이터 전달 검증입니다.</p></section><section class="panel tb-content" data-review-key="placement"><h3>배치와 저장소 연결</h3><p>${esc(w.workload_id)} · ${esc(w.pod)} · ${esc(io.client_node)}</p><p>Pool ${esc(s.pool)} · ${esc(s.system)}</p><p>Pool 구성원: ${esc(b.pool_members.map(m=>m.node+' / rank '+m.rank).join(', '))}</p><p>구성원은 실제 처리 rank를 뜻하지 않습니다. 마운트·PVC 연결과 pool의 작업별 사용량은 미확인입니다.</p></section><section class="panel tb-content"><h3>계측 범위</h3><p>DAOS CLI 읽기 → tmpfs 파일 → 호스트 버퍼 → CUDA HtoD → GPU → DtoH 체크섬 검증.</p><p>GPU 메모리 보유 ${esc(t.allocation_hold_seconds)}초는 수집 확인용입니다. GPU data wait, 작업별 대역폭, 병목·예측 값은 이번 결과로 산출하지 않습니다.</p></section>`;
    }
    const markup=`<section class="panel tb-content"><h2>③ 실측 경로 검토</h2><label>워크로드 <select id="tb-path-select">${items.map(i=>`<option value="${esc(i.data.workload_id)}" ${i.data.workload_id===selected?'selected':''}>${esc(i.data.workload_id)}</option>`).join('')}</select></label><p>관측 ${esc(data.captured_at)} · 저장된 완료 이력은 현재 연결 상태를 뜻하지 않습니다.</p><button class="tb-open" id="tb-path-detail">② 상세 보기</button></section>${body}`;
    if(pathBox._markup===markup&&pathBox.querySelector('#tb-path-select'))return;
    pathBox.innerHTML=markup+missingWidgets('③');pathBox._markup=markup;
    pathBox.querySelector('#tb-path-select').onchange=e=>{selected=e.target.value;const u=new URL(location.href);u.searchParams.set('workload',selected);history.replaceState(null,'',u);renderPath();};
    pathBox.querySelector('#tb-path-detail').onclick=()=>openWorkload(selected);
    const compare=pathBox.querySelector('#tb-path-analysis');if(compare)compare.onclick=()=>openMeasured('④');
    root.dispatchEvent(new Event('gpuflow:testbed-render'));
  }
  function renderAnalysis(){
    if(error||!data){analysisBox.innerHTML=`<section class="panel tb-content"><h2>배치 비교 조회</h2><p>${esc(error||'조회 중…')}</p></section>`;return;}
    const items=data.workloads.filter(i=>measured(i)&&i.data.placement?.execution_kind==='cuda_daos_batches');
    if(!selected)selected=items.at(-1)?.data.workload_id||'';
    const comparison=batchComparison(data,selected),kinds=['baseline','delayed','failed'],names={baseline:'정상 조건',delayed:'입력 지연 조건',failed:'실패 조건'};
    const ms=x=>Number.isFinite(x)?(x*1000).toFixed(2):'—';
    let body=`<section class="panel tb-content"><h2>비교 미확인</h2><p>${esc(comparison.reason)}</p><p>실측 근거가 없으면 시나리오 값으로 대체하지 않습니다.</p></section>`;
    if(comparison.verified){
      const cases=comparison.cases,baseline=cases.baseline;
      const stages=[['daos_copy_wall_seconds','DAOS CLI 읽기'],['host_prepare_wall_seconds','호스트 준비'],['h2d_wall_seconds','HtoD'],['kernel_wall_seconds','커널 호출·동기화 (wall)'],['kernel_gpu_seconds','GPU 커널 (CUDA event)'],['d2h_wall_seconds','DtoH'],['verify_wall_seconds','출력 검증'],['input_delay_seconds','별도 주입한 입력 지연']];
      const cards=kinds.map(k=>{const c=cases[k];return `<section class="panel tb-content"><h3>${names[k]}</h3>${c?`<button class="tb-open" data-analysis-workload="${esc(c.workload.workload_id)}">${esc(c.workload.workload_id)}</button><p>${c.progress.status==='failed'?'실패 종료':'정상 종료'} · ${c.completed}/${c.progress.expected_batches}배치 · ${c.bytes/1048576} MiB</p><p>입력 지연 ${c.progress.input_delay_requested_seconds}초/배치 · 실패 주입 ${c.progress.failure_injection_batch||'없음'} · 배치 간 휴식 ${c.progress.inter_batch_pause_seconds}초</p><p class="tb-caption">${esc(c.workload.started_at)} → ${esc(c.workload.ended_at)}<br>계측 ${esc(c.progress.observed_at)} · 실측</p>`:'<p>비교 가능한 관측 없음</p>'}</section>`;}).join('');
      const rows=stages.map(([key,label])=>`<tr><th>${label}</th>${kinds.map(k=>`<td>${ms(cases[k]?.means[key])}</td>`).join('')}<td>${baseline&&cases.delayed?ms(cases.delayed.means[key]-baseline.means[key]):'—'}</td></tr>`).join('');
      const fail=cases.failed?.failed[0];
      const delta=baseline&&cases.delayed?cases.delayed.means.input_delay_seconds-baseline.means.input_delay_seconds:null;
      const daosDelta=baseline&&cases.delayed?cases.delayed.means.daos_copy_wall_seconds-baseline.means.daos_copy_wall_seconds:null;
      body=`<div class="tb-case-grid">${cards}</div><section class="panel tb-content" data-review-key="batch-comparison"><h2>성공 배치당 평균 시간 (ms)</h2><p>같은 GPU·노드·Pool/Container·입력 체크섬·32 MiB·커널·휴식 설정만 비교합니다. 배치 수가 달라 합계 대신 성공 배치당 평균을 사용합니다.</p><div class="tb-table"><table id="tb-comparison-table"><thead><tr><th>계측 구간</th><th>정상</th><th>입력 지연</th><th>읽기 실패 실행의 성공 배치</th><th>입력 지연 − 정상</th></tr></thead><tbody>${rows}</tbody></table></div><p>— 는 비교할 관측이 없다는 뜻입니다. 0으로 대체하지 않습니다. 커널 wall과 CUDA event는 중첩되므로 더하지 않습니다. 입력 지연·배치 간 휴식은 장치 처리 시간과 구분합니다.</p></section><section class="panel tb-content"><h2>관측된 차이</h2><p>${delta===null?'정상·입력 지연 조건이 모두 있어야 차이를 계산합니다.':`입력 지연 조건의 주입 지연은 성공 배치당 ${ms(delta)} ms 증가했습니다. DAOS CLI 읽기 차이는 ${ms(daosDelta)} ms입니다.`}</p><p>반복 수가 적은 제어 실험의 기술 통계입니다. 장치의 성능 저하·인과관계·병목 등급으로 판정하지 않습니다.</p><h3>실패 구간</h3>${fail?`<p>배치 ${fail.batch} · ${esc(fail.error)} · ${esc(fail.started_at)} → ${esc(fail.ended_at)}</p><p>부분 계측: 입력 지연 ${ms(fail.input_delay_seconds)} ms · DAOS 읽기 시도 ${ms(fail.daos_copy_wall_seconds)} ms. 이 값은 위 성공 배치 평균에서 제외했습니다.</p>`:'<p>실패 배치 근거 없음</p>'}</section>`;
    }
    const markup=`<section class="panel tb-content"><h2>④ 실측 배치 조건 비교</h2><label>기준 작업 <select id="tb-analysis-select"><option value="">작업 선택</option>${items.map(i=>`<option value="${esc(i.data.workload_id)}" ${i.data.workload_id===selected?'selected':''}>${esc(i.data.workload_id)}</option>`).join('')}</select></label><p>조회 ${esc(data.captured_at)} · 조건별 최신 검증 완료 이력 선택, 선택한 작업은 해당 조건에 우선 적용합니다.</p><p>② 상세 → ③ 경로 → ④ 조건 비교에서 같은 작업을 확인할 수 있습니다.</p><button class="tb-open" id="tb-analysis-detail">② 상세 보기</button> · <button class="tb-open" id="tb-analysis-path">③ 경로 보기</button></section>${body}`;
    if(analysisBox._markup===markup&&analysisBox.querySelector('#tb-analysis-select'))return;
    analysisBox.innerHTML=markup+missingWidgets('④');analysisBox._markup=markup;
    analysisBox.querySelector('#tb-analysis-select').onchange=e=>openMeasured('④',e.target.value);
    analysisBox.querySelector('#tb-analysis-detail').onclick=()=>openWorkload(selected);
    analysisBox.querySelector('#tb-analysis-path').onclick=()=>openMeasured('③');
    analysisBox.querySelectorAll('[data-analysis-workload]').forEach(b=>b.onclick=()=>openWorkload(b.dataset.analysisWorkload));
    root.dispatchEvent(new Event('gpuflow:testbed-render'));
  }
  const pendingCard=(title,reason,next,key='')=>`<section class="panel tb-content" ${key?`data-review-key="${key}"`:''}><h3>${esc(title)}</h3><p class="tb-status">${esc(reason)}</p><p>${esc(next)}</p></section>`;
  function storageOverview(a,id='tb-storage-summary'){
    const count=kind=>a.storage.filter(x=>x.data.kind===kind).length;
    return `<section class="panel tb-content" id="${esc(id)}" data-review-key="storage-summary"><h2>Storage cluster summary · 스토리지 구성 요약</h2><p>범위: 선택 클러스터의 표본 전체 · 컴퓨트 POD/랙/노드 필터는 적용하지 않음</p><div class="tb-case-grid">${[['Pool','storage_pool'],['Container','storage_container'],['등록 rank 레코드','storage_target']].map(([n,k])=>`<div><b>${n}</b><p>${count(k)}개</p></div>`).join('')}</div><ul>${a.storage.map(x=>`<li>${esc(x.data.id)} · ${esc(x.data.kind)} · 장비 POD ${esc(x.data.pod||'미등록')}${x.data.attrs?.node?' · '+esc(x.data.attrs.node):''}</li>`).join('')||'<li>표본 내 해당 구성 없음 · 전체 시스템 미존재를 뜻하지 않음</li>'}</ul><p>rank 레코드 수는 물리 target·engine 총수가 아닙니다. 이 등록 자료에는 용량·가용 상태·IOPS·지연 시계열이 없습니다. ⑥의 DAOS 처리량은 별도 관측 영역에서 확인합니다. Lustre와 전체 상태 조회는 추가 연결이 필요합니다.</p></section>`;
  }
  function missingWidgets(screen){
    const cards=[];
    if(screen==='②')cards.push(
      ['워크로드 주요 성능','실행 결과와 서비스 성능을 구분','배치 읽기·GPU 결과는 위 실행 기록입니다. TTFT/TPOT·tokens/s·학습 step/s는 표본 미포함이며 애플리케이션 계측이 필요합니다.','workload-performance'],
      ['캐시 적중률','표본 미포함','캐시 계층별 hit/miss·분모·집계 기간·workload 귀속 필요.','cache-hit'],
      ['호스트 CPU 사용률','표본 미포함','host exporter와 node 연결 필요. 노드 CPU와 작업 전용 CPU를 구분합니다.','host-cpu']);
    if(['②','③'].includes(screen))cards.push(
      ['워크로드 전달 대역폭','표본 미포함','누적 읽기량은 실험 이력입니다. 처리 bytes의 구간·방향·workload 귀속이 확인된 시계열이 필요합니다.','workload-bandwidth'],
      ['Zero-copy 경로 비율','비율 산출 근거 없음','현재 배치 표본은 호스트 경유 CUDA 복사입니다. GDS/GPUDirect 사용 또는 전체 전송 대비 비율을 주장하지 않습니다.','zero-copy']);
    if(['③','④'].includes(screen))cards.push(
      ['GPU data wait','미계측','I/O stall / GPU 할당 시간 계측·다중 GPU 가중 방식 필요. 읽기·복사·커널 시간을 대기율로 바꾸지 않습니다.','workload-wait'],
      ['계층별 예측·권고','표본 미포함','예측 생성/대상 시각·대상 범위·모델 버전·품질·권고 정책과 근거 필요. 제어 실험의 시간 차이는 병목 예측이 아닙니다.','forecast']);
    return '<div class="tb-two-grid">'+cards.map(x=>pendingCard(...x)).join('')+'</div>';
  }

  function renderOverviewContent(ov){
    let a;try{a=overviewModel(data,mode,{cluster,pod,rack,node});}catch(e){error=e.message;render();return;}
    const opts=(xs,sel)=>'<option value="">전체</option>'+xs.map(x=>`<option value="${esc(x)}" ${sel===x?'selected':''}>${esc(x)}</option>`).join('');
    const rows=a.scoped.map(x=>`<tr><td><button class="tb-open" data-workload="${esc(x.data.workload_id)}">${esc(x.data.workload_id)}</button></td><td>${esc(x.data.type||'미등록')}</td><td>${esc(x.data.pod||'미등록')}</td><td>${esc(stateLabel(x,a))}</td><td>${esc(x.data.started_at||'미등록')}</td><td>${esc(x.data.ended_at||'종료 기록 없음')}</td></tr>`).join('');
    const markup=`<section class="panel tb-content"><h2>테스트베드 전체 현황</h2><p class="tb-caption">${mode==='snapshot'?'저장된 과거 관측 · 현재 상태 아님':'API 조회 결과'} · 관측 시각 ${esc(data.captured_at)} (UTC)</p><div class="tb-filters">${[['cluster','클러스터',a.clusters,cluster],['pod','컴퓨트 장비 POD',a.pods,pod],['rack','랙',a.racks,rack],['node','노드',a.nodes,node]].map(([id,label,values,value])=>`<label>${label} <select id="tb-${id}">${opts(values,value)}</select></label>`).join('')}</div><p>필터는 GPU·컴퓨트 POD 요약·작업 이력에 적용합니다. 장비 POD는 Kubernetes Pod와 다른 물리 구획입니다. 랙 (미등록)은 토폴로지에 rack 정보가 없다는 뜻이며 위치를 추정하지 않습니다.</p><p>표본에 포함된 등록 자료만 집계합니다. 전체 클러스터 인벤토리·동시 일관성을 보증하지 않습니다.${data.snapshot_consistent===false?' 이 표본은 동일 시각의 원자적 스냅샷이 아닙니다.':''}</p></section>
      <section class="ovk tb-metrics" aria-label="테스트베드 지표">${kpi('allocation','실측 등록 GPU',a.registered+'개','선택한 컴퓨트 범위의 표본 인벤토리')}${kpi('','관측 시점 작업–GPU 관계',a.linked===null?'관측 만료':a.linked+'개','유효 관계만 집계 · 0개여도 유휴 GPU라는 뜻은 아님')}${kpi('cluster-wait','GPU data wait','미계측','I/O stall / GPU 할당 시간 · 정의·계측 담당 합의 필요')}${kpi('cluster-bandwidth','스토리지 대역폭','표본 미포함','누적 읽기 bytes를 현재 GB/s로 바꾸지 않음')}${kpi('capacity','스토리지 용량','표본 미포함','Pool/target 용량·사용량 시계열 필요')}${kpi('active-workloads','실행 중 관측 관계가 확인된 작업',a.fresh?a.validJobs.length+'건':'관측 만료','스케줄러 전체 실행·예약 건수가 아님')}</section>
      <section class="panel tb-content" id="tb-status-guide"><h2>데이터 상태 읽는 법</h2><p><b>실측</b>: 표시한 시각·범위에서 확인한 값. <b>표본 미포함</b>: 원천에 있을 수 있지만 이 파일에는 없음. <b>미계측</b>: 필요한 계측·산식이 준비되지 않음. <b>미등록</b>: 식별 메타데이터 없음. <b>관측 만료</b>: 실시간 관계 갱신 필요. 0과 결측을 구분합니다.</p><p>스케줄러 예약·할당 가능량은 미연동입니다. 관계 수나 GPU 사용률로 대신 계산하지 않습니다. 담당·API·기한은 각 위젯 검토 기록에서 합의합니다.</p></section>
      <section class="panel tb-content" id="tb-pod-summary" data-review-key="pod-summary"><h2>POD별 요약 · 선택 컴퓨트 범위</h2><div class="tb-case-grid">${a.podSummaries.map(p=>`<article><h3>${esc(p.pod)}</h3><p>${esc(p.cluster)} · 노드 ${p.nodes}개 · 등록 GPU ${p.gpus}개</p><p>Max wait·Alerts: 미계측 · GPU 할당·Uplink: 미연동</p></article>`).join('')||'<p>선택 범위의 등록 GPU 없음</p>'}</div><p>스토리지 장비 POD는 아래 스토리지 구성 요약에서 별도 표시합니다.</p></section>
      <section class="panel tb-content" id="tb-heatmap" data-review-key="heatmap"><h2>GPU 히트맵 · GPU data wait</h2><p>회색 = 미계측. 낮은 대기율 또는 정상 상태를 뜻하지 않습니다.</p><div class="tb-gpu-grid">${a.inventory.map(x=>`<article class="tb-gpu-cell"><b>${esc(x.data.attrs.node)}</b><span>${esc(x.data.attrs.model||'모델 미등록')}</span><code>${esc(x.data.id)}</code><strong>Wait 미계측</strong></article>`).join('')||'<p>선택 범위의 GPU 인벤토리 없음</p>'}</div></section>
      <div class="tb-two-grid">${pendingCard('Top nodes by wait','순위 미산출 · GPU 대기율 미계측','노드별 I/O stall·GPU 할당시간과 다중 GPU 가중 방식을 먼저 확정해야 합니다. 사용률로 순위를 대체하지 않습니다.','top-wait')}${pendingCard('GPU occupancy by workload type','점유 비율 미산출 · 스케줄러 할당 미연동',`선택 범위의 종료 이력 ${a.scoped.filter(x=>x.data.ended_at).length}건은 점유율 분모·분자가 아닙니다. 작업 유형·시간 구간·공유 GPU 배분 계약이 필요합니다.`,'type-occupancy')}</div>
      ${storageOverview(a)}
      <section class="panel tb-content"><h2>출처 구분 · 조회한 전체 작업 이력</h2><p>실측 <b id="tb-measured">${a.origins.measured}</b> · 시뮬레이션 <b id="tb-simulation">${a.origins.simulation}</b> · Replay ${a.origins.replay} · Backfill ${a.origins.backfill} · 출처 불명 ${a.origins.unknown}</p><p>전역 출처별 레코드 수이며 필터와 무관합니다. 실측 집계는 품질·관계 검사를 추가로 통과해야 합니다. 중복 GPU 인벤토리 제외 ${a.ambiguous}개.</p></section>
      <section class="panel tb-content"><h2>실측 작업 이력 · 선택 범위</h2><div class="tb-table"><table><thead><tr><th>워크로드</th><th>유형</th><th>POD</th><th>상태</th><th>시작(UTC)</th><th>종료(UTC)</th></tr></thead><tbody>${rows||'<tr><td colspan="6">선택 범위의 실측 이력 없음</td></tr>'}</tbody></table></div></section>`;
    if(lastMarkup===markup&&ov.querySelector('#tb-heatmap'))return;
    ov.innerHTML=markup;lastMarkup=markup;
    ov.querySelectorAll('[data-workload]').forEach(b=>b.onclick=()=>openWorkload(b.dataset.workload));
    document.getElementById('tb-cluster').onchange=e=>{cluster=e.target.value;pod='';rack='';node='';render();};
    document.getElementById('tb-pod').onchange=e=>{pod=e.target.value;rack='';node='';render();};
    document.getElementById('tb-rack').onchange=e=>{rack=e.target.value;node='';render();};
    document.getElementById('tb-node').onchange=e=>{node=e.target.value;render();};
    root.dispatchEvent(new Event('gpuflow:testbed-render'));
  }
  const catalog=()=>root.GPUFlowReviewCatalog||(()=>{try{return JSON.parse(document.getElementById('gpuflow-review-data')?.textContent||'null');}catch{return null;}})();
  let llmQuestion='Q01',llmScenario='normal',llmResult=null,llmBusy=false,llmSeq=0,reviewResources=null,resourceError='',resourceBusy=false;
  const contractWidgets=screen=>(catalog()?.widgets||[]).filter(w=>w.screens[0]===screen&&/W(?:01-(?:08|09|10)|05|06|07|08|09|10|11|12)/.test(w.id));
  function contractCard(w){
    return `<section class="panel tb-content" data-review-key="${esc(w.key)}"><h3>${esc(w.id)} ${esc(w.title)}</h3><p>${esc(w.meaning)}</p><p class="tb-status">${esc(w.readiness)}</p><details><summary>지표·이벤트·API·결정 사항</summary><p>${esc(w.api.join(' · ')||'연결 API 미정')}</p><p>지표: ${esc(w.metrics.join(', ')||'등록된 지표 연결 없음')}</p><p>이벤트: ${esc((w.events||[]).join(', ')||'해당 없음/확인 필요')}</p><p>미확정 계약: ${esc((w.pending_contracts||[]).join(', ')||'없음')}</p><p>${esc(w.response_fields)}</p><p>${esc(w.owner)}</p>${(w.subregions||[]).map(x=>`<p>${esc(x)}</p>`).join('')}<p>후속 제어 API(원본 표기·제공 미확정): ${esc((w.control_api_proposals||[]).join(', ')||'없음')}</p></details></section>`;
  }
  const resources=()=>mode==='snapshot'?data?.review_api_samples?.resources:reviewResources;
  const syntheticBadge=row=>row?.provenance?.simulated===true||row?.provenance?.data_origin==='simulation'?'<span class="tb-synthetic">합성</span>':'';
  function readableValue(field,value){
    if(field.endsWith('_ns')&&/^\d+$/.test(String(value))){try{return esc(value)+'<br>'+esc(new Date(Number(BigInt(value)/1000000n)).toISOString())+' UTC';}catch{return esc(value);}}
    if(value&&typeof value==='object')return '<details><summary>추가 속성</summary><pre class="tb-json">'+esc(JSON.stringify(value,null,2))+'</pre></details>';
    return esc(value??'미제공');
  }
  function apiList(name,fields){
    const envelope=resources()?.[name],state=root.GPUFlowMapping.resourceState(envelope);
    const labels={missing:'API 제공 · 이 조회/표본에는 응답 미포함',error:'API 제공 · 중계 조회 실패',invalid:'완전한 목록·응답 형식 확인 실패',empty:'조회 성공 · 빈 목록',present:'응답 표시 가능'};
    return `<section class="panel tb-content" id="tb-api-${name}"><h3>GET /v1/${name}</h3><p>${esc(labels[state.status])}${resourceError?' · '+esc(resourceError):''}</p><p>${mode==='snapshot'?'합성 계약 fixture · DB 실측 캡처 아님':'기존 업무 API 중계 조회'} · ${esc(envelope?.captured_at||'조회 시각 미포함')}</p><div class="tb-table"><table><thead><tr>${fields.map(f=>`<th>${esc(f)}</th>`).join('')}<th>출처·품질</th></tr></thead><tbody>${state.items.map(x=>`<tr>${fields.map(f=>`<td>${readableValue(f,x.data[f])}</td>`).join('')}<td>${syntheticBadge(x)} ${esc(x.provenance.data_origin||'unknown')} · ${esc(Object.entries(x.quality).filter(([,v])=>v===true).map(([k])=>({origin_unknown:'출처 미확인',registry_stale:'오래된 관측',binding_verified:'연결 확인'}[k]||k)).join(', ')||'추가 품질 경고 없음(검증 완료 의미 아님)')}</td></tr>`).join('')||`<tr><td colspan="${fields.length+1}">${esc(labels[state.status])}</td></tr>`}</tbody></table></div><p>저장된 active·변경 이력은 실제 장비 적용·효과의 증거와 구분합니다. ns 원본 값은 문자열로 보존합니다.</p></section>`;
  }
  function kpiTable(){
    const c=catalog();if(!c)return '<p>매핑 자료 준비 중…</p>';
    const rows=root.GPUFlowMapping.scorecardRows(c,resources()?.['scorecard-runs']);
    return `<section class="panel tb-content"><h2>⑬ KPI 10행 매핑</h2><p>${mode==='snapshot'?'정책·스코어카드 합성 계약 fixture · DB 실측 캡처 아님 · batch 관측과 별도 시각':'기존 업무 API 중계 조회 · 원천 provenance/quality 확인'}</p><p>목표는 원본 목업 표기입니다. 조건·검증 주체는 미팅 확정 대상이며 합성값·실측 원천값만으로 목표 달성을 판정하지 않습니다.</p><p>indicator 연결은 명시한 별칭만 사용합니다. 같은 KPI에 여러 run이 있으면 임의 선택하지 않습니다.</p><div class="tb-table"><table id="tb-kpi-table"><thead><tr><th>KPI·목표</th><th>원천 값·출처</th><th>연결·평가 상태</th><th>산식·근거·검증</th></tr></thead><tbody>${rows.map(({kpi:k,row,status})=>`<tr data-review-key="scorecard-${esc(k.widget_id.split('-')[1].replace(/^0/,''))}"><td><b>${esc(k.widget_id)} ${esc(k.title)}</b><p>${esc(k.target)}</p></td><td>${row?syntheticBadge(row)+' '+(row.data.measured==null?'측정값 미제공':esc(row.data.measured)+' '+esc(row.data.unit))+'<p>'+esc(row.provenance.data_origin)+' · '+esc(row.data.source)+'</p><p>run '+esc(row.data.id)+' · '+esc(row.data.run_at)+'</p>':'응답/연결 근거 없음'}</td><td>${esc({mapped:'행 연결됨',ambiguous:'복수 run · 선택 필요',unmapped:'indicator 연결 미확정',missing:'표본 미포함',invalid:'응답 형식 오류',error:'조회 실패',empty:'조회 성공·빈 목록'}[status])}<p>평가 미확정</p></td><td><details><summary>산식·필드·검증 주체</summary><p>${esc(k.formula)}</p><p>${esc(k.evidence)}</p><p>${esc(k.validators)}</p><p>indicator 별칭: ${esc(k.indicator_aliases.join(', '))} · 합성 예시용 별칭이며 실제 DB indicator는 연결 확인 필요</p><p>원본 데이터: ${esc(row?JSON.stringify(row.data):'미포함')}</p></details></td></tr>`).join('')}</tbody></table></div><p>연결되지 않은 원천 indicator: ${esc(root.GPUFlowMapping.resourceState(resources()?.['scorecard-runs']).items.filter(x=>!c.kpis.some(k=>k.indicator_aliases.includes(x.data.indicator))).map(x=>x.data.indicator).join(', ')||'없음/응답 미포함')}</p></section>`;
  }
  function llmPanel(){
    return `<section class="panel tb-content" id="tb-llm"><h3>POST /v1/llm/explain · 고정 mock 응답</h3><p>${mode==='snapshot'?'기존 API 고정 fixture의 오프라인 표시 · API 호출 아님':'업무 API 중계 호출 · 실모델 아님'}</p><div class="tb-filters"><label>질문 <select id="tb-llm-question">${['Q01','Q02','Q03'].map(q=>`<option ${q===llmQuestion?'selected':''}>${q}</option>`).join('')}</select></label><label>데이터 상태 <select id="tb-llm-scenario">${['normal','no_evidence','timeout'].map(s=>`<option ${s===llmScenario?'selected':''}>${s}</option>`).join('')}</select></label><button type="button" class="tb-open" id="tb-llm-run" ${llmBusy?'disabled':''}>${llmBusy?'조회 중…':'선택한 mock 응답 확인'}</button></div>${llmResult?`<p>HTTP ${esc(llmResult.http_status)} · ${esc(llmResult.body?.error?.code||llmResult.body?.response?.status||'응답 오류')}</p><p>${esc(llmResult.body?.response?.answer||llmResult.body?.error?.message||'근거 없음')}</p><details><summary>출처·근거·품질·관측/생성 시각·오류 원본</summary><pre class="tb-json">${esc(JSON.stringify(llmResult.body,null,2))}</pre></details>`:'<p>사용자가 질문을 선택할 때만 표시·호출합니다. 자동 주기 호출은 하지 않습니다.</p>'}</section>`;
  }
  async function requestLlm(){
    const seq=++llmSeq,requestMode=mode;llmBusy=true;llmResult=null;renderExtra();
    try{
      let result;
      if(mode==='snapshot')result=root.GPUFlowMapping.llmFixture(data?.review_api_samples?.llm,llmQuestion,llmScenario)||{http_status:0,body:{error:{code:'FIXTURE_MISSING',message:'표본 미포함'}}};
      else{
        const response=await fetch('/testbed-api/llm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question_id:llmQuestion,scenario:llmScenario}),signal:AbortSignal.timeout(12000)});
        result={http_status:response.status,body:await response.json()};
      }
      if(seq===llmSeq&&mode===requestMode)llmResult=result;
    }catch{if(seq===llmSeq&&mode===requestMode)llmResult={http_status:0,body:{error:{code:'GATEWAY_UNAVAILABLE',message:'API 제공 · 중계 연결 실패'}}};}
    finally{if(seq===llmSeq){llmBusy=false;if(activeScreen==='⑦')renderExtra();}}
  }
  async function refreshResources(){
    if(mode!=='live'||resourceBusy)return;resourceBusy=true;
    try{const r=await fetch('/testbed-api/review-resources',{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error();const value=await r.json();if(mode==='live'){reviewResources=value;resourceError='';}}
    catch{if(mode==='live'){reviewResources=null;resourceError='중계 조회 실패 · 빈 목록으로 처리하지 않음';}}
    finally{resourceBusy=false;if(mode==='live')render();}
  }
  let storageFilters={},storageState=null,storageBusy=false,storageSeq=0;
  async function refreshStorage(){
    if(mode!=='live'||activeScreen!=='⑥'||storageBusy)return;
    storageBusy=true;const seq=++storageSeq;
    try{const r=await fetch('/testbed-api/storage-series',{cache:'no-store',signal:AbortSignal.timeout(35000)});if(!r.ok)throw Error();const v=await r.json();if(seq===storageSeq&&mode==='live')storageState=v;}
    catch{if(seq===storageSeq&&mode==='live')storageState={status:'error'};}
    finally{if(seq===storageSeq){storageBusy=false;if(mode==='live'&&activeScreen==='⑥')renderExtra();}}
  }
  function renderExtra(){
    const requirements=contractWidgets(activeScreen);
    let details='';
    if(!error&&data&&['⑥','⑧'].includes(activeScreen)){
      const a=overviewModel(data,mode);
      if(activeScreen==='⑥')details=storageOverview(a,'tb-fabric-storage-summary');
      else{
        const nodes=new Map();for(const x of a.topology){const n=x.data.attrs?.node;if(!n)continue;const k=x.data.attrs.cluster+'|'+n;if(!nodes.has(k))nodes.set(k,[]);nodes.get(k).push(x);}
        details=`<section class="panel tb-content"><h2>표본의 물리 노드 목록</h2><p>범위: 표본 전체 · health·할당·관리 제어와 분리</p><div class="tb-table"><table><thead><tr><th>클러스터 / 노드</th><th>장비 POD</th><th>등록 구성</th><th>랙</th><th>상태</th></tr></thead><tbody>${[...nodes.values()].map(xs=>`<tr><td>${esc(xs[0].data.attrs.cluster)} / ${esc(xs[0].data.attrs.node)}</td><td>${esc([...new Set(xs.map(x=>x.data.pod))].join(', '))}</td><td>${esc(xs.map(x=>x.data.kind).join(', '))}</td><td>${esc([...new Set(xs.map(x=>x.data.rack||x.data.attrs.rack||'미등록'))].join(', '))}</td><td>표본 미포함</td></tr>`).join('')||'<tr><td colspan="5">등록 물리 노드 없음</td></tr>'}</tbody></table></div></section>`;
      }
    }
    if(activeScreen==='⑥')details+=root.GPUFlowStorage.render(mode==='snapshot'?data?.storage_telemetry:storageState,storageFilters,mode);
    if(activeScreen==='⑦')details+=llmPanel();
    if(activeScreen==='⑨')details+=apiList('policies',['policy','name','owner','rule','workload_id','active','updated_ns'])+apiList('policy-history',['id','policy','ts_ns','actor','reason','span_id','attrs']);
    if(activeScreen==='⑬')details+=kpiTable();
    if(activeScreen==='⑫'&&catalog()?.role_matrix){const m=catalog().role_matrix;details+=`<section class="panel tb-content"><h3>원본 역할×화면 권한 제안</h3><p>${esc(m.status)} · F 전체 / S 자기 범위 / R 조회 / X 숨김</p><div class="tb-table"><table><thead><tr><th>화면</th>${m.roles.map(r=>`<th>${esc(r)}</th>`).join('')}</tr></thead><tbody>${m.rows.map(r=>`<tr><td>${esc(r.screen)}</td>${r.permissions.map(x=>`<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;}
    const markup=`<section class="panel tb-content"><h2>${esc(activeScreen)} 관측 범위·연동 검토</h2><p>${error?esc(error):data?'관측 시각 '+esc(data.captured_at)+' (UTC) · '+(mode==='snapshot'?'과거 표본 · 현재 상태 아님':'API 조회 범위'):'관측 자료 조회 중…'}</p><p>이 페이지의 미연동 영역은 아래에 표시합니다. 실제 데이터가 없는 자리에 시나리오 수치를 채우지 않습니다.</p><button type="button" class="tb-open" id="tb-show-scenario">이 페이지의 시나리오 목업 보기</button><p>제공 담당·계약·일정: 미정 — 글루시스·온라인파워스·해당 기관 / 화면·API 미팅에서 확정</p></section>${details}<div class="tb-two-grid">${requirements.map(contractCard).join('')}</div>`;
    if(extraBox._markup===markup&&extraBox.querySelector('#tb-show-scenario'))return;
    extraBox.innerHTML=markup;extraBox._markup=markup;
    document.getElementById('tb-show-scenario').onclick=()=>{modeSelect.value='scenario';modeSelect.onchange();};
    extraBox.querySelectorAll('[data-storage-filter]').forEach(el=>{el.onchange=()=>{storageFilters[el.dataset.storageFilter]=el.value;renderExtra();};});
    const question=document.getElementById('tb-llm-question');if(question){question.onchange=e=>{llmQuestion=e.target.value;llmResult=null;renderExtra();};document.getElementById('tb-llm-scenario').onchange=e=>{llmScenario=e.target.value;llmResult=null;renderExtra();};document.getElementById('tb-llm-run').onclick=requestLlm;}
    root.dispatchEvent(new Event('gpuflow:testbed-render'));
  }

  function renderGlobalScope(){
    let box=document.getElementById('tb-global-scope');if(!box){box=document.createElement('section');box.id='tb-global-scope';box.className='panel tb-content';document.getElementById('tb-toolbar').after(box);}
    box.hidden=mode==='scenario';if(box.hidden)return;
    const g=catalog()?.global_scope;if(!g)return;
    const html=`<h3>전역 범위 · 관측 모드 지원 상태</h3><div class="tb-filters"><label>물리 범위 <select disabled><option>① 컴퓨트 / ⑥ DAOS 별도 필터</option></select></label><label>Period <select disabled><option>${mode==='snapshot'?'관측 시각 고정':'API 조회 시각 기준'}</option><option>1h / 1m 집계 미제공</option><option>12h / 10m 집계 미제공</option></select></label><label>Role <select disabled><option>서버 인증 범위 · UI 전환 미지원</option></select></label><label>테넌트 <select disabled><option>전역 필터 미연동</option></select></label><label>네임스페이스 <select disabled><option>전역 필터 미연동</option></select></label></div><p>${esc(g.screens[activeScreen])}</p><details><summary>기간·범위·권한·감사 결정 사항</summary>${Object.entries(g).filter(([k])=>k!=='screens').map(([k,v])=>`<p>${esc(k)}: ${esc(v)}</p>`).join('')}</details>`;
    if(box.innerHTML!==html)box.innerHTML=html;
  }
  function render(){
    renderGlobalScope();
    const overview=activeScreen==='①';
    const views={'①':'ov','②':'dt','③':'dt','④':'dt','⑤':'dt','⑥':'fab','⑦':'dt','⑧':'node','⑨':'pol','⑩':'ten','⑪':'alr','⑫':'aud','⑬':'sc'};
    const extra=mode!=='scenario'&&['⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬'].includes(activeScreen);
    extraBox.hidden=!extra;
    mappingBox.hidden=mode!=='scenario'||activeScreen==='⑬';
    if(!mappingBox.hidden){const html=contractWidgets(activeScreen).filter(w=>!['W11-01','W11-02'].includes(w.id)).map(contractCard).join('');if(mappingBox.innerHTML!==html)mappingBox.innerHTML=html;}
    for(const id of new Set(Object.values(views)))document.getElementById(id).hidden=extra||id!==views[activeScreen];
    const work=mode!=='scenario'&&activeScreen==='②';
    const path=mode!=='scenario'&&activeScreen==='③';
    const analysis=mode!=='scenario'&&activeScreen==='④';
    analysisBox.hidden=!analysis;
    pathBox.hidden=!path;
    workBox.hidden=!work;
    if(['②','③','④'].includes(activeScreen))document.getElementById('dt').hidden=work||path||analysis;
    document.getElementById('scopebar').hidden=mode!=='scenario';
    document.querySelector('.top .note').innerHTML=mode==='scenario'?originalNote:'표본에 포함된 관측과 미연동 항목을 구분합니다. 과거 표본은 현재 상태가 아닙니다.';
    document.getElementById('live').style.visibility=mode!=='scenario'?'hidden':'';
    document.querySelector('#live b').textContent='SCENARIO';
    document.getElementById('pause').hidden=mode!=='scenario';
    document.getElementById('tb-mode-note').textContent=mode==='scenario'?'시나리오 예시 값':(mode==='live'?'기존 업무 API 조회 · 5초 갱신 · 화면별 연동 범위 확인':'저장된 관측 · 실시간 데이터 아님');
    if(mode==='snapshot'&&snapshot?.redacted&&snapshot.sample_notice)document.getElementById('tb-mode-note').textContent+=' · '+snapshot.sample_notice;
    const legend=document.querySelector('#scrh .srcb');if(legend){legend.hidden=mode!=='scenario';if(mode==='scenario')legend.textContent='시나리오 예시 · 실측/Replay 연결 아님 · 조작은 브라우저 내에서만 반영';}
    if(footer)footer.innerHTML=mode!=='scenario'?'GPUFlow 관측 검토 · 출처·관측 시각·연동 범위를 확인하세요.':'GPUFlow 시나리오 목업 · 모든 수치·예측·제어 결과는 예시입니다.';
    if(extra){renderExtra();return;}
    if(path){renderPath();return;}
    if(analysis){renderAnalysis();return;}
    if(work){renderWorkloads();loadSeries();return;}
    if(mode==='scenario'||!overview)return;
    const ov=document.getElementById('ov');
    if(error||!data){ov.innerHTML=`<section class="panel tb-content" role="status"><h2>테스트베드 전체 현황</h2><p>${esc(error||'조회 중…')}</p><p>확인되지 않은 값을 0이나 시나리오 숫자로 대체하지 않습니다.</p></section>`;return;}
    renderOverviewContent(ov);
  }

  async function refresh(){
    if(mode==='scenario'||busy)return;
    if(mode==='snapshot'){data=snapshot;error=data?'':'저장된 표본이 없습니다. 표본을 포함한 outbox 미리보기를 열어 주세요.';render();return;}
    refreshStorage();
    busy=true;
    try{
      if(location.protocol==='file:')throw Error('실시간 조회는 승인된 내부 미리보기 주소에서 이용하세요. 이 파일에는 저장된 관측이 포함됩니다.');
      const response=await fetch('/testbed-api/snapshot',{cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error('API 조회 실패 · 현재 관계 미확인');
      const value=await response.json();aggregate(value);if(mode==='live'){data=value;error='';refreshResources();}
    }catch(e){if(mode==='live'){data=null;error=e.message;reviewResources=null;resourceError='현재 조회 실패 · 이전 응답으로 대체하지 않음';}}
    finally{busy=false;render();}
  }
  modeSelect.onchange=()=>{mode=modeSelect.value;++storageSeq;storageBusy=false;storageState=null;storageFilters={};++llmSeq;llmBusy=false;llmResult=null;reviewResources=null;resourceError='';++seriesSequence;seriesBusy=false;seriesState=null;data=null;error='';cluster='';pod='';rack='';node='';const u=new URL(location.href);u.searchParams.set('data',mode);history.replaceState(null,'',u);root.render();refresh();};
  root.addEventListener('gpuflow:catalog-ready',()=>render());
  root.addEventListener('gpuflow:render',event=>{activeScreen=event.detail.screen;render();refreshStorage();});
  setInterval(()=>{if(mode!=='scenario')render();},1000);
  setInterval(refresh,5000);
  root.GPUFlowTestbed.isEnabled=()=>mode!=='scenario';
  root.GPUFlowTestbed.draw=render;
  root.GPUFlowTestbed.selectedWorkload=()=>mode!=='scenario'&&['②','③','④'].includes(activeScreen)?selected:null;
  refresh();render();
  if(mode!=='scenario'&&(selected||new URL(location.href).searchParams.has('screen')))root.go(({overview:'①',path:'③',analysis:'④',storage:'⑥'})[new URL(location.href).searchParams.get('screen')]||'②');
})(typeof window==='undefined'?globalThis:window);
