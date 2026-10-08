import test from 'node:test';
import assert from 'node:assert/strict';
import { blankProject, validProject } from '../.test-dist/model.js';
import { analyzeRC } from '../.test-dist/core/rc-transient.js';

const wire=(id,from,fromPin,to,toPin)=>({
 id,from:{componentId:from,pinId:fromPin},to:{componentId:to,pinId:toPin},color:'#4b5563'
});
const near=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<=tolerance,
 'Expected '+actual+' ≈ '+expected);
function charge(){
 const p=blankProject();p.name='RC 充电';
 p.parts=[
  {id:'b',kind:'battery',x:50,y:100,rotation:0,value:9},
  {id:'r',kind:'resistor',x:300,y:100,rotation:0,value:1000},
  {id:'c',kind:'capacitor',x:600,y:100,rotation:0,value:100,initialVolts:0}
 ];
 p.wires=[
  wire('w1','b','positive','r','a'),
  wire('w2','r','b','c','a'),
  wire('w3','c','b','b','negative')
 ];
 return p;
}
function discharge(){
 const p=blankProject();p.parts=[
  {id:'r',kind:'resistor',x:100,y:100,rotation:0,value:1000},
  {id:'c',kind:'capacitor',x:360,y:100,rotation:0,value:100,initialVolts:9}
 ];
 p.wires=[wire('w1','r','a','c','a'),wire('w2','r','b','c','b')];
 return p;
}
test('RC: standard 9V 1kΩ 100µF charge has tau=0.1 seconds',()=>{
 const p=charge();assert.equal(validProject(p),true);
 const r=analyzeRC(p);assert.equal(r.ok,true,r.reason);
 near(r.resistanceOhms,1000);near(r.tauSeconds,0.1);
 near(r.initialVolts,0);near(r.steadyVolts,9);
 near(r.samples[0].voltageVolts,0);
 near(r.samples[0].currentMilliAmps,9);
 near(r.samples[20].voltageVolts,9*(1-Math.exp(-1)));
 near(r.samples[20].currentMilliAmps,9*Math.exp(-1));
 near(r.samples[100].voltageVolts,9*(1-Math.exp(-5)));
 assert.equal(r.samples.length,101);
});
test('RC: source-free resistor discharge is 9V exp(-t/τ)',()=>{
 const r=analyzeRC(discharge());
 assert.equal(r.ok,true,r.reason);near(r.steadyVolts,0);
 near(r.samples[0].voltageVolts,9);near(r.samples[0].currentMilliAmps,-9);
 near(r.samples[20].voltageVolts,9*Math.exp(-1));
 assert.match(r.warnings.join(' '),/无电池/);
});
test('RC: parallel resistors give Thevenin resistance 500Ω',()=>{
 const p=charge();p.parts.push({id:'r2',kind:'resistor',x:200,y:350,rotation:0,value:1000});
 p.wires.push(wire('w4','b','positive','r2','a'),wire('w5','r2','b','c','a'));
 const result=analyzeRC(p);
 assert.equal(result.ok,true,result.reason);
 near(result.resistanceOhms,500);near(result.tauSeconds,0.05);
 near(result.steadyVolts,9);
});
test('RC: resistors in series give 1.5kΩ and unchanged 9V final',()=>{
 const p=charge();p.parts.push({id:'r2',kind:'resistor',x:180,y:350,rotation:0,value:500});
 p.wires[1]=wire('w2','r','b','r2','a');
 p.wires.push(wire('w4','r2','b','c','a'));
 const result=analyzeRC(p);assert.equal(result.ok,true,result.reason);
 near(result.resistanceOhms,1500);near(result.tauSeconds,0.15);
 near(result.steadyVolts,9);
});
test('RC: initial capacitor voltage may be above battery and relax down',()=>{
 const p=charge();p.parts.find(x=>x.id==='c').initialVolts=12;
 const r=analyzeRC(p);assert.equal(r.ok,true,r.reason);
 near(r.samples[0].voltageVolts,12);near(r.steadyVolts,9);
 assert.ok(r.samples[0].currentMilliAmps<0);
});
test('RC: reversed capacitor pins yield -9V final and signed charging current',()=>{
 const p=charge();p.wires[1]=wire('w2','r','b','c','b');
 p.wires[2]=wire('w3','c','a','b','negative');
 const r=analyzeRC(p);assert.equal(r.ok,true,r.reason);
 near(r.steadyVolts,-9);near(r.samples[0].currentMilliAmps,-9);
});
test('RC: open resistor path, directly shorted capacitor and missing capacitor are rejected',()=>{
 const open=charge();open.wires.pop();
 assert.equal(analyzeRC(open).ok,false);
 const sh=charge();sh.wires.push(wire('w4','c','a','c','b'));
 assert.match(analyzeRC(sh).reason,/短路/);
 const blank=blankProject();assert.equal(analyzeRC(blank).ok,false);
});
test('RC: fails safely for shorted battery and unsupported wired LED',()=>{
 const p=charge();p.wires.push(wire('w4','b','positive','b','negative'));
 assert.equal(analyzeRC(p).ok,false);
 const q=charge();q.parts.push({id:'led',kind:'led',x:0,y:0,rotation:0});
 q.wires.push(wire('w4','led','anode','b','positive'));
 assert.match(analyzeRC(q).reason,/不支持/);
});
test('RC: 2 capacitors and out-of-range µF reject instead of misleading output',()=>{
 const p=charge();
 p.parts.push({id:'c2',kind:'capacitor',x:0,y:0,rotation:0,value:100});
 assert.equal(analyzeRC(p).ok,false);
 const q=charge();q.parts.find(x=>x.id==='c').value=0.000001;
 assert.equal(analyzeRC(q).ok,false);
});
test('RC: ideal battery directly across capacitor has zero resistance and no exponential response',()=>{
 const p=charge();
 p.wires=[wire('w1','c','a','b','positive'),wire('w2','c','b','b','negative')];
 assert.equal(analyzeRC(p).ok,false);
});
test('RC: an open switch in the discharge path disconnects the RC circuit',()=>{
 const p=discharge();p.parts.push({id:'s',kind:'switch',x:100,y:300,rotation:0,closed:false});
 p.wires[0]=wire('w1','r','a','s','a');
 p.wires.push(wire('w3','s','b','c','a'));
 assert.equal(analyzeRC(p).ok,false);
 p.parts.find(x=>x.id==='s').closed=true;
 const r=analyzeRC(p);assert.equal(r.ok,true,r.reason);
 near(r.tauSeconds,0.1);
});
test('RC: passive disconnected extra components do not affect capacitor waveform',()=>{
 const p=charge();p.parts.push({id:'extra',kind:'servo',x:0,y:0,rotation:0});
 const a=analyzeRC(p);
 assert.equal(a.ok,true,a.reason);near(a.tauSeconds,0.1);
});
