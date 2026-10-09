import test from 'node:test';
import assert from 'node:assert/strict';
import { blankProject, demo, validProject } from '../.test-dist/model.js';
import { analyzeGpioD13, UNO_HIGH_VOLTS, UNO_DRIVER_OHMS } from '../.test-dist/core/gpio-d13.js';
import { buildNetlist } from '../.test-dist/core/netlist.js';

const wire=(id,from,fromPin,to,toPin)=>({
 id,from:{componentId:from,pinId:fromPin},
 to:{componentId:to,pinId:toPin},color:'#e45454'
});
const project=()=>{
 const p=blankProject();p.name='D13 GPIO external LED';
 p.parts=[
  {id:'a1',kind:'arduino',x:80,y:180,rotation:0},
  {id:'r1',kind:'resistor',x:400,y:120,rotation:0,value:330},
  {id:'l1',kind:'led',x:740,y:150,rotation:0}
 ];
 p.wires=[
  wire('w1','a1','d13','r1','a'),
  wire('w2','r1','b','l1','anode'),
  wire('w3','l1','cathode','a1','gnd')
 ];
 return p;
};
test('D13 snapshot: HIGH forward LED is lit with finite 25-ohm GPIO burden',()=>{
 const p=project(),saved=structuredClone(p);
 const r=analyzeGpioD13(p,true);
 assert.equal(r.ok,true,r.reason);
 assert.equal(UNO_HIGH_VOLTS,5);
 assert.equal(UNO_DRIVER_OHMS,25);
 assert.equal(r.leds.l1.lit,true);
 assert.equal(r.leds.l1.status,'normal');
 assert.ok(r.leds.l1.currentMilliAmps>7&&r.leds.l1.currentMilliAmps<11,r.leds.l1.currentMilliAmps);
 assert.ok(Math.abs(r.leds.l1.currentMilliAmps-r.driverMilliAmps)<.001);
 assert.deepEqual(p,saved,'transient source must never mutate real circuit');
});
test('D13 LOW is zero volts; external LED turns off without synthetic positive power',()=>{
 const r=analyzeGpioD13(project(),false);
 assert.equal(r.ok,true,r.reason);
 assert.equal(r.leds.l1.lit,false);
 assert.equal(r.leds.l1.status,'off');
 assert.ok(Math.abs(r.driverMilliAmps)<0.01);
});
test('disconnecting either wire prevents a fabricated measurement or glow',()=>{
 const p=project();
 p.wires.pop();
 const r=analyzeGpioD13(p,true);
 assert.equal(r.ok,false);
 assert.match(r.reason,/GND/);
 assert.equal(r.leds.l1,undefined);
 p.wires.push(wire('w3','l1','cathode','a1','gnd'));
 p.wires.shift();
 assert.equal(analyzeGpioD13(p,true).ok,false);
});
test('reversed LED is off with modelled source and resistor',()=>{
 const p=project();
 p.wires[1].to.pinId='cathode';
 p.wires[2].from.pinId='anode';
 const r=analyzeGpioD13(p,true);
 assert.equal(r.ok,true,r.reason);
 assert.equal(r.leds.l1.lit,false);
 assert.ok(r.leds.l1.currentMilliAmps<.1);
});
test('no resistor causes GPIO overcurrent warning rather than safely glowing LED',()=>{
 const p=project();
 p.wires=[
  wire('w1','a1','d13','l1','anode'),
  wire('w2','l1','cathode','a1','gnd')
 ];
 const r=analyzeGpioD13(p,true);
 assert.equal(r.ok,true,r.reason);
 assert.ok(r.driverMilliAmps>20,r.driverMilliAmps);
 assert.equal(r.leds.l1.status,'overcurrent');
 assert.equal(r.leds.l1.lit,false);
 assert.match(r.warnings.join(' '),/20mA/);
});
test('direct D13-to-GND short is refused with an explicit diagnostic',()=>{
 const p=project();
 p.wires.push(wire('short','a1','d13','a1','gnd'));
 const r=analyzeGpioD13(p,true);
 assert.equal(r.ok,false);
 assert.match(r.reason,/短接/);
});
test('external supply and unsupported connected peripherals are refused',()=>{
 const p=project();
 p.parts.push({id:'b1',kind:'battery',x:0,y:0,rotation:0,value:9});
 assert.match(analyzeGpioD13(p,true).reason,/独立电池/);
 p.parts.pop();
 p.parts.push({id:'c1',kind:'capacitor',x:0,y:0,rotation:0,value:100});
 p.wires.push(wire('wc','r1','b','c1','a'));
 assert.match(analyzeGpioD13(p,true).reason,/不支持/);
});
test('5V pin does not masquerade as simulated GPIO source',()=>{
 const p=project();
 p.wires.push(wire('aux','a1','v5','r1','a'));
 const r=analyzeGpioD13(p,true);
 assert.equal(r.ok,false);
 assert.match(r.reason,/5V/);
});
test('multiple or missing Uno boards are rejected before source synthesis',()=>{
 const p=project();
 p.parts.push({id:'a2',kind:'arduino',x:0,y:0,rotation:0});
 assert.equal(analyzeGpioD13(p,true).ok,false);
 p.parts=p.parts.filter(c=>c.kind!=='arduino');
 assert.equal(analyzeGpioD13(p,true).ok,false);
});
test('multiple LED branches follow actual net topology and individual current limits',()=>{
 const p=project();
 p.parts.push(
  {id:'r2',kind:'resistor',x:0,y:0,rotation:0,value:470},
  {id:'l2',kind:'led',x:0,y:0,rotation:0}
 );
 p.wires.push(
  wire('w4','a1','d13','r2','a'),
  wire('w5','r2','b','l2','anode'),
  wire('w6','l2','cathode','a1','gnd')
 );
 const r=analyzeGpioD13(p,true);
 assert.equal(r.ok,true,r.reason);
 assert.equal(r.leds.l1.lit,true);
 assert.equal(r.leds.l2.lit,true);
 assert.ok(r.leds.l1.currentMilliAmps>r.leds.l2.currentMilliAmps);
 assert.ok(r.driverMilliAmps>r.leds.l1.currentMilliAmps);
 assert.ok(r.driverMilliAmps<20);
});
test('breadboard rail identities are preserved through virtual-source transformation',()=>{
 const p=project();
 p.parts.push({id:'bb1',kind:'breadboard',x:0,y:0,rotation:0});
 p.wires[0]=wire('w1','a1','d13','bb1','hole-a-1');
 p.wires.push(wire('w4','bb1','hole-b-1','r1','a'));
 const r=analyzeGpioD13(p,true);
 assert.equal(r.ok,true,r.reason);
 assert.equal(r.leds.l1.lit,true);
});
test('open switch breaks current while closed 100-ohm contact has less current',()=>{
 const p=project();
 p.parts.push({id:'s1',kind:'switch',x:0,y:0,rotation:0,closed:true,contactOhms:100});
 p.wires[0]=wire('w1','a1','d13','s1','a');
 p.wires.push(wire('w4','s1','b','r1','a'));
 const lossy=analyzeGpioD13(p,true);
 assert.equal(lossy.ok,true,lossy.reason);
 assert.ok(lossy.leds.l1.lit);
 p.parts.find(x=>x.id==='s1').contactOhms=0;
 const ideal=analyzeGpioD13(p,true);
 assert.equal(ideal.ok,true,ideal.reason);
 assert.ok(ideal.leds.l1.currentMilliAmps>lossy.leds.l1.currentMilliAmps);
 p.parts.find(x=>x.id==='s1').closed=false;
 const open=analyzeGpioD13(p,true);
 assert.equal(open.ok,true,open.reason);
 assert.equal(open.leds.l1.lit,false);
});
test('pin alias names collide with internal ids without overwriting user objects',()=>{
 const p=project();
 p.parts.find(x=>x.id==='r1').id='__gpio13_source';
 p.wires[0].to.componentId='__gpio13_source';
 p.wires[1].from.componentId='__gpio13_source';
 assert.equal(validProject(p),true);
 const r=analyzeGpioD13(p,true);
 assert.equal(r.ok,true,r.reason);
 assert.equal(r.leds.l1.lit,true);
});
test('malformed project is rejected rather than generating an invalid synthetic netlist',()=>{
 const p=project();p.wires[0].to.pinId='unknown';
 assert.equal(validProject(p),false);
 assert.equal(analyzeGpioD13(p,true).ok,false);
});
