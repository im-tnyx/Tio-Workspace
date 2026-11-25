import test from 'node:test';
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { getRunRequestBudget, assertRunRequestBudget } from './run-request-budget.mjs';
const projectRef = 'wvdabiwbaavfggcmpizd';
function budget(runId, mode = 'recorded_zero_wait') { return getRunRequestBudget({ projectRef, runId, mode }); }
test('R14-04: shared run budget atomically limits concurrent requests including cleanup', async () => {
  const shared = budget('r14-budget-cap');
  assert.equal(shared, getRunRequestBudget({projectRef, runId:'r14-budget-cap'}));
  const results = await Promise.allSettled(Array.from({length:30},()=>shared.beginRequest({category:'auxiliary'})));
  assert.equal(results.filter(result=>result.status==='fulfilled').length,25);
  assert.equal(shared.report().simulatedTransportRequests,25);
  assert.equal(shared.report().blockedRequests,5);
  for(const result of results) if(result.status==='fulfilled') shared.completeRequest(result.value);
  await assert.rejects(shared.beginRequest({category:'cleanup'}), error=>error.code==='REQUEST_BUDGET_EXHAUSTED'&&error.recoveryRequired);
  assert.equal(shared.report().cleanupRequests,0);
  assert.equal(shared.report().reservedCleanupCapacity,0);
  assert.equal(shared.report().actualHostedRequests,0);
  assert.throws(()=>getRunRequestBudget({projectRef,runId:'r14-budget-cap',mode:'standard'}), /MODE_MISMATCH/);
  assertRunRequestBudget(shared,projectRef,'r14-budget-cap');
  assert.throws(()=>assertRunRequestBudget({...shared},projectRef,'r14-budget-cap'),/UNTRUSTED/);
});
test('R14-04: failed, auxiliary, cleanup and cancellation accounting distinguishes dispatch', async()=>{
 const shared=budget('r14-budget-outcomes');
 const before=new AbortController();before.abort();
 await assert.rejects(shared.beginRequest({signal:before.signal}),{name:'AbortError'});
 const first=await shared.beginRequest({category:'auxiliary'});shared.completeRequest(first,'failed');
 const second=await shared.beginRequest({category:'cleanup'});shared.completeRequest(second,'cancelled_after_dispatch');
 const last=await shared.beginRequest();shared.completeRequest(last);
 const report=shared.report();assert.equal(report.simulatedTransportRequests,3);assert.equal(report.blockedRequests,1);assert.equal(report.failedRequestAttempts,2);assert.equal(report.cancelledBeforeDispatch,1);assert.equal(report.cancelledAfterDispatch,1);assert.equal(report.auxiliaryRequests,1);assert.equal(report.cleanupRequests,1);assert.deepEqual(report.intervalsMs,[1000,1000]);assert.equal(report.simulatedPacing,true);
 assert.throws(()=>shared.completeRequest(first),/ALREADY_COMPLETED/);
});
test('R14-04: standard pacing serializes actual starts and removes cancelled wait listeners', async()=>{
 const shared=budget('r14-budget-standard','standard');
 const first=await shared.beginRequest();shared.completeRequest(first);
 const controller=new AbortController();const cancelled=shared.beginRequest({signal:controller.signal});controller.abort();
 await assert.rejects(cancelled,{name:'AbortError'});
 const second=await shared.beginRequest();shared.completeRequest(second);
 assert.ok(shared.report().intervalsMs[0]>=1000);assert.equal(shared.report().simulatedPacing,false);assert.equal(shared.report().cancelledBeforeDispatch,1);assert.equal(shared.report().pendingReservations,0);assert.equal(getEventListeners(controller.signal,'abort').length,0);
});
test('R14-04: hostile budget options reject without executable reads',()=>{
 let reads=0;const getter=Object.defineProperty({},'runId',{get(){reads++;return 'bad';}});
 assert.throws(()=>getRunRequestBudget(getter),/INVALID/);
 assert.throws(()=>getRunRequestBudget(new Proxy({}, {get(){reads++;}})),/INVALID/);
 assert.throws(()=>getRunRequestBudget({projectRef,runId:'x',reset:()=>{reads++;}}),/INVALID/);
 assert.equal(reads,0);
});

test('R14-04 integration: multiple actual requests in one probe and independent transports share one allowance', async()=>{
 const {createTrustedOfflineDispatcher,createDeterministicFixtureTransport}=await import('./hosted-probe-runner.mjs');
 const runId='r14-integration-shared';
 const transportA=createDeterministicFixtureTransport({requestBudgetMode:'recorded_zero_wait',defaultResponse:{status:200,json:{}}});
 const transportB=createDeterministicFixtureTransport({requestBudgetMode:'recorded_zero_wait',defaultResponse:{status:200,json:{}}});
 const first=createTrustedOfflineDispatcher({runId,fetchFn:transportA,defaultOutcome:{transportRequests:[{url:'https://offline.invalid/a'},{url:'https://offline.invalid/b'},{url:'https://offline.invalid/c'}],outcome:{passed:true,status:422}}});
 const second=createTrustedOfflineDispatcher({runId,fetchFn:transportB,defaultOutcome:{transportRequest:{url:'https://offline.invalid/d'},outcome:{passed:true,status:422}}});
 await first({id:'BYPASS-01'});
 assert.equal(transportA.calls.length,3);
 for(let i=0;i<22;i++)await second({id:'BYPASS-01'});
 await assert.rejects(second({id:'BYPASS-01'}),/REQUEST_BUDGET_EXHAUSTED/);
 assert.equal(transportB.calls.length,22);
 const report=getRunRequestBudget({projectRef,runId}).report();assert.equal(report.simulatedTransportRequests,25);assert.equal(report.probeTransportRequests,25);assert.equal(report.blockedRequests,1);assert.equal(report.actualHostedRequests,0);
});

