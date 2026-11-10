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
  toolbar.setAttribute('aria-label','메트릭·API 연동 검토');
  toolbar.innerHTML = `<button id="review-toggle" type="button" disabled aria-pressed="false" aria-controls="review-panel">연동 검토 모드</button>
    <span id="review-summary" role="status">검토 자료 준비 중…</span>
    <div class="review-exports" hidden><button type="button" data-export="csv">CSV 내보내기</button><button type="button" data-export="md">Markdown 내보내기</button><button type="button" data-export="json">JSON 백업</button></div>`;
  $('.top').insertAdjacentElement('afterend', toolbar);
  const panel = document.createElement('aside');
  panel.id = 'review-panel'; panel.hidden = true;
  panel.setAttribute('aria-label', '위젯 데이터 계약 검토');
  document.body.append(panel);

  const notice = text => { $('#review-summary').textContent = text; };
  function loadRecords() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.revision !== catalog.revision || !Array.isArray(saved.records)) throw Error('version');
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
        id:w.id, screen:w.screens.join('/'), title:w.title, readiness:w.readiness,
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
  function show(widget, focus = false) {
    selected = widget;
    const record = records[widget.id] || {status:'unreviewed',note:'',owner:'',due:''};
    panel.innerHTML = `<header><span class="review-kicker">${esc(widget.screens.join(' · '))} · ${esc(widget.id)}</span><button type="button" id="review-close" aria-label="검토 모드 닫기">닫기</button>
      <h2 id="review-title" tabindex="-1">${esc(widget.title)}</h2><span class="review-state">${esc(widget.readiness)}</span></header>
      <p class="review-warning">데이터 보기에서 출처를 확인하세요. 시나리오 값과 테스트베드 관측은 분리됩니다. 아래 계약은 검토 초안입니다.</p>
      <label class="review-field">위젯 바로가기<select id="review-widget">${catalog.widgets.map(w=>`<option value="${esc(w.id)}" ${w.id===widget.id?'selected':''}>${esc(w.id+' '+w.title)}</option>`).join('')}</select></label>
      <p id="review-context"></p>
      ${section('표시 의미·계산', '<p>'+esc(widget.meaning)+'</p>')}
      ${section('메트릭·라벨',widget.metrics.length ? list(widget.metrics)+'<p class="review-muted">관련 식별/출처 라벨: '+esc(widget.labels.join(', '))+'</p>' : '<p>이 위젯은 업무 API 레코드 기반입니다.</p>')}
      ${section('조회 경로·필드',list(widget.api)+'<pre>'+esc(widget.response_fields)+'</pre><p>'+esc(catalog.boundary)+'</p>')}
      ${section('요청 예시','<p>'+esc(widget.query_state)+'</p><pre>'+esc(widget.query || '아직 실행 쿼리 없음 — 의미·귀속·계측 범위 합의 후 작성')+'</pre>')}
      ${section('응답·실측 근거','<p class="review-muted">검증 요약은 원본 응답 payload가 아닙니다. 현재값·화면 인수를 뜻하지 않습니다.</p><pre>'+esc(JSON.stringify(widget.sample,null,2))+'</pre>')}
      ${section('현재 제한','<p>'+esc(widget.limits)+'</p>')}
      ${section('갱신·출처·오류 표시','<p>'+esc(widget.cadence)+'</p><p>'+esc(widget.display)+'</p>')}
      ${section('이번 미팅에서 결정',list(widget.decisions)+'<p class="review-muted">'+esc(widget.owner)+'</p>')}
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
    if (el) el.textContent = `현재 목업: ${context.screen} · ${context.workload} · ${context.range}. 요청 예시는 고정이며 이 선택값을 자동 적용하지 않습니다.`;
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
      notice(`강조된 위젯을 클릭하세요 · ${catalog.widgets.length}개 계약 · 브라우저 임시 기록`);
      const preferred = catalog.widgets.find(w=>w.id===new URL(location.href).searchParams.get('widget'));
      navigate(preferred || catalog.widgets.find(w=>w.screens.includes(context.screen)) || catalog.widgets[0],true);
    } else {
      if (autoPaused && pause.getAttribute('aria-pressed') === 'true') pause.click();
      autoPaused = false; notice('①·②·③·④·⑪ 주요 위젯의 메트릭·API를 화면에서 검토합니다.');
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
    const cols = ['id','screen','title','readiness','status','note','owner','due','updated_at'];
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
    updateContext();decorate();
  });
  window.dispatchEvent(new Event('gpuflow:review-context-request'));
  // Load only same-origin static metadata; no tokens, product endpoints or remote writes.
  const embedded = document.getElementById('gpuflow-review-data');
  const metadata = embedded ? Promise.resolve().then(()=>JSON.parse(embedded.textContent)) :
    fetch('review-contracts.json').then(r=>{if(!r.ok)throw Error('load');return r.json();});
  metadata.then(data=>{
    if(data.schema_version!==1 || !Array.isArray(data.widgets) || !data.widgets.length)throw Error('schema');
    catalog=data;storageKey='gpuflow-widget-review:'+catalog.revision;loadRecords();
    $('#review-toggle').disabled=false;
    if (!$('#review-summary').textContent.includes('이전 기록')) notice('①·②·③·④·⑪ 주요 위젯의 메트릭·API를 화면에서 검토합니다.');
    if (new URL(location.href).searchParams.get('review')==='1') toggle(true);
  }).catch(()=>notice('검토 자료를 불러오지 못했습니다. HTTP 미리보기로 열고 새로고침하세요. 기존 목업은 사용할 수 있습니다.'));
})();
