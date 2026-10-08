import test from 'node:test';
import assert from 'node:assert/strict';
import { demo, validProject } from '../.test-dist/model.js';
import { analyzeDC } from '../.test-dist/core/dc-analysis.js';

const wire=(id,from,fromPin,to,toPin)=>({
 id,from:{componentId:from,pinId:fromPin},to:{componentId:to,pinId:toPin},color:'#4b5563'
});
const series=()=>demo();

test('nonlinear DC: demo LED is lit and within 0.1-30 mA',()=>{
 const report=analyzeDC(series());
 assert.equal(report.ok,true,report.reason);
 assert.equal(report.leds.l1.status,'normal');
 assert.ok(report.leds.l1.currentMilliAmps>17&&report.leds.l1.currentMilliAmps<25);
 assert.ok(report.leds.l1.forwardVolts>1.9&&report.leds.l1.forwardVolts<2.1);
 assert.equal(report.warnings.length,0);
});
test('nonlinear DC: opening the series branch prevents LED current',()=>{
 const p=series();p.wires.pop();
 const r=analyzeDC(p);assert.equal(r.ok,true,r.reason);
 assert.equal(r.leds.l1.lit,false);
 assert.ok(r.leds.l1.currentMilliAmps<0.1);
});
test('nonlinear DC: reverse polarity LED does not light',()=>{
 const p=series();
 p.wires[1].to.pinId='cathode';
 p.wires[2].from.pinId='anode';
 const r=analyzeDC(p);
 assert.equal(r.ok,true,r.reason);
 assert.equal(r.leds.l1.lit,false);
});
test('nonlinear DC: parallel LED branches are evaluated independently',()=>{
 const p=series();
 p.parts.push({id:'r2',kind:'resistor',x:250,y:0,rotation:0,value:470});
 p.parts.push({id:'l2',kind:'led',x:600,y:0,rotation:0});
 p.wires.push(
 wire('w4','b1','positive','r2','a'),
 wire('w5','r2','b','l2','anode'),
 wire('w6','l2','cathode','b1','negative')
 );
 assert.equal(validProject(p),true);
 const r=analyzeDC(p);assert.equal(r.ok,true,r.reason);
 assert.equal(r.leds.l1.status,'normal');
 assert.equal(r.leds.l2.status,'normal');
 assert.ok(r.leds.l1.currentMilliAmps>r.leds.l2.currentMilliAmps);
 assert.ok(r.leds.l2.currentMilliAmps>10);
});
test('nonlinear DC: two series LEDs have positive separate currents',()=>{
 const p=series();p.parts.push({id:'l2',kind:'led',x:0,y:0,rotation:0});
 p.wires[2]=wire('w3','l1','cathode','l2','anode');
 p.wires.push(wire('w4','l2','cathode','b1','negative'));
 const r=analyzeDC(p);assert.equal(r.ok,true,r.reason);
 assert.equal(r.leds.l1.status,'normal');
 assert.equal(r.leds.l2.status,'normal');
 assert.ok(Math.abs(r.leds.l1.currentMilliAmps-r.leds.l2.currentMilliAmps)<.005);
 assert.ok(r.leds.l1.currentMilliAmps<21);
});
test('nonlinear DC: one LED without series resistance gets overcurrent warning',()=>{
 const p=series();p.wires=[
 wire('w1','b1','positive','l1','anode'),
 wire('w2','l1','cathode','b1','negative')
 ];
 const r=analyzeDC(p);assert.equal(r.ok,true,r.reason);
 assert.equal(r.leds.l1.lit,false);
 assert.equal(r.leds.l1.status,'overcurrent');
 assert.match(r.reason,/过流/);
});
test('nonlinear DC: 9 V battery is measurable across high-impedance probe pins',()=>{
 const p=series();p.parts.push({id:'m1',kind:'multimeter',x:0,y:0,rotation:0});
 p.wires.push(wire('w4','m1','positive','b1','positive'),
              wire('w5','m1','negative','b1','negative'));
 const r=analyzeDC(p);assert.equal(r.ok,true,r.reason);
 assert.equal(r.meters.m1.status,'measured');
 assert.equal(r.meters.m1.volts,9);
});
test('nonlinear DC: reversed voltmeter probes show negative voltage',()=>{
 const p=series();p.parts.push({id:'m1',kind:'multimeter',x:0,y:0,rotation:0});
 p.wires.push(wire('w4','m1','positive','b1','negative'),
              wire('w5','m1','negative','b1','positive'));
 const r=analyzeDC(p);assert.equal(r.ok,true,r.reason);
 assert.equal(r.meters.m1.volts,-9);
});
test('nonlinear DC: unconnected probes never display fabricated zero voltage',()=>{
 const p=series();p.parts.push({id:'m1',kind:'multimeter',x:0,y:0,rotation:0});
 const r=analyzeDC(p);assert.equal(r.ok,true,r.reason);
 assert.deepEqual(r.meters.m1,{volts:null,status:'unconnected'});
});
test('nonlinear DC: rejects voltage source short and multi-battery operation',()=>{
 const p=series();p.wires.push(wire('short','b1','positive','b1','negative'));
 assert.equal(analyzeDC(p).ok,false);
 const q=series();q.parts.push({id:'b2',kind:'battery',x:0,y:0,rotation:0});
 assert.equal(analyzeDC(q).ok,false);
});
test('nonlinear DC: wired unsupported peripherals cannot be marked as simulated',()=>{
 const p=series();p.wires.push(wire('bad','a1','d13','b1','positive'));
 const r=analyzeDC(p);
 assert.equal(r.ok,false);
 assert.match(r.reason,/尚未建模/);
});
test('nonlinear DC: near-unpowered floating islands stay unmeasured',()=>{
 const p=series();
 p.parts.push({id:'l2',kind:'led',x:0,y:0,rotation:0});
 const r=analyzeDC(p);assert.equal(r.ok,true,r.reason);
 assert.equal(r.leds.l2.status,'unpowered');
});
