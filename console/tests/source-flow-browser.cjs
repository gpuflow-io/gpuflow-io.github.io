// Meeting preview: follow source ownership without accidentally calling a product API.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
 const output=process.env.REVIEW_TEST_OUTPUT||'/tmp/gpuflow-source-flow';await fs.mkdir(output,{recursive:true});
 try{
  const p=await b.newPage({viewport:{width:1600,height:1000}}),errors=[],requests=[];
  p.on('pageerror',e=>errors.push(e.message));await p.route('http**/*',r=>{requests.push(r.request().url());return r.abort();});
  await p.goto('file://'+process.env.PUBLIC_PREVIEW_FILE);
  await p.waitForSelector('#review-handoff');
  assert.equal(await p.locator('#tb-mode').inputValue(),'scenario');
  const c=JSON.parse(await p.locator('#gpuflow-review-data').textContent());
  // Every widget has a visible original-screen anchor and four roles; raw wire fields stay folded.
  for(const w of c.widgets){
   await p.locator('#review-widget').selectOption(w.id);
   assert.equal(await p.locator('#review-handoff .review-flow-card').count(),4,w.id);
   assert.equal(await p.locator('#review-technical').getAttribute('open'),null);
   assert(await p.locator(`[data-review-key="${w.key}"]`).evaluateAll(xs=>xs.some(x=>x.getClientRects().length)),w.id);
   assert((await p.locator('#review-handoff').innerText()).includes(w.handoff.institution.status),w.id);
  }
  await p.locator('#review-widget').selectOption('W01-05');
  assert.match(await p.locator('#review-panel').innerText(),/스케줄러 전체 활성 수와 다르/);
  await p.locator('#review-technical > summary').click();
  assert.match(await p.locator('#review-technical').innerText(),/GET \/v1\/topology-nodes/);
  await p.locator('#review-note').fill('원천 담당과 활성 판정 합의 필요');
  const dl=p.waitForEvent('download');await p.locator('#review-panel [data-export="json"]').click();
  const file=await dl,stream=await file.createReadStream();let raw='';for await(const x of stream)raw+=x;
  const row=JSON.parse(raw).records.find(w=>w.id==='W01-05');assert.match(row.mockup,/활성 워크로드/);assert.match(row.gluesys,/정규화/);assert.equal(row.note,'원천 담당과 활성 판정 합의 필요');
  await p.keyboard.press('Escape');
  await p.locator('#review-matrix-toggle').click();
  for(const s of c.screen_inventory){
   await p.locator(`#side [data-s="${s.screen}"]`).click();
   assert.equal(await p.locator('#review-matrix [data-handoff-id]').count(),s.widgets.length,s.screen);
   for(const id of s.widgets)assert.equal(await p.locator(`#review-matrix [data-handoff-id="${id}"]`).count(),1);
  }
  await p.locator('#side [data-s="①"]').click();
  await p.locator('#review-matrix [data-review-open="W01-05"]').click();
  assert.match(await p.locator('#review-title').innerText(),/활성 워크로드/);
  assert.equal(await p.locator('#review-note').inputValue(),'원천 담당과 활성 판정 합의 필요');
  await p.evaluate(()=>{scrollTo(0,0);document.querySelector('#review-panel').scrollTop=0;});
  await p.screenshot({path:output+'/meeting-desktop.png'});
  await p.keyboard.press('Escape');await p.locator('#review-matrix-toggle').click();
  await p.locator('#tb-mode').selectOption('snapshot');
  await p.locator('#review-toggle').click();
  for(const w of c.widgets){await p.locator('#review-widget').selectOption(w.id);assert.equal(await p.locator('#review-handoff .review-flow-card').count(),4);}
  await p.keyboard.press('Escape');
  await p.locator('#review-mockup').click();assert.equal(await p.locator('#tb-mode').inputValue(),'scenario');
  await p.setViewportSize({width:390,height:844});
  await p.locator('#review-widget').selectOption('W01-05');
  await p.screenshot({path:output+'/meeting-mobile.png'});
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await p.keyboard.press('Escape');await p.locator('#review-matrix-toggle').click();
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await p.screenshot({path:output+'/matrix-mobile.png'});
  assert.deepEqual(errors,[]);assert.equal(requests.some(x=>/testbed-api|\/v1\//.test(x)),false);
  console.log('PASS: 56 mockup/observation handoffs; 13 screen matrices; folded details; global roles; meeting export/notes; desktop/mobile; no API calls');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
