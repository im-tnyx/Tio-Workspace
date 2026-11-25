import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeterministicFixtureTransport,createTrustedOfflineDispatcher,createOfflineBarrier} from './hosted-probe-runner.mjs';

test('R14-03: invalid timing is rejected before a fixture can consume routes, record calls or release barriers', () => {
  let coercions=0;
  const invalid=[-1,NaN,Infinity,'1',2147483648,{valueOf(){coercions++;return 1;}}];
  for(const delayMs of invalid){
    const barrier=createOfflineBarrier('r14-invalid');
    for(const spec of [
      {routes:[{times:1,setsState:{mutated:true},releaseBarrier:barrier,delayMs,status:200}]},
      {defaultResponse:{delayMs,status:200}},
      {fallback:{delayMs,status:200}}
    ]) assert.throws(()=>createDeterministicFixtureTransport(spec),/INVALID_ADMISSION_RANGE|INVALID_DETERMINISTIC_FIXTURE_SPEC/);
    for(const spec of [
      {outcomes:{'BYPASS-01':{delayMs,status:422}}},
      {defaultOutcome:{delayMs,status:422}},
      {sequence:[{rejectAfterAbortMs:delayMs,neverSettle:true}]}
    ]) assert.throws(()=>createTrustedOfflineDispatcher({runId:'r14-timing',...spec}),/INVALID_ADMISSION_RANGE|INVALID_DETERMINISTIC_FIXTURE_SPEC/);
    assert.equal(barrier.arrivedCount,0);assert.equal(barrier.isReleased(),false);
  }
  assert.equal(coercions,0);
});

test('R14-03: valid zero and positive delays preserve single-use route and state behavior',async()=>{
  const transport=createDeterministicFixtureTransport({initialState:{mutated:false},routes:[{times:1,delayMs:0,setsState:{mutated:true},status:201}],fallback:{delayMs:1,status:202}});
  assert.equal((await transport('https://offline.invalid/timing')).status,201);
  assert.equal((await transport('https://offline.invalid/timing')).status,202);
  assert.equal(transport.calls.length,2);assert.equal(transport.getState().mutated,true);
});
