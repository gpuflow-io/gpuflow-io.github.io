const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
 try{
 const p=await b.newPage(),seen=[],errors=[],sample=require('../samples/batch-observation.redacted.json'),fixtures=require('../samples/review-api.fixtures.json');
 p.on('pageerror',e=>errors.push(e.message));const base=process.env.CONSOLE_BASE_URL||'http://127.0.0.1:8792/console/';
 await p.route('**/*',r=>{
 const req=r.request(),url=new URL(req.url());
 if(url.pathname.startsWith('/testbed-api/')){
 seen.push({path:url.pathname,method:req.method(),authorization:req.headers().authorization});
 if(url.pathname==='/testbed-api/snapshot')return r.fulfill({json:sample});
 if(url.pathname==='/testbed-api/review-resources')return r.fulfill({json:fixtures.resources});
 if(url.pathname==='/testbed-api/llm'){
 const {question_id,scenario}=req.postDataJSON(),result=fixtures.llm[question_id][scenario];return r.fulfill({status:result.http_status,json:result.body});
 }
 throw Error('unexpected API request');
 }
 return req.url().startsWith(new URL(base).origin)?r.continue():r.abort();
 });
 await p.goto(base+'?data=live');await p.locator('#side [data-s="⑨"]').click();await p.waitForSelector('#tb-api-policies');
 await p.waitForFunction(()=>document.querySelector('#tb-api-policies').textContent.includes('example-policy'));
 assert.match(await p.locator('#tb-api-policy-history').innerText(),/example-span/);
 await p.locator('#side [data-s="⑬"]').click();assert.equal(await p.locator('#tb-kpi-table tbody tr').count(),10);
 await p.locator('#side [data-s="⑦"]').click();await p.locator('#tb-llm-scenario').selectOption('timeout');await p.locator('#tb-llm-run').click();await p.waitForFunction(()=>document.querySelector('#tb-llm').textContent.includes('DEADLINE_EXCEEDED'));
 await p.locator('#tb-llm-question').selectOption('Q03');await p.locator('#tb-llm-scenario').selectOption('no_evidence');await p.locator('#tb-llm-run').click();await p.waitForFunction(()=>document.querySelector('#tb-llm').textContent.includes('HTTP 200'));
 assert.match(await p.locator('#tb-llm').innerText(),/no_evidence/);
 assert(seen.some(x=>x.path==='/testbed-api/review-resources'));assert(seen.some(x=>x.path==='/testbed-api/llm'&&x.method==='POST'));assert(seen.every(x=>!x.authorization));assert.deepEqual(errors,[]);
 console.log('PASS: online-mode list/scorecard/LLM wiring with intercepted responses; no browser token; HTTP504 preserved (not real testbed acceptance)');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
