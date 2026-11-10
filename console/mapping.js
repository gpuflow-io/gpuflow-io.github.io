/* Pure mapping helpers shared by the browser and contract tests. */
(function(root){
 'use strict';
 function resourceState(envelope){
  if(!envelope)return {status:'missing',items:[]};
  if(envelope.error)return {status:'error',items:[]};
  if(envelope.complete!==true||envelope.backend!=='postgres_read_only'||envelope.next_cursor!==''||!Array.isArray(envelope.items)||envelope.items.some(x=>!x||typeof x.data!=='object'||!x.provenance||!x.quality))return {status:'invalid',items:[]};
  return {status:envelope.items.length?'present':'empty',items:envelope.items};
 }
 function scorecardRows(catalog,envelope){
  const state=resourceState(envelope);
  return catalog.kpis.map(k=>{
   const matches=state.items.filter(x=>k.indicator_aliases.includes(x.data.indicator));
   // Never choose a run silently: explicit run selection is a separate UI contract.
   const row=matches.length===1?matches[0]:null;
   return {kpi:k,row,status:matches.length>1?'ambiguous':row?'mapped':state.status==='present'?'unmapped':state.status,
    verdict:row?'평가 미확정':'근거 없음'};
  });
 }
 function llmFixture(fixtures,q,scenario){return fixtures?.[q]?.[scenario]||null;}
 const api={resourceState,scorecardRows,llmFixture};
 if(typeof module!=='undefined')module.exports=api;root.GPUFlowMapping=api;
})(typeof window==='undefined'?globalThis:window);
