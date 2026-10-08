import test from 'node:test';
import assert from 'node:assert/strict';
import { validProject } from '../.test-dist/model.js';
import { exampleCatalog,createExample } from '../.test-dist/core/examples.js';
import { analyzeDC } from '../.test-dist/core/dc-analysis.js';
import { analyzeRC } from '../.test-dist/core/rc-transient.js';

test('all documented example circuits are valid versioned JSON projects',()=>{
 assert.equal(exampleCatalog.length,6);
 const ids=new Set(exampleCatalog.map(e=>e.id));
 assert.equal(ids.size,6);
 for(const e of exampleCatalog){
  const p=createExample(e.id);
  assert.ok(p,e.id);
  assert.ok(validProject(p),e.id);
  assert.equal(p.schemaVersion,2);
  assert.equal(e.id.startsWith('rc-')?analyzeRC(p).ok:analyzeDC(p).ok,true,e.id);
 }
 assert.equal(createExample('nonexistent'),null);
});
test('dual-LED parallel example uses two limiting resistors and two independent currents',()=>{
 const p=createExample('parallel'),r=analyzeDC(p);
 assert.equal(p.parts.filter(x=>x.kind==='resistor').length,2);
 assert.equal(p.parts.filter(x=>x.kind==='led').length,2);
 assert.ok(r.leds.l1.currentMilliAmps>r.leds.l2.currentMilliAmps);
 assert.equal(r.leds.l1.lit,true);assert.equal(r.leds.l2.lit,true);
});
test('series example has equal currents through both LEDs',()=>{
 const r=analyzeDC(createExample('series'));
 assert.ok(Math.abs(r.leds.l1.currentMilliAmps-r.leds.l2.currentMilliAmps)<0.005);
});
test('meter example shows 9 volts without adding an electrically active load',()=>{
 const p=createExample('voltmeter');
 const r=analyzeDC(p);
 assert.equal(r.meters.m1.status,'measured');
 assert.equal(r.meters.m1.volts,9);
 assert.equal(r.leds.l1.status,'normal');
});

test('RC starter examples have correct 0.1s charging/discharging response',()=>{
 const charging=analyzeRC(createExample('rc-charge'));
 const discharging=analyzeRC(createExample('rc-discharge'));
 assert.equal(charging.ok,true,charging.reason);
 assert.equal(discharging.ok,true,discharging.reason);
 assert.ok(Math.abs(charging.tauSeconds-0.1)<1e-8);
 assert.ok(Math.abs(discharging.tauSeconds-0.1)<1e-8);
 assert.ok(Math.abs(charging.steadyVolts-9)<1e-8);
 assert.ok(Math.abs(discharging.steadyVolts)<1e-8);
 assert.equal(charging.samples[0].voltageVolts,0);
 assert.equal(discharging.samples[0].voltageVolts,9);
});
