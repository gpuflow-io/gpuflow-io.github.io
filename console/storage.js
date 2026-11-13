/* DAOS preview: exact VM rates; no native+standard double counting or zero fill. */
(function(root){
  'use strict';
  const dimensions=['cluster','pod','node','pool','rank','target'];
  const identity=l=>JSON.stringify(['cluster','pod','node','pool','rank','target','source','backend'].map(k=>l?.[k]));
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stateText={ok:'실측',no_data:'미수집 / 표본 없음',stale:'오래된 관측',insufficient:'표본 부족',invalid:'응답 형식 오류',ambiguous:'중복 시리즈 · 집계 보류',error:'조회 실패',missing:'표본 미포함'};
  const stamp=x=>Number.isFinite(x)?new Date(x*1000).toISOString():'미제공';
  function pointState(p,rateField='bytes_per_second'){
    if(!p||p[rateField]===undefined||p.counter===undefined||p.sample_at===undefined||p.samples===undefined)return 'no_data';
    if(!['at',rateField,'counter','sample_at','samples'].every(k=>Number.isFinite(p[k]))||p[rateField]<0||p.counter<0||p.samples<0||p.sample_at>p.at)return 'invalid';
    if(p.at-p.sample_at>15)return 'stale';
    if(p.samples<2)return 'insufficient';
    return 'ok';
  }
  function model(envelope,filters={},mode='snapshot',now=Date.now()/1000,kind='bytes'){
    const rateField=kind==='ops'?'ops_per_second':'bytes_per_second';
    const empty=status=>({status,rows:[],options:Object.fromEntries(dimensions.map(k=>[k,[]]))});
    if(!envelope)return empty('missing');
    if(envelope.status==='error')return empty('error');
    const e=envelope,w=e.window;
    if((kind==='ops'&&e.kind!=='daos_rpc_ops')||e.schema_version!==1||e.status!=='ok'||e.provenance?.data_origin!=='measured'||e.provenance?.simulated!==false||!Number.isFinite(Date.parse(e.captured_at))||!Array.isArray(e.series)||e.series.length>512||!w||w.step!==5||w.rate_window!==60||!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.end-w.start!==900)return empty('invalid');
    const groups=new Map(),options=Object.fromEntries(dimensions.map(k=>[k,new Set()]));
    for(const s of e.series){
      const l=s.labels;
      if(!l||!dimensions.every(k=>typeof l[k]==='string'&&l[k])||l.source!=='gluesys'||l.backend!=='daos'||l.cluster!==e.scope?.cluster||l.data_origin!=='measured'||l.simulated!=='false'||l.job!=='gpuflow-measured-daos'||!['read','write'].includes(s.direction)||s.metric!==(kind==='ops'?'gpuflow_storage_target_ops_total':`gpuflow_storage_target_${s.direction}_bytes_total`)||(kind==='ops'&&l.operation!==s.direction)||!Array.isArray(s.points)||s.points.length>181)return empty('invalid');
      let prev=-Infinity;
      for(const p of s.points){if(!Number.isFinite(p.at)||p.at<w.start||p.at>w.end||(p.at-w.start)%w.step!==0||p.at<=prev||pointState(p,rateField)==='invalid')return empty('invalid');prev=p.at;}
      for(const k of dimensions)options[k].add(l[k]);
      const key=identity(l);if(!groups.has(key))groups.set(key,{labels:l,read:[],write:[]});groups.get(key)[s.direction].push(s);
    }
    const rows=[];
    for(const g of groups.values()){
      if(!dimensions.every(k=>!filters[k]||g.labels[k]===filters[k]))continue;
      for(const direction of ['read','write']){
        const xs=g[direction],points=[];
        const byTime=new Map(xs.length===1?xs[0].points.map(p=>[p.at,p]):[]);
        for(let at=w.start;at<=w.end;at+=w.step){const raw=byTime.get(at),status=xs.length>1?'ambiguous':pointState(raw,rateField);points.push({at,status,value:status==='ok'?raw[rateField]:null,raw});}
        const valid=points.filter(p=>p.status==='ok'),peak=valid.length?Math.max(...valid.map(p=>p.value)):null;
        const latest=points.at(-1),stale=mode==='live'&&(now-w.end>45||now<w.end||now-Date.parse(e.captured_at)/1000>45);
        rows.push({labels:g.labels,direction,points,peak,status:stale?'stale':latest.status,value:!stale&&latest.status==='ok'?latest.value:null,counter:latest.raw?.counter,sample_at:latest.raw?.sample_at,valid_points:points.filter(p=>p.status==='ok').length});
      }
    }
    return {status:rows.length?'ok':'no_data',rows,window:w,options:Object.fromEntries(dimensions.map(k=>[k,[...options[k]].sort()]))};
  }
  function chart(row,w,unit='MiB/s'){
    const divisor=unit==='RPC/s'?1:1048576;
    const good=row.points.filter(p=>p.status==='ok');
    if(!good.length)return `<p>${esc(stateText[row.status])} · 결측을 0으로 채우지 않습니다.</p>`;
    const top=Math.max(1,...good.map(p=>p.value/divisor)),segments=[];let segment=[];
    for(const p of row.points){if(p.status==='ok')segment.push(`${40+(p.at-w.start)/(w.end-w.start)*660},${145-p.value/divisor/top*115}`);else if(segment.length){segments.push(segment);segment=[];}}
    if(segment.length)segments.push(segment);
    const color=row.direction==='read'?'#38bdf8':'#fbbf24';
    return `<svg viewBox="0 0 740 185" role="img" aria-label="${esc(row.labels.node+' '+row.direction)} 처리량 시계열 ${esc(unit)}"><line x1="40" y1="145" x2="700" y2="145" stroke="#64748b"/><text x="40" y="20" fill="currentColor">상한 ${top.toFixed(3)} ${esc(unit)}</text><text x="10" y="145" fill="currentColor">0</text>${segments.map(s=>s.length===1?`<circle cx="${s[0].split(',')[0]}" cy="${s[0].split(',')[1]}" r="2" fill="${color}"/>`:`<polyline points="${s.join(' ')}" fill="none" stroke="${color}" stroke-width="2"/>`).join('')}<text x="40" y="174" fill="currentColor">${stamp(w.start).slice(11,19)} UTC</text><text x="600" y="174" fill="currentColor">${stamp(w.end).slice(11,19)} UTC</text></svg>`;
  }
  function experiment(e){
    if(e?.kind!=='bounded_daos_io_v1')return '';
    const names={idle_before:'시작 전 유휴',write:'쓰기',settle_write:'쓰기 후 대기',read:'읽기',settle_read:'읽기 후 대기'};
    return `<div id="tb-storage-experiment"><h3>실제 DAOS 읽기·쓰기 시험</h3><p>${e.status==='passed'?'시험 완료':'검증 미완'} · 쓰기 ${esc(e.write_bytes/1048576)} MiB · 읽기 ${esc(e.read_bytes/1048576)} MiB · 해시 확인 ${esc(e.checksum_verified_files)}/${esc(e.files)}개</p><p>시각 ${esc(e.started_at)} ~ ${esc(e.ended_at)} · 임시 컨테이너 ${e.cleanup?.owned_container_removed===true?'삭제 확인':'정리 확인 필요'} · 기존 컨테이너 ${e.cleanup?.preexisting_containers_preserved===true?'보존 확인':'확인 필요'}</p><p>관측 시리즈는 공유 Pool 단위입니다. DAOS 메타데이터·동시 I/O를 포함할 수 있으며 이 워크로드만의 처리량으로 귀속하지 않습니다. GPU 작업은 포함하지 않습니다.</p><details><summary>시험 단계 시각</summary>${(e.phases||[]).map(p=>`<p>${esc(names[p.phase]||p.phase)}: ${esc(p.at)}</p>`).join('')}</details></div>`;
  }
  function render(e,filters={},mode='snapshot',now=Date.now()/1000){
    const m=model(e,filters,mode,now),names={cluster:'클러스터',pod:'장비 POD',node:'노드',pool:'Pool',rank:'rank',target:'target'};
    return `<section class="panel tb-content" id="tb-storage-throughput" data-review-key="storage-load"><h2>DAOS 읽기·쓰기 처리량</h2><p>${mode==='snapshot'?'저장된 실측 · 현재 상태 아님':'VM 조회 · 최근 구간'} · 조회 대상: measured / simulated=false</p><p>이 영역은 DAOS I/O만 표시합니다. RPC 처리율·원천 지연·VOS 용량은 아래 별도 영역에서 확인합니다. 디스크 IOPS·전체 건강 상태·Lustre·DPU는 미연동입니다. 누적 바이트를 부하율(%)로 해석하지 않습니다.</p>${experiment(e?.experiment)}${m.window?`<p>처리량 관측 구간 <b>${stamp(m.window.start)} ~ ${stamp(m.window.end)}</b> · 조회 완료 ${esc(e.captured_at)}<br>1분 rate · 5초 step · 수집 안정화를 위해 조회 끝을 현재보다 최소 10초 이전으로 둡니다. 위의 등록 자료와 별도 관측입니다.</p>`:''}<div class="tb-filters">${dimensions.map(k=>`<label>${names[k]} <select data-storage-filter="${k}"><option value="">전체 관측값</option>${m.options[k].map(v=>`<option value="${esc(v)}" ${filters[k]===v?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`).join('')}</div><p>필터는 이 DAOS 영역에만 적용됩니다. 장비 POD는 Kubernetes Pod가 아닙니다. 목록은 응답에 존재하는 시리즈이며 전체 장비 인벤토리가 아닙니다.</p><div class="tb-table"><table><thead><tr><th>노드 / Pool / rank / target</th><th>방향</th><th>최신 처리량 (MiB/s)</th><th>구간 최대 (MiB/s)</th><th>누적 원본 (bytes)</th><th>품질 / 유효 지점</th><th>마지막 원천 시각 (UTC)</th></tr></thead><tbody>${m.rows.map(r=>`<tr data-storage-node="${esc(r.labels.node)}" data-direction="${r.direction}" data-status="${r.status}"><td>${esc(r.labels.node)} / ${esc(r.labels.pool)} / ${esc(r.labels.rank)} / ${esc(r.labels.target)}</td><td>${r.direction==='read'?'읽기':'쓰기'}</td><td class="storage-rate">${r.value===null?'—':(r.value/1048576).toFixed(6)}</td><td class="storage-peak">${r.peak===null?'—':(r.peak/1048576).toFixed(6)}</td><td>${r.counter===undefined?'—':esc(r.counter)}</td><td>${esc(stateText[r.status])} · ${r.valid_points}/181</td><td>${stamp(r.sample_at)}</td></tr>`).join('')||`<tr><td colspan="7">${esc(stateText[m.status])}</td></tr>`}</tbody></table></div><div class="tb-two-grid">${m.rows.map(r=>`<section class="panel tb-content"><h3>${esc(r.labels.node)} · ${r.direction==='read'?'읽기':'쓰기'}</h3><p>Pool ${esc(r.labels.pool)} / rank ${esc(r.labels.rank)} / target ${esc(r.labels.target)} · ${esc(stateText[r.status])}</p>${chart(r,m.window)}</section>`).join('')}</div><details><summary>원천 → 가공 → 화면 연결 / 조회식</summary><p>글루시스 DAOS exporter: engine_pool_xferred_fetch / engine_pool_xferred_update (누적 bytes). 로컬 node-agent: 값을 바꾸지 않고 표준 read/write counter로 복사. 수집기·guard → VM 저장. 온라인파워스 백엔드: VM query_range에서 rate(counter[1m]) 조회 후 1,048,576으로 나누어 MiB/s 표시.</p><p>구간 최대는 1분 평균 rate 중 최댓값이며 장비 최대 성능이 아닙니다. 시리즈별 계산이며 원본·표준을 합산하지 않습니다. 시각이 15초 넘게 오래되거나 1분 안의 표본이 2개 미만이면 최신 수치를 숨깁니다. 데이터 없음·조회 실패·중복을 0으로 치환하지 않습니다. 과거 그래프의 빈 구간은 연결하지 않습니다.</p><pre class="tb-json">${esc(JSON.stringify(e?.queries||{},null,2))}</pre></details></section>`;
  }
  const api={model,pointState,render,chart,opsModel:(e,f,m,n)=>model(e,f,m,n,'ops')};if(typeof module!=='undefined')module.exports=api;root.GPUFlowStorage=api;
})(typeof window==='undefined'?globalThis:window);
