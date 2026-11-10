const assert=require('node:assert/strict'),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const b=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});try{
 const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('http**/*',r=>r.abort());
 await p.addInitScript(()=>{localStorage.clear();localStorage.setItem('gpuflow-widget-review:2026-11-07.1',JSON.stringify({revision:'2026-11-07.1',records:[{id:'W01-01',status:'change',note:'이전 20개 목록 기록',owner:'담당',due:'',updated_at:''}]}));});
 await p.goto('file://'+process.env.PUBLIC_PREVIEW_FILE);await p.locator('#review-toggle').click();await p.locator('#review-widget').selectOption('W01-01');assert.equal(await p.locator('#review-note').inputValue(),'이전 20개 목록 기록');
 const c=JSON.parse(await p.locator('#gpuflow-review-data').textContent());assert.equal(c.widgets.length,56);
 for(const w of c.widgets){await p.locator('#review-widget').selectOption(w.id);assert(await p.locator(`[data-review-key="${w.key}"]`).evaluateAll(xs=>xs.some(x=>x.getClientRects().length)),w.id);}
 const d=p.waitForEvent('download');await p.locator('#review-panel [data-export="csv"]').click();const dl=await d;const stream=await dl.createReadStream();let csv='';for await(const chunk of stream)csv+=chunk;assert.match(csv,/2026-11-10.5/);assert.match(csv,/이전 20개 목록 기록/);
 await p.keyboard.press('Escape');await p.locator('#side [data-s="⑨"]').click();assert.match(await p.locator('#tb-api-policies').innerText(),/합성/);assert.match(await p.locator('#tb-api-policies').innerText(),/UTC/);assert.doesNotMatch(await p.locator('#tb-api-policies').innerText(),/origin_unknown/);
 await p.locator('#side [data-s="⑬"]').click();assert.doesNotMatch(await p.locator('#tb-kpi-table').innerText(),/측정값 미제공 %/);
 for(const s of ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬']){await p.locator(`#side [data-s="${s}"]`).click();assert(await p.locator('#tb-global-scope').isVisible());assert.match(await p.locator('#tb-global-scope').innerText(),/Period.*Role/s);}
 await p.locator('#side [data-s="①"]').click();assert.match(await p.locator('#tb-pod-summary').innerText(),/Alerts.*Uplink/);await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
 console.log('PASS: 56 anchors, legacy record migration and revision CSV, synthetic/quality/UTC/null display, 13-screen scope, mobile');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