test('R14-04 integration: cancelled transport admissions do not record a provider attempt',async()=>{
 const {createTrustedOfflineDispatcher,createDeterministicFixtureTransport}=await import('./hosted-probe-runner.mjs');
 const runId='r14-integration-cancel';
 const transport=createDeterministicFixtureTransport({requestBudgetMode:'recorded_zero_wait',defaultResponse:{status:200,json:{}}});
 const dispatcher=createTrustedOfflineDispatcher({runId,fetchFn:transport,defaultOutcome:{transportRequest:{url:'https://offline.invalid/cancel'},outcome:{status:422}}});
 const controller=new AbortController();controller.abort();
 await assert.rejects(dispatcher({id:'BYPASS-01'},{signal:controller.signal}),{name:'AbortError'});
 assert.equal(transport.calls.length,0);
 assert.equal(getRunRequestBudget({projectRef,runId}).report().simulatedTransportRequests,0);
 assert.equal(getRunRequestBudget({projectRef,runId}).report().cancelledBeforeDispatch,1);
});

test('R14-04 integration: provisioning consumes shared allowance and exhausted cleanup remains recoverable without a DELETE', async()=>{
 const {TestRunInventory,createHostedAdminClient,createDeterministicFixtureTransport,createMockProjectKey,provisionStorageProbeFixture,STORAGE_PROBE_BUCKET}=await import('./hosted-probe-runner.mjs');
 const runId='r14-budget-provision-exhaustion';
 const owner='11111111-1111-4111-a111-111111111114';
 const objectId='22222222-2222-4222-a222-222222222114';
 const path=runId+'/probe.txt';const content='budget fixture';
 const payload={iss:`https://${projectRef}.supabase.co/auth/v1`,sub:owner,session_id:'33333333-3333-4333-a333-333333333114',exp:Math.floor(Date.now()/1000)+300,amr:[{method:'password'}],amr_authenticated:'true'};
 const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(payload)).toString('base64url')+'.test';
 const transport=createDeterministicFixtureTransport({requestBudgetMode:'recorded_zero_wait',conditionalStorage:{projectRef,runId,objects:[]},initialState:{uploaded:false},routes:[
  {method:'GET',pathEquals:'/auth/v1/user',status:200,json:{id:owner}},
  {method:'GET',urlIncludes:'/storage/v1/object/authenticated/',whenState:{uploaded:false},status:404,json:{code:'NoSuchKey'}},
  {method:'POST',urlIncludes:'/storage/v1/object/',setsState:{uploaded:true},status:200,json:{Id:objectId}},
  {method:'GET',urlIncludes:'/storage/v1/object/authenticated/',whenState:{uploaded:true},status:200,text:content},
  {method:'POST',urlIncludes:'/rest/v1/rpc/',status:200,json:[{id:objectId,bucket_id:STORAGE_PROBE_BUCKET,name:path,owner_id:owner}]},
  {method:'GET',urlIncludes:'/auth/v1/admin/users/',status:404,json:{message:'User not found'}},
  {method:'DELETE',urlIncludes:'/storage/v1/object/',status:200,json:{}}
 ]});
 const inventory=new TestRunInventory(runId);
 const admin=createHostedAdminClient({runId,projectRef,fetchFn:transport,serviceRoleKey:createMockProjectKey(projectRef,'service_role')});
 await provisionStorageProbeFixture({runId,inventory,adminClient:admin,fetchFn:transport,seedUserId:owner,userAccessToken:token,probeContent:content});
 const shared=getRunRequestBudget({projectRef,runId});
 assert.ok(shared.report().auxiliaryRequests>=5);
 while(shared.report().remainingCapacity>0)await admin.getUserById(owner);
 const before=transport.calls.length;
 const report=await inventory.executeCleanup({adminClient:admin,failClosed:false});
 assert.equal(report.status,'CLEANUP_FAILED_RESIDUAL_RESOURCES');
 assert.equal(inventory.isClean(),false);
 assert.equal(transport.calls.length,before);
 assert.equal(transport.calls.some(call=>call.method==='DELETE'),false);
 assert.equal(shared.report().simulatedTransportRequests,25);
 assert.ok(shared.report().blockedRequests>=1);
 assert.equal(shared.report().cleanupRequests,0);
 assert.equal(shared.report().reservedCleanupCapacity,0);
});
