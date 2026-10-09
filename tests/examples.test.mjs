import test from 'node:test';
import assert from 'node:assert/strict';
import { validProject } from '../.test-dist/model.js';
import { exampleCatalog,createExample } from '../.test-dist/core/examples.js';
import { analyzeDC } from '../.test-dist/core/dc-analysis.js';
import { analyzeRC } from '../.test-dist/core/rc-transient.js';
import { analyzeRCNetwork } from '../.test-dist/core/rc-network.js';
import { analyzeGpioD13 } from '../.test-dist/core/gpio-d13.js';
import { createScopeCapture } from '../.test-dist/core/scope.js';
import { readRcVoltageProbe, readRcCurrentProbe } from '../.test-dist/core/rc-probes.js';

test('all documented example circuits are valid versioned JSON projects',()=>{
 assert.equal(exampleCatalog.length,13);
 const ids=new Set(exampleCatalog.map(e=>e.id));
 assert.equal(ids.size,13);
 for(const e of exampleCatalog){
  const p=createExample(e.id);
  assert.ok(p,e.id);
  assert.ok(validProject(p),e.id);
  assert.equal(p.schemaVersion,2);
  const result=e.id==='gpio-d13-led'?analyzeGpioD13(p,true):
    e.id==='rc-parallel'||e.id==='rc-series'?analyzeRCNetwork(p):
    e.id.startsWith('rc-')?analyzeRC(p):analyzeDC(p);
  assert.equal(result.ok,true,e.id+': '+result.reason);
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

test('two-capacitor teaching fixtures exhibit independent parallel and series responses',()=>{
 const parallel=analyzeRCNetwork(createExample('rc-parallel'),{durationSeconds:.6});
 const series=analyzeRCNetwork(createExample('rc-series'),{durationSeconds:.5});
 assert.equal(parallel.ok,true,parallel.reason);
 assert.equal(series.ok,true,series.reason);
 const atOneTauParallel=parallel.samples[50];
 assert.ok(Math.abs(atOneTauParallel.capacitors.c1.voltageVolts-5.689)<.025);
 assert.ok(Math.abs(atOneTauParallel.capacitors.c2.voltageVolts-5.689)<.025);
 const atOneTauSeries=series.samples[10];
 assert.ok(Math.abs(atOneTauSeries.capacitors.c1.voltageVolts-2.8445)<.025);
 assert.ok(Math.abs(atOneTauSeries.capacitors.c2.voltageVolts-2.8445)<.025);
});

test('resistor-voltage example measures 9V initially, then 3.31V at one time constant',()=>{
 const p=createExample('rc-resistor-meter'),analysis=analyzeRC(p);
 assert.equal(analysis.ok,true,analysis.reason);
 const capture=createScopeCapture(analysis);
 assert.equal(readRcVoltageProbe(p,capture,'m1',0).status,'measured');
 assert.equal(readRcVoltageProbe(p,capture,'m1',0).volts,9);
 const result=readRcVoltageProbe(p,capture,'m1',20);
 assert.equal(result.status,'measured');
 assert.ok(Math.abs(result.volts-9*Math.exp(-1))<.002);
});

test('series ammeter and lossy-switch examples have meaningful computed results',()=>{
 const dc=analyzeDC(createExample('dc-ammeter'));
 assert.equal(dc.ok,true,dc.reason);
 assert.equal(dc.ammeters.i1.status,'measured');
 assert.ok(dc.ammeters.i1.milliAmps>0);
 const rcDoc=createExample('rc-ammeter'),rc=analyzeRC(rcDoc);
 assert.equal(rc.ok,true,rc.reason);
 const current=readRcCurrentProbe(rcDoc,createScopeCapture(rc),'i1',0);
 assert.equal(current.status,'measured',current.reason);
 assert.ok(current.milliAmps>8.9&&current.milliAmps<9.01);
 const switched=analyzeRC(createExample('rc-contact-switch'));
 assert.equal(switched.ok,true,switched.reason);
 assert.ok(Math.abs(switched.tauSeconds-.110)<1e-7);
});

test('Arduino D13 external LED fixture lights only at HIGH and preserves user sketch',()=>{
 const p=createExample('gpio-d13-led');
 assert.equal(validProject(p),true);
 assert.ok(p.code.includes('digitalWrite(13, HIGH)'));
 assert.equal(p.parts.filter(x=>x.kind==='arduino').length,1);
 assert.equal(p.parts.filter(x=>x.kind==='battery').length,0);
 const on=analyzeGpioD13(p,true),off=analyzeGpioD13(p,false);
 assert.equal(on.ok,true,on.reason);
 assert.equal(off.ok,true,off.reason);
 assert.equal(on.leds.l1.status,'normal');
 assert.ok(on.leds.l1.currentMilliAmps>7&&on.leds.l1.currentMilliAmps<11);
 assert.equal(off.leds.l1.lit,false);
});
