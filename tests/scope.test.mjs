import test from 'node:test';
import assert from 'node:assert/strict';
import { createExample } from '../.test-dist/core/examples.js';
import { analyzeRC } from '../.test-dist/core/rc-transient.js';
import { analyzeRCNetwork } from '../.test-dist/core/rc-network.js';
import { analyzeDC } from '../.test-dist/core/dc-analysis.js';
import { createScopeCapture, scopeFrame, exportScopeCSV } from '../.test-dist/core/scope.js';
import { readRcVoltageProbe, readRcCurrentProbe } from '../.test-dist/core/rc-probes.js';
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
 p.wires[4].to.pinId='a';
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
test('probe: resistor voltage drop equals source minus capacitor transient voltage',()=>{
 const p=createExample('rc-charge');
 p.parts.push({id:'m1',kind:'multimeter',x:0,y:0,rotation:0});
 p.wires.push(wire('wm1','m1','positive','r1','a'),wire('wm2','m1','negative','r1','b'));
 const capture=createScopeCapture(analyzeRC(p));
 const initial=readRcVoltageProbe(p,capture,'m1',0);
 assert.equal(initial.status,'measured',initial.reason);
 assert.ok(Math.abs(initial.volts-9)<1e-8);
 const atTau=readRcVoltageProbe(p,capture,'m1',20);
 assert.equal(atTau.status,'measured',atTau.reason);
 assert.ok(Math.abs(atTau.volts-9*Math.exp(-1))<.002);
 assert.equal(readRcVoltageProbe(p,capture,'m1',999).status,'unsupported');
 p.wires[3].to.pinId='b';p.wires[4].to.pinId='a';
 const reverse=readRcVoltageProbe(p,capture,'m1',20);
 assert.equal(reverse.status,'measured');
 assert.ok(Math.abs(reverse.volts+9*Math.exp(-1))<.002);
});
test('probe: multi-capacitor resistor node uses solved transient capacitor potentials',()=>{
 for(const name of ['rc-parallel','rc-series']){
   const p=createExample(name);
   p.parts.push({id:'m1',kind:'multimeter',x:0,y:0,rotation:0});
   p.wires.push(wire('wm1','m1','positive','r1','a'));
   p.wires.push(wire('wm2','m1','negative','r1','b'));
   const capture=createScopeCapture(analyzeRCNetwork(p));
   const result=readRcVoltageProbe(p,capture,'m1',20);
   const voltage=capture.frames[20].capacitors.c1.voltageVolts+
     (name==='rc-series'?capture.frames[20].capacitors.c2.voltageVolts:0);
   assert.equal(result.status,'measured',name+': '+result.reason);
   assert.ok(Math.abs(result.volts-(9-voltage))<.004);
 }
});
test('probe: battery rail reads 9V across resistor and capacitor networks',()=>{
 const p=createExample('rc-charge');
 p.parts.push({id:'m1',kind:'multimeter',x:0,y:0,rotation:0});
 p.wires.push(wire('wm1','m1','positive','b1','positive'));
 p.wires.push(wire('wm2','m1','negative','b1','negative'));
 const capture=createScopeCapture(analyzeRC(p));
 assert.equal(readRcVoltageProbe(p,capture,'m1',0).volts,9);
 assert.ok(Math.abs(readRcVoltageProbe(p,capture,'m1',70).volts-9)<1e-5);
});
test('probe: same net reads true 0V only after both leads are connected',()=>{
 const p=createExample('rc-charge');
 p.parts.push({id:'m1',kind:'multimeter',x:0,y:0,rotation:0});
 p.wires.push(wire('wm1','m1','positive','r1','a'));
 const capture=createScopeCapture(analyzeRC(p));
 assert.equal(readRcVoltageProbe(p,capture,'m1',20).status,'unconnected');
 p.wires.push(wire('wm2','m1','negative','r1','a'));
 const same=readRcVoltageProbe(p,capture,'m1',20);
 assert.equal(same.status,'measured');
 assert.equal(same.volts,0);
});
test('probe: disconnected islands and resistor-only island cannot fabricate voltage',()=>{
 const p=createExample('rc-charge');
 p.parts.push({id:'r2',kind:'resistor',x:0,y:0,rotation:0,value:330});
 p.parts.push({id:'m1',kind:'multimeter',x:0,y:0,rotation:0});
 p.wires.push(wire('wm1','m1','positive','r2','a'));
 p.wires.push(wire('wm2','m1','negative','r2','b'));
 const capture=createScopeCapture(analyzeRC(p));
 assert.equal(readRcVoltageProbe(p,capture,'m1',20).status,'unsupported');
 p.wires[4].to.componentId='c1';p.wires[4].to.pinId='a';
 assert.equal(readRcVoltageProbe(p,capture,'m1',20).status,'unsupported');
});
test('probe: inconsistent ideal battery and capacitor constraints reject meter result',()=>{
 const p=createExample('rc-charge');
 p.parts.push({id:'m1',kind:'multimeter',x:0,y:0,rotation:0});
 p.wires.push(wire('wm1','m1','positive','c1','a'),wire('wm2','m1','negative','c1','b'));
 // A hidden wire here would force 9 V over a capacitor that the existing
 // previously captured waveform still says is 5.689 V.
 const cap=createScopeCapture(analyzeRC(p));
 p.wires.push(wire('short1','c1','a','b1','positive'));
 const report=readRcVoltageProbe(p,cap,'m1',20);
 assert.equal(report.status,'unsupported');
 assert.match(report.reason,/约束/);
});


