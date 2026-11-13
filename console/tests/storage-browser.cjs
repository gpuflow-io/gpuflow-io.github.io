const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
 const file=process.env.PUBLIC_PREVIEW_FILE,output=process.env.REVIEW_TEST_OUTPUT||'/tmp/gpuflow-storage-browser';await fs.mkdir(output,{recursive:true});
 try{
 const p=await b.newPage({viewport:{width:1440,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('http**/*',r=>r.abort());
 await p.goto('file://'+file);await p.waitForSelector('#tb-storage-throughput');
 assert.equal(await p.locator('#tb-storage-throughput tbody tr').count(),4);
 assert.equal(await p.locator('#tb-storage-throughput tr[data-status="ok"]').count(),4);
 for(const t of await p.locator('.storage-rate').allTextContents())assert.equal(t,'0.000000');
 const embedded=JSON.parse(await p.locator('#gpuflow-testbed-data').textContent()).storage_telemetry;
 for(const s of embedded.series){const row=p.locator(`tr[data-storage-node="${s.labels.node}"][data-direction="${s.direction}"]`);const peak=Math.max(...s.points.map(x=>x.bytes_per_second))/1048576;assert.equal(await row.locator('.storage-peak').innerText(),peak.toFixed(6));}
 if(embedded.experiment){assert.match(await p.locator('#tb-storage-experiment').innerText(),/해시 확인 8\/8/);assert(await p.locator('#tb-storage-throughput svg polyline').evaluateAll(xs=>xs.every(x=>new Set(x.getAttribute('points').split(' ').map(p=>p.split(',')[1])).size>1)));}
 await p.locator('[data-storage-filter="node"]').selectOption('storage-node-a');
 assert.equal(await p.locator('#tb-storage-throughput tbody tr').count(),2);
 await p.locator('[data-storage-filter="rank"]').selectOption('1');assert.match(await p.locator('#tb-storage-throughput tbody').innerText(),/표본 없음/);
 await p.locator('[data-storage-filter="node"]').selectOption('');await p.locator('[data-storage-filter="rank"]').selectOption('');
 await p.locator('#tb-storage-throughput').screenshot({path:output+'/storage-desktop.png'});
 await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:output+'/storage-mobile.png',fullPage:true});
 // Same UI in live mode with bounded adapter responses; fixture times move only in this test.
 const sample=JSON.parse(await fs.readFile(path.join(__dirname,'../samples/storage-observation.redacted.json'),'utf8'));
 const html=await fs.readFile(file,'utf8');let fail=false,calls=0;const live=await b.newPage();live.on('pageerror',e=>errors.push(e.message));
 const current=()=>{const e=structuredClone(sample.storage_telemetry),end=Math.floor((Date.now()/1000-10)/5)*5,diff=end-e.window.end;e.window.start+=diff;e.window.end+=diff;e.captured_at=new Date().toISOString();for(const s of e.series)for(const p of s.points){p.at+=diff;p.sample_at+=diff;}return e;};
 await live.route('**/*',r=>{const u=new URL(r.request().url());if(u.pathname==='/')return r.fulfill({contentType:'text/html',body:html});if(u.pathname==='/testbed-api/storage-series'){calls++;return r.fulfill({status:fail?503:200,contentType:'application/json',body:JSON.stringify(fail?{error:{code:'UPSTREAM_UNAVAILABLE'}}:current())});}if(u.pathname==='/testbed-api/snapshot')return r.fulfill({contentType:'application/json',body:JSON.stringify(sample)});if(u.pathname==='/testbed-api/review-resources')return r.fulfill({contentType:'application/json',body:'{}'});return r.abort();});
 await live.goto('http://127.0.0.1/?screen=storage&data=live');await live.waitForSelector('#tb-storage-throughput tr[data-status="ok"]');
 fail=true;await live.waitForFunction(()=>document.querySelector('#tb-storage-throughput tbody')?.textContent.includes('조회 실패'),{},{timeout:12000});assert.equal(await live.locator('.storage-rate').count(),0);assert(calls>=2);
 assert.deepEqual(errors,[]);console.log('PASS: actual four DAOS series, zero, node/rank filters, empty scope, desktop/mobile, live adapter and no stale fallback on failure');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
