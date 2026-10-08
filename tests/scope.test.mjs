import test from 'node:test';
import assert from 'node:assert/strict';
import { createExample } from '../.test-dist/core/examples.js';
import { analyzeRC } from '../.test-dist/core/rc-transient.js';
import { analyzeRCNetwork } from '../.test-dist/core/rc-network.js';
import { createScopeCapture, scopeFrame, exportScopeCSV } from '../.test-dist/core/scope.js';
import { readRcVoltageProbe } from '../.test-dist/core/rc-probes.js';
const wire=(id,from,fromPin,to,toPin)=>({
  id,from:{componentId:from,pinId:fromPin},
  to:{componentId:to,pinId:toPin},color:'#4b5563'
});
const meter=(p,a,b)=>{p.parts.push({id:'m1',kind:'multimeter',x:0,y:0,rotation:0});
 p.wires.push(wire('wm1','m1','positive',a,'a'),wire('wm2','m1','negative',b,'b'));
 return p;
};
test('scope: canonical single-capacitor analytical capture retains exact sampling',()=>{
 const doc=createExample('rc-charge'),analysis=analyzeRC(doc);
 const capture=createScopeCapture(analysis);
 assert.ok(capture);
 assert.equal(capture.model,'analytic');
 assert.deepEqual(capture.capacitorIds,['c1']);
 assert.equal(capture.frames.length,101);
 assert.equal(scopeFrame(capture,'c1',0).voltageVolts,0);
 const value=scopeFrame(capture,'c1',20);
 assert.ok(Math.abs(value.voltageVolts-5.689085)<.00001);
 assert.equal(scopeFrame(capture,'bad',0),null);
 assert.equal(scopeFrame(capture,'c1',-1),null);
 assert.equal(scopeFrame(capture,'c1',10.5),null);
});
test('scope: multi-capacitor capture preserves unknown t=0 current',()=>{
 const analysis=analyzeRCNetwork(createExample('rc-parallel'));
 assert.equal(analysis.ok,true,analysis.reason);
 const capture=createScopeCapture(analysis);
 assert.equal(capture.model,'backward-euler');
 assert.equal(capture.capacitorIds.length,2);
 assert.equal(scopeFrame(capture,'c1',0).currentMilliAmps,null);
 assert.equal(scopeFrame(capture,'c2',0).currentMilliAmps,null);
 assert.ok(scopeFrame(capture,'c1',25).currentMilliAmps>0);
});
test('scope: CSV contains 101 data rows, explicit units, no invented zeros',()=>{
 const capture=createScopeCapture(analyzeRCNetwork(createExample('rc-parallel')));
 const csv=exportScopeCSV(capture);
 const lines=csv.trimEnd().split('\r\n');
 assert.equal(lines.length,102);
 assert.equal(lines[0],'time_seconds,c1_voltage_V,c1_current_mA,c2_voltage_V,c2_current_mA');
 assert.equal(lines[1],'0,0,,0,');
 assert.ok(lines[2].split(',').every(s=>s===''||Number.isFinite(Number(s))));
 assert.ok(!csv.includes('NaN'));
 assert.ok(!csv.includes('undefined'));
});
test('scope: source-free discharge preserves signed branch current in exported CSV',()=>{
 const capture=createScopeCapture(analyzeRC(createExample('rc-discharge')));
 assert.ok(scopeFrame(capture,'c1',0).currentMilliAmps<0);
 assert.match(exportScopeCSV(capture),/0,9,-9/);
});
test('scope: rejected analysis cannot produce a capture',()=>{
 const p=createExample('rc-charge');p.parts[2].value=0;
 assert.equal(createScopeCapture(analyzeRC(p)),null);
});
test('scope: captured frames are detached from solver-owned arrays',()=>{
 const analysis=analyzeRC(createExample('rc-charge')),capture=createScopeCapture(analysis);
 analysis.samples[0].voltageVolts=123;
 assert.equal(capture.frames[0].capacitors.c1.voltageVolts,0);
});
test('probe: signed RC capacitor voltage is determined only by terminal net IDs',()=>{
 const p=meter(createExample('rc-charge'),'c1','c1');
 const capture=createScopeCapture(analyzeRC(p));
 const plus=readRcVoltageProbe(p,capture,'m1',20);
 assert.equal(plus.status,'measured');assert.ok(Math.abs(plus.volts-5.689085)<.001);
 p.wires[4].to.pinId='a';
 const zero=readRcVoltageProbe(p,capture,'m1',20);
 assert.equal(zero.status,'measured');assert.equal(zero.volts,0);
 p.wires[4].to.pinId='b';
 p.wires[3].to.pinId='b';
 const reverse=readRcVoltageProbe(p,capture,'m1',20);
 assert.equal(reverse.status,'measured');assert.ok(reverse.volts<0);
});
test('probe: voltmeter measures series capacitor stack by summing node voltages',()=>{
 const p=createExample('rc-series');
 p.parts.push({id:'m1',kind:'multimeter',x:0,y:0,rotation:0});
 p.wires.push(wire('wm1','m1','positive','c1','a'),wire('wm2','m1','negative','c2','b'));
 const capture=createScopeCapture(analyzeRCNetwork(p));
 const reading=readRcVoltageProbe(p,capture,'m1',20);
 const c1=scopeFrame(capture,'c1',20).voltageVolts,c2=scopeFrame(capture,'c2',20).voltageVolts;
 assert.equal(reading.status,'measured');
 assert.ok(Math.abs(reading.volts-(c1+c2))<1e-5);
});
test('probe: disconnected meter is not given a fabricated 0 V value',()=>{
 const p=createExample('rc-parallel');
 p.parts.push({id:'m1',kind:'multimeter',x:0,y:0,rotation:0});
 const capture=createScopeCapture(analyzeRCNetwork(p));
 const reading=readRcVoltageProbe(p,capture,'m1',20);
 assert.equal(reading.status,'unconnected');assert.equal(reading.volts,null);
});
test('probe: unsupported resistor measurement and unknown sample stay unavailable',()=>{
 const p=createExample('rc-charge');
 p.parts.push({id:'m1',kind:'multimeter',x:0,y:0,rotation:0});
 p.wires.push(wire('wm1','m1','positive','r1','a'),wire('wm2','m1','negative','r1','b'));
 const capture=createScopeCapture(analyzeRC(p));
 assert.equal(readRcVoltageProbe(p,capture,'m1',20).status,'unconnected');
 assert.equal(readRcVoltageProbe(p,capture,'m1',999).status,'unsupported');
});
