const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
 const output=process.env.REVIEW_TEST_OUTPUT||'/tmp/gpuflow-all-pages';await fs.mkdir(output,{recursive:true});
 try{
 const p=await b.newPage({viewport:{width:1440,height:1000}}),errors=[],requests=[];
 p.on('pageerror',e=>errors.push(e.message));await p.route('http**/*',r=>{requests.push(r.request().url());return r.abort();});
 await p.goto('file://'+process.env.PUBLIC_PREVIEW_FILE);await p.waitForSelector('#tb-heatmap');
 const screens=['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬'];
 for(const width of [1440,390]){
 await p.setViewportSize({width,height:1000});
 for(const [i,screen] of screens.entries()){
 await p.locator(`#side [data-s="${screen}"]`).click();
 await p.waitForTimeout(80);
 assert.match(await p.locator('#tb-mode-note').innerText(),/저장된 관측/);
 if(i>=4){assert(await p.locator('#tb-extra').isVisible());assert.match(await p.locator('#tb-extra').innerText(),/미정|미포함/);assert.equal(await p.locator('#dt').isVisible(),false);}
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow ${screen} ${width}`);
 await p.screenshot({path:`${output}/snapshot-${i+1}-${width}.png`,fullPage:true});
 }
 }
 await p.setViewportSize({width:1440,height:1000});await p.locator('#side [data-s="①"]').click();
 for(const text of ['POD별 요약','GPU 히트맵','Top nodes by wait','GPU occupancy by workload type','Storage cluster summary'])assert.match(await p.locator('#ov').innerText(),new RegExp(text));
 assert.equal(await p.locator('.tb-gpu-cell').count(),1);
 assert.match(await p.locator('#tb-rack').innerText(),/미등록/);
 await p.locator('#tb-rack').selectOption('(미등록)');await p.locator('#tb-node').selectOption('sample-compute');
 assert.equal(await p.locator('#ov [data-workload]').count(),3);assert.match(await p.locator('#tb-storage-summary').innerText(),/sample-storage-2/);
 await p.locator('#ov [data-workload]').first().click();await p.waitForSelector('#tb-workload-title');
 await p.locator('#tb-origin').selectOption('simulation');assert.equal(await p.locator('#tb-workload-title').count(),0);
 await p.locator('#tb-origin').selectOption('measured');await p.waitForSelector('#tb-workload-title');
 assert.match(await p.locator('#tb-detail').innerText(),/표본 미포함/);
 await p.locator('#side [data-s="⑧"]').click();assert.match(await p.locator('#tb-extra').innerText(),/sample-storage-1/);assert.equal(await p.locator('#tb-extra [data-na]').count(),0);
 // All existing review contracts must have a visible anchor in observation mode too.
 await p.locator('#review-toggle').click();
 const contracts=JSON.parse(await p.locator('#gpuflow-review-data').textContent());
 for(const w of contracts.widgets){
   await p.locator('#review-widget').selectOption(w.id);
   const visible=await p.locator(`[data-review-key="${w.key}"]`).evaluateAll(xs=>xs.some(x=>x.getClientRects().length));
   assert(visible,`observation review anchor ${w.id}`);
 }
 await p.keyboard.press('Escape');await p.locator('#side [data-s="⑧"]').click();
 // Original scenario remains explicitly selectable on every page.
 await p.locator('#tb-show-scenario').click();
 for(const [i,screen] of screens.entries()){
 await p.locator(`#side [data-s="${screen}"]`).click();
 assert.match(await p.locator('#tb-mode-note').innerText(),/시나리오 예시/);
 assert.equal(await p.locator('#tb-extra').isVisible(),false);
 await p.screenshot({path:`${output}/scenario-${i+1}.png`,fullPage:true});
 }
 assert.match(await p.locator('#sc').innerText(),/Example · not evaluated/);
 await p.emulateMedia({colorScheme:'dark'});await p.screenshot({path:`${output}/dark-scenario.png`});
 await p.setViewportSize({width:390,height:844});
 for(const screen of screens){await p.locator(`#side [data-s="${screen}"]`).click();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`scenario overflow ${screen}`);}
 await p.locator('#tb-mode').selectOption('snapshot');await p.locator('#side [data-s="①"]').click();await p.waitForSelector('#tb-heatmap');
 // An offline file must show an explicit read failure, never reuse a snapshot as live.
 await p.locator('#tb-mode').selectOption('live');assert.match(await p.locator('#ov').innerText(),/실시간 조회는/);assert.equal(await p.locator('.tb-gpu-cell').count(),0);
 assert.equal(requests.some(x=>/testbed-api|\/v1\//.test(x)),false);
 assert.deepEqual(errors,[]);
 console.log('PASS: all 13 pages × snapshot/scenario × desktop/mobile; evidence boundaries, filters, navigation, no API side effects, offline error; screenshots saved');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