test('RC shunt ammeter reads signed series charging current with physical burden',()=>{
 const p=createExample('rc-charge');
 p.parts.push({id:'m1',kind:'ammeter',x:800,y:250,rotation:0});
 p.wires[1]=wire('w2','r1','b','m1','positive');
 p.wires.push(wire('wa2','m1','negative','c1','a'));
 const analysis=analyzeRC(p);
 assert.equal(analysis.ok,true,analysis.reason);
 const capture=createScopeCapture(analysis);
 const atZero=readRcCurrentProbe(p,capture,'m1',0);
 assert.equal(atZero.status,'measured',atZero.reason);
 assert.ok(Math.abs(atZero.milliAmps-9*1000/1000.1)<.005);
 const atTau=readRcCurrentProbe(p,capture,'m1',20);
 assert.equal(atTau.status,'measured',atTau.reason);
 assert.ok(Math.abs(atTau.milliAmps-9*Math.exp(-1)*1000/1000.1)<.006);
 p.wires[1]=wire('w2','r1','b','m1','negative');
 p.wires[p.wires.length-1]=wire('wa2','m1','positive','c1','a');
 const reverse=readRcCurrentProbe(p,capture,'m1',20);
 assert.equal(reverse.status,'measured');
 assert.ok(reverse.milliAmps<0);
});
test('RC ammeter without both series terminals connected is not a 0mA reading',()=>{
 const p=createExample('rc-charge');
 p.parts.push({id:'m1',kind:'ammeter',x:0,y:0,rotation:0});
 p.wires.push(wire('w4','m1','positive','r1','a'));
 const capture=createScopeCapture(analyzeRC(p));
 const value=readRcCurrentProbe(p,capture,'m1',20);
 assert.equal(value.status,'unconnected');assert.equal(value.milliAmps,null);
});
test('RC ammeter inserted into discharge branch measures negative current',()=>{
 const p=createExample('rc-discharge');
 p.parts.push({id:'m1',kind:'ammeter',x:300,y:430,rotation:0});
 p.wires[0]=wire('w1','r1','a','m1','positive');
 p.wires.push(wire('w3','m1','negative','c1','a'));
 const capture=createScopeCapture(analyzeRC(p));
 const atZero=readRcCurrentProbe(p,capture,'m1',0);
 assert.equal(atZero.status,'measured',atZero.reason);
 assert.ok(atZero.milliAmps>8.9);
});
test('DC analysis: shunt ammeter participates as 0.1Ω resistor not ideal infinite conductance',()=>{
 const p=createExample('basic');
 p.parts.push({id:'m1',kind:'ammeter',x:800,y:430,rotation:0});
 p.wires[0]=wire('w1','b1','positive','m1','positive');
 p.wires.push(wire('wa','m1','negative','r1','a'));
 const result=analyzeDC(p);
 assert.equal(result.ok,true,result.reason);
 const current=result.ammeters.m1;
 assert.ok(current);
 assert.equal(current.status,'measured');
 assert.ok(current.milliAmps>0);
 assert.ok(current.milliAmps<30);
 assert.ok(Math.abs(current.milliAmps-result.leds.l1.currentMilliAmps)<.02);
});
