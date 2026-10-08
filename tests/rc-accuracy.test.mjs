import test from 'node:test';
import assert from 'node:assert/strict';
import { createExample } from '../.test-dist/core/examples.js';
import { analyzeRCNetwork } from '../.test-dist/core/rc-network.js';
import { assessRcConvergence } from '../.test-dist/core/rc-accuracy.js';

test('RC convergence: 10 and 20 internal substeps agree on parallel network',()=>{
 const p=createExample('rc-parallel');
 const q=assessRcConvergence(p,{durationSeconds:0.6});
 assert.equal(q.ok,true,q.reason);
 assert.equal(q.stable,true,q.reason);
 assert.equal(q.underResolved,false);
 assert.ok(q.maxDeltaVolts<.02,q.maxDeltaVolts);
 assert.ok(q.maxRelativePercent<1,q.maxRelativePercent);
 assert.equal(q.samplesCompared,202);
});
test('RC convergence: independent step refinements agree on capacitor series network',()=>{
 const p=createExample('rc-series');
 const q=assessRcConvergence(p,{durationSeconds:.5});
 assert.equal(q.ok,true,q.reason);
 assert.equal(q.stable,true,q.reason);
 assert.ok(q.maxRelativePercent<1);
});
test('RC convergence: fast transient under a long window cannot be labeled reliable',()=>{
 const p=createExample('rc-parallel');
 p.parts.filter(c=>c.kind==='capacitor').forEach(c=>{c.value=.001});
 const q=assessRcConvergence(p,{durationSeconds:10});
 assert.equal(q.ok,true,q.reason);
 assert.equal(q.underResolved,true);
 assert.equal(q.stable,false);
 assert.match(q.reason,/窗口/);
});
test('RC convergence: invalid samples and unsupported circuit fail explicitly',()=>{
 const p=createExample('rc-charge');
 const q=assessRcConvergence(p);
 assert.equal(q.ok,false);
 assert.equal(q.maxDeltaVolts,null);
 const v=analyzeRCNetwork(createExample('rc-parallel'),{durationSeconds:.5,substepsPerInterval:0});
 assert.equal(v.ok,false);
 assert.match(v.reason,/步长/);
});
test('RC accuracy reference: 2x200µF parallel delta matches expected one-tau analytic curve',()=>{
 const p=createExample('rc-parallel');
 p.parts.find(c=>c.id==='c1').value=200;
 const a=analyzeRCNetwork(p,{durationSeconds:.8,substepsPerInterval:20});
 assert.equal(a.ok,true,a.reason);
 const atOneTau=a.samples[50]; // C=400µF, R=1kΩ, tau=.4 sec
 const expected=9*(1-Math.exp(-1));
 for(const id of ['c1','c2']){
   assert.ok(Math.abs(atOneTau.capacitors[id].voltageVolts-expected)<.025);
 }
});
