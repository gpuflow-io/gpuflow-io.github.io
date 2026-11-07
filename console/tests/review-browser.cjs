/* Run against a local static server. Requires Playwright or playwright-core. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.CONSOLE_BASE_URL || 'http://127.0.0.1:8000/console/';
const output = process.env.REVIEW_TEST_OUTPUT || '/tmp/gpuflow-console-review';
async function main() {
  await fs.mkdir(output,{recursive:true});
  const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})});
  const ctx = await browser.newContext({viewport:{width:1600,height:1000},acceptDownloads:true});
  const page = await ctx.newPage(), errors=[], requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
    requests.push({url:route.request().url(),method:route.request().method()});
    if(!route.request().url().startsWith(new URL(base).origin))return route.abort();
    return route.continue();
  });
  try {
    await page.goto(base);await page.waitForFunction(()=>!document.querySelector('#review-toggle').disabled);
    assert.equal(await page.locator('#review-panel').isVisible(),false);
    // Baseline navigation and pause continue to work without review mode.
    await page.locator('#side [data-s="②"]').click();
    assert.match(await page.locator('#scrh').innerText(),/Workload Lens/);
    await page.locator('#side [data-s="①"]').click();
    await page.locator('#review-toggle').click();
    assert.equal(await page.locator('#pause').getAttribute('aria-pressed'),'true');
    assert.match(await page.locator('#review-title').innerText(),/GPU 할당량/);
    assert.equal(await page.locator('[data-review-key="cluster-wait"] .review-badge').count(),1);
    await page.locator('[data-review-key="cluster-wait"] .review-badge').click();
    assert.match(await page.locator('#review-title').innerText(),/클러스터 GPU 데이터 대기율/);
    assert.match(await page.locator('#review-panel').innerText(),/실측 미확인/);
    assert.match(page.url(),/widget=W01-02/);
    // Arbitrary meeting text is text, never HTML or spreadsheet commands.
    const note='=HYPERLINK("https://example.invalid")\n<img src=x onerror="window.injected=1"> | 검토';
    await page.locator('#review-status').selectOption('change');
    await page.locator('#review-note').fill(note);
    await page.locator('#review-owner').fill('담당 미정');
    await page.locator('#review-due').fill('2026-11-11');
    await page.reload();await page.waitForSelector('#review-note');
    assert.equal(await page.locator('#review-note').inputValue(),note);
    assert.equal(await page.evaluate(()=>window.injected),undefined);
    assert.equal(await page.locator('#review-status').inputValue(),'change');
    assert.equal(await page.locator('#review-owner').inputValue(),'담당 미정');
    const contracts=await (await page.request.get(new URL('review-contracts.json',base).href)).json();
    assert.equal(contracts.widgets.length,19);
    // Every contract opens its intended screen and has a visible exact anchor.
    for(const w of contracts.widgets){
      await page.locator('#review-widget').selectOption(w.id);
      assert.equal(await page.locator('#review-title').innerText(),w.title);
      assert.equal(await page.locator(`[data-review-key="${w.key}"]`).isVisible(),true,w.id);
      assert.equal(await page.locator(`[data-review-key="${w.key}"] .review-badge`).count(),1,w.id);
    }
    // Clicking an existing ack control in review mode selects its contract only.
    const ack=page.locator('#alr [data-ack]').first();
    const ackCount=await page.locator('#alr [data-ack]').count();
    await ack.click();
    assert.equal(await page.locator('#alr [data-ack]').count(),ackCount);
    assert.match(await page.locator('#review-title').innerText(),/활성 경보/);
    // Re-render does not duplicate markers or lose notes.
    await page.locator('#side [data-s="①"]').click();
    await page.locator('#review-widget').selectOption('W01-02');
    for(const format of ['csv','md','json']){
      const download=page.waitForEvent('download');
      await page.locator(`#review-panel [data-export="${format}"]`).click();
      const file=await download;const destination=path.join(output,file.suggestedFilename());await file.saveAs(destination);
      const text=await fs.readFile(destination,'utf8');
      if(format==='csv'){assert(text.includes("'=HYPERLINK"));assert(text.includes('""https://example.invalid""'));}
      if(format==='md'){assert(text.includes('&lt;img'));assert(text.includes('\\| 검토'));}
      if(format==='json'){const saved=JSON.parse(text);assert.equal(saved.records.length,19);assert.equal(saved.records.find(x=>x.id==='W01-02').note,note);}
    }
    // Screenshot contains representative clean meeting fields, not attack fixture text.
    await page.locator('#review-note').fill('다중 GPU 가중 방식과 미계측 상태 표시를 미팅에서 확정');
    await page.locator('#review-due').fill('');
    await page.evaluate(()=>{window.scrollTo(0,0);document.querySelector('#review-panel').scrollTop=0;});
    await page.screenshot({path:path.join(output,'review-desktop.png')});
    await page.emulateMedia({colorScheme:'dark'});
    await page.screenshot({path:path.join(output,'review-dark.png')});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(output,'review-mobile.png')});
    const bounds=await page.locator('#review-panel').boundingBox();assert(bounds.x>=0 && bounds.width<=390);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#review-panel').isVisible(),false);
    assert.equal(await page.locator('#pause').getAttribute('aria-pressed'),'false');
    assert.equal(await page.locator('.review-badge').count(),0);
    await page.setViewportSize({width:1600,height:1000});
    // Preserve a pre-existing manual pause on entering and exiting review.
    await page.locator('#pause').click();await page.locator('#review-toggle').click();await page.keyboard.press('Escape');
    assert.equal(await page.locator('#pause').getAttribute('aria-pressed'),'true');
    // Original scenario action still works once review mode is off.
    await page.locator('#side [data-s="⑪"]').click();
    const before=await page.locator('#alr [data-ack]').count();await page.locator('#alr [data-ack]').first().click();
    assert.equal(await page.locator('#alr [data-ack]').count(),before-1);
    assert.equal(requests.some(r=>r.method!=='GET'||/\/v1\//.test(r.url)),false,'No product API requests');
    assert.deepEqual(errors,[]);
    // Broken metadata or unavailable local storage must not break the console.
    const broken=await ctx.newPage();await broken.route('**/review-contracts.json',r=>r.fulfill({status:404,body:'missing'}));
    await broken.goto(base);await broken.waitForFunction(()=>document.querySelector('#review-summary').textContent.includes('불러오지'));
    assert.equal(await broken.locator('#review-toggle').isDisabled(),true);await broken.locator('#side [data-s="②"]').click();
    assert.match(await broken.locator('#scrh').innerText(),/Workload Lens/);await broken.close();
    const limited=await ctx.newPage();await limited.addInitScript(()=>{Storage.prototype.setItem=function(){throw Error('quota');};});
    await limited.goto(base+'?review=1&widget=W11-02');await limited.waitForSelector('#review-note');
    await limited.locator('#review-note').fill('임시 기록');assert.match(await limited.locator('#review-save').innerText(),/저장 불가/);await limited.close();
    console.log('PASS: 19 mappings; navigation, local persistence, 3 exports, injection handling, pause restore, scenario regression, mobile/dark, failure fallback; no product API calls.');
  } finally {await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
