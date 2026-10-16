import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,validProject} from '../.test-dist/model.js';
import {buildNetlist} from '../.test-dist/core/netlist.js';
import {RESISTANCE_UNITS,changeResistorValue,isResistanceUnit,resistorDisplayValue} from '../.test-dist/core/resistance-units.js';

test('eight engineering prefixes keep resistance in canonical ohms and topology stable',()=>{
 const initial=demo(),net=buildNetlist(initial);
 assert.equal(RESISTANCE_UNITS.map(u=>u.symbol).join(','),'pΩ,nΩ,µΩ,mΩ,Ω,kΩ,MΩ,GΩ');
 assert.equal(isResistanceUnit('invented'),false);
 assert.equal(resistorDisplayValue(initial.parts.find(c=>c.id==='r1')),330);
 for(const {value,multiplier} of RESISTANCE_UNITS){
  const edited=changeResistorValue(initial,'r1',330,value);
  assert.ok(edited);
  const part=edited.parts.find(c=>c.id==='r1');
  assert.equal(part.value,330*multiplier);
  assert.equal(resistorDisplayValue(part),330);
  assert.equal(validProject(edited),true);
  assert.deepEqual(edited.wires,initial.wires);
  for(const wire of initial.wires){
   assert.equal(buildNetlist(edited).netOf(wire.from),net.netOf(wire.from));
   assert.equal(buildNetlist(edited).netOf(wire.to),net.netOf(wire.to));
  }
 }
 assert.equal(initial.parts.find(c=>c.id==='r1').resistanceUnit,undefined);
});
test('unit changes and invalid values preserve project immutability',()=>{
 const p=demo(),snapshot=structuredClone(p);
 const kilo=changeResistorValue(p,'r1',1.5,'k');
 assert.equal(kilo.parts.find(c=>c.id==='r1').value,1500);
 assert.equal(kilo.parts.find(c=>c.id==='r1').resistanceUnit,'k');
 assert.strictEqual(kilo.wires,p.wires);
 assert.strictEqual(changeResistorValue(kilo,'r1',1.5,'k'),kilo);
 const ohm=changeResistorValue(kilo,'r1',1500,'ohm');
 assert.equal(Object.hasOwn(ohm.parts.find(c=>c.id==='r1'),'resistanceUnit'),false);
 for(const [n,unit] of [[0,'ohm'],[-1,'k'],[NaN,'k'],[Infinity,'k'],[1e10,'G'],[1e-7,'p'],[1,'invalid']]){
  assert.equal(changeResistorValue(p,'r1',n,unit),null);
 }
 assert.equal(changeResistorValue(p,'l1',2,'ohm'),null);
 const invalid=structuredClone(p);invalid.parts.find(c=>c.id==='l1').resistanceUnit='k';
 assert.equal(validProject(invalid),false);
 invalid.parts.find(c=>c.id==='l1').resistanceUnit=undefined;
 invalid.parts.find(c=>c.id==='r1').resistanceUnit='bad';
 assert.equal(validProject(invalid),false);
 assert.deepEqual(p,snapshot);
});
