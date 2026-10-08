import test from 'node:test';
import assert from 'node:assert/strict';
import { blankProject, validProject } from '../.test-dist/model.js';
import { analyzeRCNetwork } from '../.test-dist/core/rc-network.js';

const wire=(id,a,ap,b,bp)=>({
 id,from:{componentId:a,pinId:ap},to:{componentId:b,pinId:bp},color:'#4b5563'
});
const close=(x,y,tolerance=.035)=>assert.ok(Math.abs(x-y)<tolerance,x+' vs '+y);
function parallel({battery=true,initial=0}={}){
 const p=blankProject();p.name='双电容并联 RC';
 p.parts=[
   ...(battery?[{id:'b1',kind:'battery',x:50,y:100,rotation:0,value:9}]:[]),
   {id:'r1',kind:'resistor',x:300,y:130,rotation:0,value:1000},
   {id:'c1',kind:'capacitor',x:620,y:110,rotation:0,value:100,initialVolts:initial},
   {id:'c2',kind:'capacitor',x:850,y:110,rotation:0,value:200,initialVolts:initial}
 ];
 p.wires=[
   wire('w1','r1','b','c1','a'),wire('w2','c1','a','c2','a'),
   wire('w3','c1','b','c2','b'),wire('w4','r1','a','c1','b'),
   ...(battery?[
     wire('w5','r1','a','b1','positive'),
     wire('w6','c1','b','b1','negative')
   ]:[])
 ];
 // With a source, r1.a is 9 V and c1.b is 0 V: do NOT short those rails.
 if(battery)p.wires=p.wires.filter(w=>w.id!=='w4');
 return p;
}
function series(){
 const p=blankProject();p.name='双电容串联 RC';
 p.parts=[
   {id:'b1',kind:'battery',x:50,y:120,rotation:0,value:9},
   {id:'r1',kind:'resistor',x:280,y:120,rotation:0,value:1000},
   {id:'c1',kind:'capacitor',x:540,y:120,rotation:0,value:100,initialVolts:0},
   {id:'c2',kind:'capacitor',x:790,y:120,rotation:0,value:100,initialVolts:0}
 ];
 p.wires=[
   wire('w1','b1','positive','r1','a'),
   wire('w2','r1','b','c1','a'),
   wire('w3','c1','b','c2','a'),
   wire('w4','c2','b','b1','negative')
 ];
 return p;
}
test('network: parallel capacitors behave as 300µF charged through 1kΩ',()=>{
 const p=parallel();assert.equal(validProject(p),true);
 const r=analyzeRCNetwork(p,{durationSeconds:.6});
 assert.equal(r.ok,true,r.reason);assert.equal(r.samples.length,101);
 assert.deepEqual(r.capacitorIds,['c1','c2']);
 const s=r.samples[50],expected=9*(1-Math.exp(-1)); // t=0.3, tau=0.3
 close(s.timeSeconds,.3,1e-9);
 close(s.capacitors.c1.voltageVolts,expected,.02);
 close(s.capacitors.c2.voltageVolts,expected,.02);
 close(s.capacitors.c2.currentMilliAmps/s.capacitors.c1.currentMilliAmps,2,.002);
 assert.equal(r.samples[0].capacitors.c1.currentMilliAmps,null);
});
test('network: series equal capacitors share a 9V charging step',()=>{
 const p=series();assert.equal(validProject(p),true);
 const r=analyzeRCNetwork(p,{durationSeconds:.5});
 assert.equal(r.ok,true,r.reason);
 const s=r.samples[10],expected=4.5*(1-Math.exp(-1)); // tau=0.05 s
 close(s.timeSeconds,.05,1e-9);
 close(s.capacitors.c1.voltageVolts,expected,.02);
 close(s.capacitors.c2.voltageVolts,expected,.02);
 close(s.capacitors.c1.currentMilliAmps,s.capacitors.c2.currentMilliAmps,.01);
});
test('network: source-free parallel capacitors discharge with shared 0.3s tau',()=>{
 const p=parallel({battery:false,initial:9});
 const r=analyzeRCNetwork(p,{durationSeconds:.6});
 assert.equal(r.ok,true,r.reason);
 close(r.samples[50].capacitors.c1.voltageVolts,9*Math.exp(-1),.02);
 close(r.samples[50].capacitors.c2.voltageVolts,9*Math.exp(-1),.02);
 assert.ok(r.samples[50].capacitors.c1.currentMilliAmps<0);
 assert.ok(r.warnings.some(x=>x.includes('无电池')));
});
test('network: conflicting parallel capacitor initial voltages are rejected',()=>{
 const p=parallel();
 p.parts.find(x=>x.id==='c2').initialVolts=6;
 const r=analyzeRCNetwork(p);
 assert.equal(r.ok,false);
 assert.match(r.reason,/冲突/);
});
test('network: capacitor directly across ideal battery rejects incompatible t=0',()=>{
 const p=parallel();
 p.wires.push(wire('w7','c1','a','b1','positive'));
 p.parts.find(x=>x.id==='c1').initialVolts=0;
 assert.equal(analyzeRCNetwork(p).ok,false);
});
test('network: rejects hard short and unsupported connected LED',()=>{
 const p=series();
 p.wires.push(wire('w5','c1','a','c1','b'));
 assert.match(analyzeRCNetwork(p).reason,/短路/);
 const q=series();q.parts.push({id:'l1',kind:'led',x:0,y:0,rotation:0});
 q.wires.push(wire('w5','l1','anode','b1','positive'));
 assert.match(analyzeRCNetwork(q).reason,/不支持/);
});
test('network: denies one and seven capacitors or invalid window',()=>{
 const p=series();
 p.parts=p.parts.filter(x=>x.id!=='c2');
 assert.equal(analyzeRCNetwork(p).ok,false);
 const q=series();
 for(let i=3;i<=7;i++)q.parts.push({id:'c'+i,kind:'capacitor',x:0,y:i*20,rotation:0,value:100});
 assert.equal(analyzeRCNetwork(q).ok,false);
 assert.equal(analyzeRCNetwork(series(),{durationSeconds:Infinity}).ok,false);
});
test('network: open switch never invents current through disconnected capacitor',()=>{
 const p=series();
 p.parts.push({id:'s1',kind:'switch',x:100,y:350,rotation:0,closed:false});
 p.wires[2]=wire('w3','c1','b','s1','a');
 p.wires.push(wire('w5','s1','b','c2','a'));
 const r=analyzeRCNetwork(p);
 assert.equal(r.ok,true,r.reason);
 close(r.samples[100].capacitors.c1.voltageVolts,0,.001);
 close(r.samples[100].capacitors.c2.voltageVolts,0,.001);
});
test('network: constant initial charge in isolated RC island is numerically stable',()=>{
 const p=parallel({battery:false,initial:0});
 const r=analyzeRCNetwork(p);
 assert.equal(r.ok,true,r.reason);
 assert.ok(r.samples.every(s=>Math.abs(s.capacitors.c1.voltageVolts)<1e-7));
});
