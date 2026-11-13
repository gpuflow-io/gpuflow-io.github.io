const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const b=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});try{
 const p=await b.newPage({viewport:{width:1440,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('http**/*',r=>r.abort());await p.goto('file://'+process.env.PUBLIC_PREVIEW_FILE);await p.waitForSelector('#tb-storage-rpc');
 assert.equal(await p.locator('#tb-storage-rpc tbody tr').count(),4);assert.deepEqual(await p.locator('.rpc-peak').allTextContents(),['1.600000','1.166667','1.266667','1.266667']);
 assert.equal(await p.locator('#tb-storage-capacity tbody tr').count(),4);assert.match(await p.locator('#tb-storage-capacity').innerText(),/1.1719%/);
 assert.equal(await p.locator('#tb-storage-latency tbody tr').count(),6);assert.match(await p.locator('#tb-storage-latency').innerText(),/3.812135/);assert.match(await p.locator('#tb-storage-latency').innerText(),/p95\/p99는 산출 불가/);assert.match(await p.locator('#tb-storage-latency').innerText(),/58행/);
 const out=process.env.REVIEW_TEST_OUTPUT||'/tmp/gpuflow-storage-extra';await fs.mkdir(out,{recursive:true});
 for(const id of ['rpc','capacity','latency'])await p.locator('#tb-storage-'+id).screenshot({path:out+'/'+id+'.png'});
 await p.locator('[data-storage-filter="node"]').selectOption('storage-node-b');assert.equal(await p.locator('#tb-storage-rpc tbody tr').count(),2);assert.equal(await p.locator('#tb-storage-capacity tbody tr').count(),2);assert.equal(await p.locator('#tb-storage-latency tbody tr').count(),2);
 await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await p.locator('#tb-mode').selectOption('live');await p.waitForTimeout(250);assert.match(await p.locator('#tb-storage-capacity').innerText(),/실시간 경로 미구성/);assert(!((await p.locator('#tb-storage-latency').innerText()).includes('3.812135')));assert.deepEqual(errors,[]);
 console.log('PASS: RPC values, media-specific VOS capacity, latency units/no-sample bins, filtering, mobile, no saved-native fallback in live mode');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
