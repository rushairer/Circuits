import test from 'node:test';
import assert from 'node:assert/strict';
import { demo, validProject } from '../.test-dist/model.js';
import { buildNetlist } from '../.test-dist/core/netlist.js';
import { resistiveBranches, AMMETER_SHUNT_OHMS } from '../.test-dist/core/resistive-branches.js';
import { analyzeDC } from '../.test-dist/core/dc-analysis.js';
import { analyzeRC } from '../.test-dist/core/rc-transient.js';
import { analyzeRCNetwork } from '../.test-dist/core/rc-network.js';
import { createScopeCapture } from '../.test-dist/core/scope.js';
import { readRcCurrentProbe } from '../.test-dist/core/rc-probes.js';
import { createExample } from '../.test-dist/core/examples.js';

const near=(a,b,eps=.02)=>assert.ok(Math.abs(a-b)<eps,'Expected '+a+' within '+eps+' of '+b);
const wire=(id,from,fp,to,tp)=>({
 id,from:{componentId:from,pinId:fp},to:{componentId:to,pinId:tp},color:'#e45454'
});
test('physical shunt has fixed resistance; importer rejects forgeable shunt values',()=>{
 near(AMMETER_SHUNT_OHMS,.1,1e-12);
 const p=createExample('rc-ammeter');
 assert.equal(validProject(p),true);
 assert.equal(resistiveBranches(p).find(b=>b.kind==='ammeter').ohms,.1);
 const bad=structuredClone(p);
 bad.parts.find(c=>c.id==='i1').value=0;
 assert.equal(validProject(bad),false);
});
test('switch contact validation preserves legacy ideal 0Ω and rejects fake params',()=>{
 const p=createExample('rc-contact-switch');
 for(const x of [0,.1,100,1e6]){
   p.parts.find(c=>c.id==='s1').contactOhms=x;
   assert.equal(validProject(p),true,x);
 }
 for(const x of [-1,.02,1e9,Infinity,NaN]){
   p.parts.find(c=>c.id==='s1').contactOhms=x;
   assert.equal(validProject(p),false,x);
 }
 p.parts.find(c=>c.id==='s1').contactOhms=100;
 p.parts.find(c=>c.id==='c1').contactOhms=20;
 assert.equal(validProject(p),false);
});
test('switch netlist only shorts closed contact when resistance is exactly zero',()=>{
 const p=createExample('rc-contact-switch');
 const endpoint=(pinId)=>({componentId:'s1',pinId});
 const graph=()=>buildNetlist(p);
 p.parts.find(c=>c.id==='s1').contactOhms=100;
 assert.notEqual(graph().netOf(endpoint('a')),graph().netOf(endpoint('b')));
 assert.equal(resistiveBranches(p).filter(b=>b.kind==='switch').length,1);
 p.parts.find(c=>c.id==='s1').contactOhms=0;
 assert.equal(graph().netOf(endpoint('a')),graph().netOf(endpoint('b')));
 assert.equal(resistiveBranches(p).filter(b=>b.kind==='switch').length,0);
 p.parts.find(c=>c.id==='s1').closed=false;
 assert.notEqual(graph().netOf(endpoint('a')),graph().netOf(endpoint('b')));
 assert.equal(resistiveBranches(p).filter(b=>b.kind==='switch').length,0);
});
test('RC single capacitor: 100Ω closed contact increases Rth and tau by exactly 10%',()=>{
 const p=createExample('rc-contact-switch');
 const initial=analyzeRC(p);assert.equal(initial.ok,true,initial.reason);
 near(initial.resistanceOhms,1100,1e-7);
 near(initial.tauSeconds,.11,1e-10);
 near(initial.samples[20].voltageVolts,9*(1-Math.exp(-1)),.0001);
 p.parts.find(c=>c.id==='s1').contactOhms=0;
 const ideal=analyzeRC(p);assert.equal(ideal.ok,true,ideal.reason);
 near(ideal.resistanceOhms,1000,1e-7);
 near(ideal.tauSeconds,.1,1e-10);
 p.parts.find(c=>c.id==='s1').closed=false;
 const open=analyzeRC(p);assert.equal(open.ok,false);
});
test('RC ammeter: 0.1Ω shunt is included in charging tau and signed current',()=>{
 const p=createExample('rc-ammeter');
 const rc=analyzeRC(p);
 assert.equal(rc.ok,true,rc.reason);
 near(rc.resistanceOhms,1000.1,.000001);
 near(rc.tauSeconds,.10001,1e-8);
 const capture=createScopeCapture(rc),current=readRcCurrentProbe(p,capture,'i1',20);
 assert.equal(current.status,'measured',current.reason);
 near(current.milliAmps,9/1000.1*1000*Math.exp(-1),.007);
});
test('multi-capacitor RC: analytical tau reference with 100Ω contact and two parallels',()=>{
 const p=createExample('rc-parallel');
 p.parts.push({id:'s1',kind:'switch',x:100,y:350,rotation:0,closed:true,contactOhms:100});
 p.wires[0]=wire('w1','b1','positive','s1','a');
 p.wires.push(wire('ws','s1','b','r1','a'));
 const analysis=analyzeRCNetwork(p,{durationSeconds:.66,substepsPerInterval:20});
 assert.equal(analysis.ok,true,analysis.reason);
 const reference=9*(1-Math.exp(-1)); // R=1100 C=300uF => tau 0.33s
 near(analysis.samples[50].timeSeconds,.33,1e-9);
 for(const id of ['c1','c2'])near(analysis.samples[50].capacitors[id].voltageVolts,reference,.02);
});
test('multi-capacitor RC: series capacitance reference C_eq=50uF',()=>{
 const p=createExample('rc-series');
 p.parts.push({id:'s1',kind:'switch',x:0,y:350,rotation:0,closed:true,contactOhms:100});
 p.wires[0]=wire('w1','b1','positive','s1','a');
 p.wires.push(wire('ws','s1','b','r1','a'));
 const r=analyzeRCNetwork(p,{durationSeconds:.55,substepsPerInterval:20});
 assert.equal(r.ok,true,r.reason);
 const each=9/2*(1-Math.exp(-1)); // tau .055s
 near(r.samples[10].timeSeconds,.055,1e-9);
 near(r.samples[10].capacitors.c1.voltageVolts,each,.02);
 near(r.samples[10].capacitors.c2.voltageVolts,each,.02);
});
test('DC LED branch with closed lossy switch has less current than ideal switch',()=>{
 const p=demo();
 p.parts.push({id:'s1',kind:'switch',x:60,y:320,rotation:0,closed:true,contactOhms:0});
 p.wires[0]=wire('w1','b1','positive','s1','a');
 p.wires.push(wire('ws','s1','b','r1','a'));
 const ideal=analyzeDC(p);
 assert.equal(ideal.ok,true,ideal.reason);
 p.parts.find(c=>c.id==='s1').contactOhms=120;
 const lossy=analyzeDC(p);
 assert.equal(lossy.ok,true,lossy.reason);
 assert.ok(lossy.leds.l1.currentMilliAmps<ideal.leds.l1.currentMilliAmps);
 p.parts.find(c=>c.id==='s1').closed=false;
 const disconnected=analyzeDC(p);
 assert.equal(disconnected.ok,true,disconnected.reason);
 assert.ok(disconnected.leds.l1.currentMilliAmps<.1);
});
test('partially wired shunt never displays a fabricated 0mA measurement',()=>{
 const p=demo();
 p.parts.push({id:'i1',kind:'ammeter',x:0,y:0,rotation:0});
 p.wires.push(wire('wx','b1','positive','i1','positive'));
 const result=analyzeDC(p);
 assert.equal(result.ok,true,result.reason);
 assert.equal(result.ammeters.i1.status,'unconnected');
 assert.equal(result.ammeters.i1.milliAmps,null);
});
test('ammeter across a 9V battery warns 200mA range, not a safe meter indication',()=>{
 const p=demo();
 p.parts.push({id:'i1',kind:'ammeter',x:0,y:0,rotation:0});
 p.wires.push(wire('wx','b1','positive','i1','positive'),wire('wy','i1','negative','b1','negative'));
 const result=analyzeDC(p);
 assert.equal(result.ok,true,result.reason);
 assert.equal(result.ammeters.i1.status,'overrange');
 assert.ok(result.ammeters.i1.milliAmps>200);
 assert.ok(result.warnings.some(w=>w.includes('200mA')));
});
