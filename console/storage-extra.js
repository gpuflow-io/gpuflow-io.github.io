/* Independent evidence scopes: VM pool RPC rates; direct exporter target statistics. */
(function(root){
 'use strict';
 const S=typeof module!=='undefined'?require('./storage.js'):root.GPUFlowStorage;
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const key=r=>r.name+'|'+JSON.stringify(Object.entries(r.labels).sort());
 const iso=ns=>new Date(Number(BigInt(ns)/1000000n)).toISOString();
 const status={ok:'확인',missing:'표본 미포함',invalid:'응답 형식 오류',no_samples:'구간 표본 없음',reset:'counter 감소 · 평균 보류',error:'조회 실패',no_data:'관측 시리즈 없음',stale:'오래된 관측',ambiguous:'중복 시리즈',insufficient:'표본 부족'};
 function nativeModel(e,filters={}){
  const fail=state=>({status:state,capacity:[],latency:[],windows:[]});
  if(!e)return fail('missing');
  if(e.schema_version!==1||e.status!=='ok'||e.transport!=='offline_exporter_capture'||e.vm_capacity_latency_connected!==false||e.provenance?.data_origin!=='measured'||e.provenance?.simulated!==false||!Array.isArray(e.frames))return fail('invalid');
  const groups=new Map();
  for(const f of e.frames){
   if(!f||!['before','after'].includes(f.phase)||!['node','cluster','pod'].every(k=>typeof f[k]==='string'&&f[k])||!/^\d{19}$/.test(f.completed_at_ns)||!Array.isArray(f.rows))return fail('invalid');
   const k=JSON.stringify([f.cluster,f.node,f.pod]);if(!groups.has(k))groups.set(k,{});const group=groups.get(k);if(group[f.phase])return fail('invalid');
   const map=new Map();
   for(const r of f.rows){
    if(!r||!r.labels||typeof r.labels!=='object')return fail('invalid');
    const cap=/^engine_pool_vos_space_(scm|nvme)_(used|total)$/.test(r.name),lat=/^engine_io_latency_(fetch|update)_(sum|samples)$/.test(r.name),ops=/^engine_pool_ops_(fetch|update)$/.test(r.name);
    if(!(cap||lat||ops)||r.type!==(cap?'gauge':'counter')||!r.labels||!Number.isFinite(r.value)||r.value<0||!['rank','target'].every(k=>typeof r.labels[k]==='string')||(cap&&!r.labels.pool)||(lat&&!r.labels.size)||map.has(key(r)))return fail('invalid');
    map.set(key(r),r);
   }
   group[f.phase]={frame:f,map};
  }
  const result={status:'ok',capacity:[],latency:[],windows:[]};
  for(const g of groups.values()){
   if(!g.before||!g.after)return fail('invalid');const b=g.before,a=g.after,f=a.frame;
   if(BigInt(f.completed_at_ns)<=BigInt(b.frame.completed_at_ns))return fail('invalid');
   if(!['cluster','node','pod'].every(k=>!filters[k]||filters[k]===f[k]))continue;
   result.windows.push({node:f.node,from:iso(b.frame.completed_at_ns),to:iso(f.completed_at_ns)});
   const match=r=>['rank','target'].every(k=>!filters[k]||filters[k]===r.labels[k]);
   // A missing or added paired statistic is a contract issue, never a zero.
   if(b.map.size!==a.map.size||[...b.map.keys()].some(k=>!a.map.has(k)))return fail('invalid');
   const peer=(map,r,name)=>map.get(key({...r,name}));
   for(const r of a.map.values()){
    if(!match(r))continue;let m;
    if((m=r.name.match(/^engine_pool_vos_space_(scm|nvme)_used$/))&&(!filters.pool||r.labels.pool===filters.pool)){
     const total=peer(a.map,r,r.name.replace(/used$/,'total')),old=b.map.get(key(r));
     if(!total||total.value<=0||r.value>total.value)return fail('invalid');
     result.capacity.push({node:f.node,...r.labels,tier:m[1],used_bytes:r.value,total_bytes:total.value,used_ratio:r.value/total.value,before_used_bytes:old.value,observed_at:iso(f.completed_at_ns)});
    }
    if((m=r.name.match(/^engine_io_latency_(fetch|update)_sum$/))){
     const count=peer(a.map,r,r.name.replace(/sum$/,'samples')),old=b.map.get(key(r)),oldCount=peer(b.map,r,r.name.replace(/sum$/,'samples'));
     if(!count||!oldCount||!Number.isInteger(count.value)||!Number.isInteger(oldCount.value))return fail('invalid');
     const dn=count.value-oldCount.value,ds=r.value-old.value;
     const state=dn<0||ds<0?'reset':dn===0?(ds===0?'no_samples':'invalid'):'ok';
     result.latency.push({node:f.node,...r.labels,direction:m[1],status:state,sample_delta:dn,sum_delta_us:ds,mean_ms:state==='ok'?ds/dn/1000:null});
    }
   }
  }
  return result;
 }
 function render(ops,native,filters={},mode='snapshot'){
  const m=S.opsModel(ops,filters,mode),n=nativeModel(mode==='snapshot'?native:null,filters);
  const table=(heads,rows)=>`<div class="tb-table"><table><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  const rpc=`<section class="panel tb-content" id="tb-storage-rpc" data-review-key="storage-load"><h2>DAOS fetch/update RPC 처리율</h2><p>IOPS 연결 검토: 서버 object RPC/s입니다. 파일 복사 횟수·애플리케이션 IOPS·디스크 IOPS와 다릅니다. 공유 Pool 원본과 표준 counter를 중복 합산하지 않습니다.</p><p>${esc(ops?.captured_at||'조회 미완')} 조회 · ${ops?.window?new Date(ops.window.start*1000).toISOString()+' ~ '+new Date(ops.window.end*1000).toISOString():''} · 1분 rate / 5초 step. 위 DAOS 필터를 동일하게 적용합니다.</p>${table(['노드 / rank / target / Pool','방향','최신 RPC/s','구간 최대 RPC/s','누적 RPC','품질'],m.rows.map(r=>`<tr data-rpc-node="${esc(r.labels.node)}" data-direction="${r.direction}"><td>${esc(r.labels.node)} / ${esc(r.labels.rank)} / ${esc(r.labels.target)} / ${esc(r.labels.pool)}</td><td>${r.direction==='read'?'fetch':'update'}</td><td>${r.value===null?'—':r.value.toFixed(6)}</td><td class="rpc-peak">${r.peak===null?'—':r.peak.toFixed(6)}</td><td>${esc(r.counter??'—')}</td><td>${esc(status[r.status])} · ${r.valid_points}/181</td></tr>`).concat(m.rows.length?[]:[`<tr><td colspan="6">${esc(status[m.status])}</td></tr>`]))}<div class="tb-two-grid">${m.rows.map(r=>`<section class="panel tb-content"><h3>${esc(r.labels.node)} ${r.direction==='read'?'fetch':'update'}</h3>${S.chart(r,m.window,'RPC/s')}</section>`).join('')}</div><details><summary>조회식</summary><pre class="tb-json">${esc(JSON.stringify(ops?.queries||{},null,2))}</pre></details></section>`;
  const notice=mode==='snapshot'?'저장된 원천 exporter 캡처 · VM/제품 API 연동 미완':'원천 패널 실시간 경로 미구성 · 이전 저장 표본으로 대체하지 않습니다.';
  const windowText=n.windows.map(w=>`${w.node}: ${w.from} ~ ${w.to}`).join(' / ');
  const cap=`<section class="panel tb-content" id="tb-storage-capacity" data-review-key="storage-summary"><h2>VOS 용량 원천 검증</h2><p>${notice}</p><p>${esc(windowText)}</p><p>node/rank/target/Pool/SCM·NVMe별 used / total. DAOS가 보고한 VOS 수치이며 전체 장비 용량·쓰기 가능 공간·dmg free의 역산과 다릅니다. SCM과 NVMe는 합쳐 표시하지 않습니다.</p>${table(['노드 / Pool / rank / target','매체','이전 사용(MiB)','이후 사용(MiB)','할당(GiB)','VOS used/total'],n.capacity.map(r=>`<tr><td>${esc(r.node)} / ${esc(r.pool)} / ${esc(r.rank)} / ${esc(r.target)}</td><td>${esc(r.tier.toUpperCase())}</td><td>${(r.before_used_bytes/1048576).toFixed(3)}</td><td>${(r.used_bytes/1048576).toFixed(3)}</td><td>${(r.total_bytes/1073741824).toFixed(3)}</td><td>${(r.used_ratio*100).toFixed(4)}%</td></tr>`).concat(n.capacity.length?[]:[`<tr><td colspan="6">${esc(status[n.status==='ok'?'no_data':n.status])}</td></tr>`]))}</section>`;
  const latRows=n.latency.filter(r=>r.status!=='no_samples'),noSamples=n.latency.filter(r=>r.status==='no_samples').length;
  const lat=`<section class="panel tb-content" id="tb-storage-latency" data-review-key="storage-load"><h2>RPC 크기별 지연 참고 평균</h2><p>${notice}</p><p>${esc(windowText)}</p><p>Δsum(µs) ÷ Δsamples ÷ 1000 → ms. 전후 차분 기반 참고 평균이며 중간 counter reset은 미검증입니다. size는 I/O 크기 분류이며 지연 histogram bucket이 아닙니다. p95/p99는 산출 불가합니다.</p><p>engine 범위: node/rank/target만 귀속. Pool 라벨이 없어 <b>Pool 필터는 지연에 적용하지 않습니다</b>. 워크로드·Pool 지연으로 해석하지 않습니다.</p>${table(['노드 / rank / target','RPC','I/O 크기 분류','구간 표본 수','참고 평균(ms)','품질'],latRows.map(r=>`<tr><td>${esc(r.node)} / ${esc(r.rank)} / ${esc(r.target)}</td><td>${esc(r.direction)}</td><td>${esc(r.size)}</td><td>${esc(r.sample_delta)}</td><td>${r.mean_ms===null?'—':r.mean_ms.toFixed(6)}</td><td>${esc(status[r.status])}</td></tr>`).concat(latRows.length?[]:[`<tr><td colspan="6">${esc(status[n.status==='ok'?'no_samples':n.status])}</td></tr>`]))}<p>새 표본이 없는 크기 분류: ${noSamples}행. 지연 0으로 표시하지 않습니다.</p></section>`;
  return rpc+cap+lat;
 }
 const api={nativeModel,render};if(typeof module!=='undefined')module.exports=api;root.GPUFlowStorageExtra=api;
})(typeof window==='undefined'?globalThis:window);
