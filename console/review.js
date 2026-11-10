/* Optional, local-only meeting overlay. Never calls the product API. */
(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const statuses = {unreviewed:'미검토', agreed:'합의 (회의 기록)', change:'수정 필요', later:'후속 단계'};
  let catalog, selected, enabled = false, autoPaused = false, records = {}, storageKey;
  let context = {screen:'①', workload:'미선택', range:'live'};
  const toolbar = document.createElement('section');
  toolbar.id = 'review-toolbar';
  toolbar.setAttribute('aria-label','목업·소스·역할 연결 검토');
  toolbar.innerHTML = `<button id="review-toggle" type="button" disabled aria-pressed="false" aria-controls="review-panel">목업·소스 연결 검토</button>
    <button id="review-mockup" type="button" disabled>목업으로 회의 시작</button>
    <button id="review-matrix-toggle" type="button" disabled aria-expanded="false" aria-controls="review-matrix">현재 화면 역할표</button>
    <span id="review-summary" role="status">검토 자료 준비 중…</span>
    <div class="review-exports" hidden><button type="button" data-export="csv">CSV 내보내기</button><button type="button" data-export="md">Markdown 내보내기</button><button type="button" data-export="json">JSON 백업</button></div>`;
  $('.top').insertAdjacentElement('afterend', toolbar);
  const matrix = document.createElement('section');
  matrix.id = 'review-matrix'; matrix.hidden = true;
  toolbar.after(matrix);
  const panel = document.createElement('aside');
  panel.id = 'review-panel'; panel.hidden = true;
  panel.setAttribute('aria-label', '위젯 데이터 계약 검토');
  document.body.append(panel);

  const notice = text => { $('#review-summary').textContent = text; };
  function loadRecords() {
    try {
      const accepted=[catalog.revision,...(catalog.compatible_revisions||[])];
      const raw = accepted.map(v=>localStorage.getItem('gpuflow-widget-review:'+v)).find(Boolean);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!accepted.includes(saved.revision) || !Array.isArray(saved.records)) throw Error('version');
      for (const row of saved.records) {
        if (!catalog.widgets.some(w => w.id === row.id) || !Object.hasOwn(statuses, row.status)) continue;
        records[row.id] = {status:row.status};
        for (const key of ['note','owner','due','updated_at']) records[row.id][key] = typeof row[key] === 'string' ? row[key].slice(0,4000) : '';
      }
    } catch (_) { notice('이 브라우저의 이전 기록을 읽지 못했습니다. 현재 기록은 내보내기로 보관하세요.'); }
  }
  function payload() {
    return {schema_version:1, revision:catalog.revision, exported_at:new Date().toISOString(),
      status:'브라우저 회의 기록 · 공식 계약 승인 아님', records:catalog.widgets.map(w => ({
        revision:catalog.revision, id:w.id, screen:w.screens.join('/'), title:w.title, readiness:w.readiness,
        mockup:w.handoff?.mockup, institution:w.handoff?.institution.source, provider:w.handoff?.institution.provider,
        gluesys:w.handoff?.gluesys.process, output:w.handoff?.gluesys.output, onlinepowers:w.handoff?.onlinepowers.binding,
        current:w.handoff?.current, gap:w.handoff?.gap,
        status:'unreviewed', note:'', owner:'', due:'', updated_at:'', ...records[w.id]
      }))};
  }
  function saveRecord() {
    const record = {status:$('#review-status').value, note:$('#review-note').value,
      owner:$('#review-owner').value, due:$('#review-due').value, updated_at:new Date().toISOString()};
    records[selected.id] = record;
    try {
      localStorage.setItem(storageKey, JSON.stringify(payload()));
      $('#review-save').textContent = '이 브라우저에 저장됨 · 공동 문서에는 아직 반영되지 않음';
    } catch (_) { $('#review-save').textContent = '브라우저 저장 불가 · 탭을 닫기 전에 내보내세요'; }
    decorate();
  }
  function setURL(widget) {
    const url = new URL(location.href);
    if (enabled) { url.searchParams.set('review','1'); if (widget) url.searchParams.set('widget',widget.id); }
    else { url.searchParams.delete('review'); url.searchParams.delete('widget'); }
    history.replaceState(null,'',url);
  }
  function decorate() {
    document.querySelectorAll('[data-review-key]').forEach(el => {
      const widget = catalog?.widgets.find(w => w.key === el.dataset.reviewKey);
      if (!widget) return;
      el.classList.toggle('review-target',enabled);
      el.classList.toggle('review-selected',enabled && selected?.id === widget.id);
      let button = $('.review-badge',el);
      if (!enabled) { button?.remove(); return; }
      if (!button) {
        button = document.createElement('button'); button.type = 'button'; button.className = 'review-badge';
        el.prepend(button);
      }
      button.textContent = widget.id + ' · ' + statuses[records[widget.id]?.status || 'unreviewed'];
      button.setAttribute('aria-label',widget.id+' '+widget.title+' 데이터 계약 열기');
      button.setAttribute('aria-controls','review-panel');
    });
  }
  function list(values) { return '<ul>'+values.map(v=>'<li>'+esc(v)+'</li>').join('')+'</ul>'; }
  function section(title, content) { return '<section class="review-section"><h3>'+esc(title)+'</h3>'+content+'</section>'; }
  function flowCards(w) {
    const h=w.handoff;
    if(!h)return '<p>역할 연결 내용 확인 필요</p>';
    return `<div class="review-grid">
      <section class="review-flow-card"><h3>목업에서 보여줄 내용</h3><p>${esc(h.mockup)}</p></section>
      <section class="review-flow-card"><h3>기관 · 원천 제공</h3><p class="review-provider">${esc(h.institution.provider)}</p><p>${esc(h.institution.source)}</p><small>${esc(h.institution.status)}</small></section>
      <section class="review-flow-card"><h3>글루시스 · 가공·제공</h3><p>${esc(h.gluesys.process)}</p><p><b>화면에 줄 결과</b><br>${esc(h.gluesys.output)}</p><small>${esc(h.gluesys.status)}</small></section>
      <section class="review-flow-card"><h3>온라인파워스 · 화면 연결</h3><p>${esc(h.onlinepowers.binding)}</p><small>${esc(h.onlinepowers.display)}</small></section>
    </div>`;
  }
  function scopeCards() {
    return (catalog.scope_handoffs||[]).map(g=>`<section class="review-scope-card"><h4>${esc(g.name)}</h4><p><b>원천:</b> ${esc(g.institution)}</p><p><b>글루시스:</b> ${esc(g.gluesys)}</p><p><b>온라인파워스:</b> ${esc(g.onlinepowers)}</p><p class="review-gap">${esc(g.current)}</p></section>`).join('');
  }
  function renderMatrix() {
    if(!catalog||matrix.hidden)return;
    // This is static meeting metadata. Scenario ticks must not collapse details or steal focus.
    if(matrix.dataset.screen===context.screen)return;
    const ws=catalog.widgets.filter(w=>w.screens.includes(context.screen));
    matrix.innerHTML=`<header><h2>${esc(context.screen)} 목업 → 소스 → 가공 → 화면 연결</h2><p>${esc(catalog.meeting_contract.basis)}</p><p>${esc(catalog.meeting_contract.responsibility)}</p><p>${esc(catalog.meeting_contract.source_status)}</p><small>${ws.length}개 위젯 · ${esc(catalog.revision)} · 담당·제공일은 회의에서 확정</small></header>
      <details class="review-scope"><summary>전역 범위 바도 같은 역할 분담으로 검토</summary>${scopeCards()}</details>
      ${ws.map(w=>`<article class="review-matrix-row" data-handoff-id="${esc(w.id)}"><h3><button type="button" data-review-open="${esc(w.id)}">${esc(w.id+' '+w.title)} · 상세 검토</button></h3>${flowCards(w)}<p><b>현재 구현 근거:</b> ${esc(w.handoff.current)}</p><p class="review-gap"><b>추가 필요·이번에 결정:</b> ${esc(w.handoff.gap)}</p></article>`).join('')}`;
    matrix.dataset.screen=context.screen;
  }
  function show(widget, focus = false) {
    selected = widget;
    const record = records[widget.id] || {status:'unreviewed',note:'',owner:'',due:''};
    panel.innerHTML = `<header><span class="review-kicker">${esc(widget.screens.join(' · '))} · ${esc(widget.id)}</span><button type="button" id="review-close" aria-label="검토 모드 닫기">닫기</button>
      <h2 id="review-title" tabindex="-1">${esc(widget.title)}</h2><span class="review-state">${esc(widget.readiness)}</span></header>
      <p class="review-warning">목업의 표시 의미가 기준입니다. 기관 소스·가공·화면 연결은 검토안이며, 현재 실측/합성/미구현 상태를 아래에서 구분합니다.</p>
      <label class="review-field">위젯 바로가기<select id="review-widget">${catalog.widgets.map(w=>`<option value="${esc(w.id)}" ${w.id===widget.id?'selected':''}>${esc(w.id+' '+w.title)}</option>`).join('')}</select></label>
      <p id="review-context"></p>
      <div id="review-handoff">${flowCards(widget)}</div>
      ${section('현재 구현과 추가 필요', '<p><b>현재:</b> '+esc(widget.handoff.current)+'</p><p class="review-gap"><b>차이·미결:</b> '+esc(widget.handoff.gap)+'</p>')}
      ${section('이번 미팅에서 결정','<p>'+esc(widget.handoff.decision)+'</p>'+list(widget.decisions))}
      <details id="review-technical"><summary>개발 상세 · API·필드·계산·검증 근거</summary>
      <p class="review-muted">가공 위치·새 집계 결과는 제안이며, 아래 기존 API 필드가 이미 구현한 범위와 구분합니다.</p>
      ${section('현재 표시·계산 설명', '<p>'+esc(widget.meaning)+'</p>')}
      ${section('메트릭·라벨',widget.metrics.length ? list(widget.metrics)+'<p class="review-muted">관련 식별/출처 라벨: '+esc(widget.labels.join(', '))+'</p>' : '<p>카탈로그 지표 연결 없음. 업무 API·이벤트 또는 기관 제공 확인 항목을 아래에서 확인하세요.</p>')}
      ${section('조회 경로·필드',list(widget.api)+'<pre>'+esc(widget.response_fields)+'</pre><p>'+esc(catalog.boundary)+'</p>')}
      ${section('이벤트·미확정 계약',list(widget.events||[])+list(widget.pending_contracts||[]))}
      ${section('요청 예시','<p>'+esc(widget.query_state)+'</p><pre>'+esc(widget.query || '아직 실행 쿼리 없음 — 의미·귀속·계측 범위 합의 후 작성')+'</pre>')}
      ${section('응답·실측 근거','<p class="review-muted">검증 요약은 원본 응답 payload가 아닙니다. 현재값·화면 인수를 뜻하지 않습니다.</p><pre>'+esc(JSON.stringify(widget.sample,null,2))+'</pre>')}
      ${section('현재 제한','<p>'+esc(widget.limits)+'</p>')}
      ${section('갱신·출처·오류 표시','<p>'+esc(widget.cadence)+'</p><p>'+esc(widget.display)+'</p>')}
      ${section('하위 영역·후속 제어 API(원본 표기)',list(widget.subregions||[])+list(widget.control_api_proposals||[]))}
      </details>
      <details class="review-scope"><summary>공통 흐름·범위·책임 경계</summary><p>${esc(catalog.meeting_contract.flow)}</p><p>${esc(catalog.meeting_contract.responsibility)}</p><p>${esc(catalog.meeting_contract.access)}</p><p>${esc(catalog.meeting_contract.source_status)}</p>${scopeCards()}</details>
      <section class="review-section review-record"><h3>회의 기록</h3><p>이 브라우저에만 저장됩니다. 계정·토큰·접속 주소는 적지 마세요. 내보낸 파일은 GitHub PR에서 검토 후 반영합니다.</p>
      <label class="review-field">검토 결과<select id="review-status">${Object.entries(statuses).map(([k,v])=>`<option value="${k}" ${record.status===k?'selected':''}>${v}</option>`).join('')}</select></label>
      <label class="review-field">결정·수정 사항<textarea id="review-note" rows="4" maxlength="4000" placeholder="합의 내용과 미결 사항">${esc(record.note)}</textarea></label>
      <label class="review-field">실행 담당<input id="review-owner" maxlength="200" value="${esc(record.owner)}" placeholder="미정"></label>
      <label class="review-field">목표일<input id="review-due" type="date" value="${esc(record.due)}"></label>
      <p id="review-save" role="status">${record.updated_at?'이 브라우저에 저장된 기록':'미입력 — 담당·일정은 임의 확정하지 않음'}</p></section>
      <footer><div class="review-exports"><button type="button" data-export="csv">CSV 내보내기</button><button type="button" data-export="md">Markdown 내보내기</button><button type="button" data-export="json">JSON 백업</button></div><p>명세 버전 ${esc(catalog.revision)} · 초안</p>${catalog.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a>`).join('')}</footer>`;
    $('#review-close').onclick = () => toggle(false);
    $('#review-widget').onchange = e => navigate(catalog.widgets.find(w=>w.id===e.target.value),true);
    ['review-status','review-note','review-owner','review-due'].forEach(id => $('#'+id).addEventListener('input',saveRecord));
    panel.scrollTop = 0;
    updateContext(); decorate(); setURL(widget);
    if (focus) $('#review-title').focus({preventScroll:true});
  }
  function updateContext() {
    const el = $('#review-context');
    if (el) el.textContent = `현재 화면: ${context.screen} · ${context.workload}. 화면 요구사항은 목업 기준이며, 저장된 관측은 구현 근거입니다. 위젯을 선택해 역할을 검토하세요.`;
  }
  function navigate(widget, focus) {
    if (!widget) return;
    if (!widget.screens.includes(context.screen)) {
      const button = document.querySelector(`#side [data-s="${widget.screens[0]}"]`);
      if (button) button.click();
    }
    show(widget,focus);
    const el = [...document.querySelectorAll(`[data-review-key="${widget.key}"]`)].find(el=>el.getClientRects().length);
    el?.scrollIntoView({behavior:'instant',block:'center'});
  }
  function toggle(on) {
    if (!catalog) return;
    enabled = on; document.body.classList.toggle('review-on',on); panel.hidden = !on;
    $('#review-toggle').setAttribute('aria-pressed',String(on));
    $('.review-exports',toolbar).hidden = !on;
    const pause = $('#pause');
    if (on) {
      autoPaused = pause.getAttribute('aria-pressed') !== 'true';
      if (autoPaused) pause.click();
      notice(`강조된 위젯: 목업 → 기관 소스 → 글루시스 가공 → 온라인파워스 연결 · ${catalog.widgets.length}개`);
      const preferred = catalog.widgets.find(w=>w.id===new URL(location.href).searchParams.get('widget'));
      navigate(preferred || catalog.widgets.find(w=>w.screens.includes(context.screen)) || catalog.widgets[0],true);
    } else {
      if (autoPaused && pause.getAttribute('aria-pressed') === 'true') pause.click();
      autoPaused = false; notice('목업으로 회의를 시작하거나 현재 화면 역할표를 열어 보세요.');
      decorate(); setURL(); $('#review-toggle').focus({preventScroll:true});
    }
  }
  function csvCell(value) {
    let text = String(value ?? '');
    // Neutralize spreadsheet formula injection, including leading whitespace.
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"'+text.replace(/"/g,'""')+'"';
  }
  const mdCell = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/[\\|`*_[\]#]/g,'\\$&').replace(/\r?\n/g,'<br>');
  function download(format) {
    const data = payload();
    const cols = ['revision','id','screen','title','mockup','provider','institution','gluesys','output','onlinepowers','current','gap','status','note','owner','due','updated_at'];
    let text, type;
    if (format === 'json') { text=JSON.stringify(data,null,2);type='application/json'; }
    else if (format === 'csv') {
      text='\ufeff'+[cols.map(csvCell).join(','),...data.records.map(r=>cols.map(k=>csvCell(r[k])).join(','))].join('\r\n'); type='text/csv;charset=utf-8';
    } else {
      text=`# GPUFlow 위젯 연동 검토 기록\n\n명세 ${catalog.revision} · ${data.exported_at}\n\n브라우저 회의 기록이며 공식 계약 승인이 아닙니다. GitHub PR에서 검토 후 반영합니다.\n\n| ${cols.join(' | ')} |\n| ${cols.map(()=>'---').join(' | ')} |\n`+data.records.map(r=>'| '+cols.map(k=>mdCell(r[k])).join(' | ')+' |').join('\n');type='text/markdown;charset=utf-8';
    }
    const url = URL.createObjectURL(new Blob([text],{type}));
    const a = document.createElement('a'); a.href=url;a.download=`gpuflow-widget-review-${catalog.revision}.${format}`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  toolbar.addEventListener('click',event=>{const format=event.target.closest('[data-export]')?.dataset.export;if(format)download(format);});
  panel.addEventListener('click',event=>{const format=event.target.closest('[data-export]')?.dataset.export;if(format)download(format);});
  $('#review-toggle').onclick = () => toggle(!enabled);
  $('#review-matrix-toggle').onclick=()=>{matrix.hidden=!matrix.hidden;$('#review-matrix-toggle').setAttribute('aria-expanded',String(!matrix.hidden));renderMatrix();};
  $('#review-mockup').onclick=()=>{
    const mode=$('#tb-mode');if(mode){mode.value='scenario';mode.dispatchEvent(new Event('change',{bubbles:true}));}
    if(!enabled)toggle(true);
  };
  matrix.addEventListener('click',e=>{const id=e.target.closest('[data-review-open]')?.dataset.reviewOpen;if(!id)return;if(!enabled)toggle(true);navigate(catalog.widgets.find(w=>w.id===id),true);});
  document.addEventListener('click',event=>{
    if (!enabled || panel.contains(event.target)) return;
    const target = event.target.closest('[data-review-key]');
    if (!target) return;
    const widget = catalog.widgets.find(w=>w.key===target.dataset.reviewKey);
    if (!widget) return;
    event.preventDefault();event.stopImmediatePropagation();show(widget,true);
  },true);
  document.addEventListener('keydown',event=>{if(enabled && event.key==='Escape'){event.preventDefault();toggle(false);}});
  window.addEventListener('gpuflow:testbed-render',()=>{if(catalog)decorate();});
  window.addEventListener('gpuflow:render',event=>{
    const changed = context.screen !== event.detail.screen;
    context = {...event.detail,workload:window.GPUFlowTestbed?.selectedWorkload?.()||event.detail.workload};
    if (!catalog) return;
    if (enabled && changed) {
      const widget = catalog.widgets.find(w=>w.screens.includes(context.screen));
      if (widget) show(widget);
      notice(widget?'강조된 위젯을 클릭하세요 · 브라우저 임시 기록':'이 화면은 아직 위젯별 매핑 대상이 아닙니다. 바로가기에서 다른 계약을 선택하세요.');
    }
    updateContext();decorate();renderMatrix();
  });
  window.dispatchEvent(new Event('gpuflow:review-context-request'));
  // Load only same-origin static metadata; no tokens, product endpoints or remote writes.
  const embedded = document.getElementById('gpuflow-review-data');
  const metadata = embedded ? Promise.resolve().then(()=>JSON.parse(embedded.textContent)) :
    fetch('review-contracts.json').then(r=>{if(!r.ok)throw Error('load');return r.json();});
  metadata.then(data=>{
    window.GPUFlowReviewCatalog=data;window.dispatchEvent(new Event('gpuflow:catalog-ready'));
    if(data.schema_version!==1 || !Array.isArray(data.widgets) || !data.widgets.length)throw Error('schema');
    catalog=data;storageKey='gpuflow-widget-review:'+catalog.revision;loadRecords();
    $('#review-toggle').disabled=false;
    $('#review-mockup').disabled=false;$('#review-matrix-toggle').disabled=false;
    if (!$('#review-summary').textContent.includes('이전 기록')) notice('목업 → 기관 소스 → 글루시스 가공 → 온라인파워스 화면 연결을 검토합니다.');
    if (new URL(location.href).searchParams.get('review')==='1') toggle(true);
  }).catch(()=>notice('검토 자료를 불러오지 못했습니다. HTTP 미리보기로 열고 새로고침하세요. 기존 목업은 사용할 수 있습니다.'));
})();
