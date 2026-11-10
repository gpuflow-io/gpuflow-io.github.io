const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{assert(process.env.PUBLIC_PREVIEW_FILE,'PUBLIC_PREVIEW_FILE is required');const b=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});try{
const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('http**/*',r=>r.abort());await p.goto('file://'+process.env.PUBLIC_PREVIEW_FILE);await p.locator('#side [data-s="④"]').click();await p.waitForSelector('#tb-comparison-table');
assert.match(await p.locator('#tb-analysis').innerText(),/sample-batch-normal/);assert.match(await p.locator('#tb-analysis').innerText(),/1000.74 ms/);assert.match(await p.locator('#tb-mode-note').innerText(),/실시간 데이터 아님/);
await p.locator('#review-toggle').click();await p.locator('#review-widget').selectOption('W04-01');assert.match(await p.locator('#review-title').innerText(),/실측 배치 조건 비교/);await p.keyboard.press('Escape');
await p.locator('#tb-analysis-path').click();await p.waitForSelector('#tb-path-analysis');assert.equal(await p.locator('#tb-path .tb-path-chain li').count(),5);await p.locator('#tb-path-detail').click();await p.waitForSelector('#tb-storage');assert.match(await p.locator('#tb-storage').innerText(),/성공 8배치 · 256 MiB/);assert.match(await p.locator('#tb-storage').innerText(),/종료 시점 재검증 없음/);
await p.locator('#tb-open-path').click();await p.locator('#tb-path-analysis').click();await p.locator('#tb-analysis-select').selectOption('sample-batch-failed');assert.match(await p.locator('#tb-analysis').innerText(),/배치 3 · daos_read_failed/);
await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);console.log('PASS: redacted offline sample, review overlay, 02/03/04 navigation, failure, mobile, no network');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
