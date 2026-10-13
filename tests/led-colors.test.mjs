import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,validProject} from '../.test-dist/model.js';
import {buildNetlist} from '../.test-dist/core/netlist.js';
import {LED_COLORS,isLedColor,ledAppearance,changeLedColor} from '../.test-dist/core/led-colors.js';

test('LED lens palette reproduces six original inspector options without modifying old default red',()=>{
 assert.deepEqual(LED_COLORS.map(x=>x.value),['red','green','yellow','orange','blue','white']);
 assert.equal(ledAppearance(undefined).shell,'#ee525c');
 assert.equal(ledAppearance(undefined).foot,'#d73b4a');
 assert.equal(ledAppearance(undefined).glow,'#ff7a74');
 for(const color of LED_COLORS){
   assert.equal(isLedColor(color.value),true);
   assert.match(color.shell,/^#[0-9a-f]{6}$/);
   assert.match(color.foot,/^#[0-9a-f]{6}$/);
   assert.match(color.glow,/^#[0-9a-f]{6}$/);
 }
 for(const color of ['',null,'Purple','red;alert(1)','black','#ee525c',undefined]){
   assert.equal(isLedColor(color),false);
 }
});

test('visual LED color edits preserve project netlist terminals, wires, geometry and component IDs',()=>{
 const p=demo(),snapshot=structuredClone(p),baseline=buildNetlist(p);
 for(const color of LED_COLORS){
   const changed=changeLedColor(p,'l1',color.value);
   assert.ok(changed);
   assert.equal(validProject(changed),true);
   assert.deepEqual(changed.wires,p.wires);
   assert.strictEqual(changed.wires,p.wires);
   assert.strictEqual(changed.parts[0],p.parts[0]);
   assert.strictEqual(changed.parts[1],p.parts[1]);
   assert.strictEqual(changed.parts[3],p.parts[3]);
   assert.equal(changed.parts.find(part=>part.id==='l1').id,'l1');
   assert.equal(changed.parts.find(part=>part.id==='l1').ledColor,color.value==='red'?undefined:color.value);
   const nets=buildNetlist(changed);
   for(const wire of p.wires){
     assert.equal(nets.netOf(wire.from),baseline.netOf(wire.from));
     assert.equal(nets.netOf(wire.to),baseline.netOf(wire.to));
   }
 }
 assert.deepEqual(p,snapshot);
 assert.equal(p.parts.find(part=>part.id==='l1').ledColor,undefined);
});

test('legacy red is an identity no-op and invalid or non-LED edits are rejected',()=>{
 const p=demo();
 assert.equal(validProject(p),true);
 assert.strictEqual(changeLedColor(p,'l1','red'),p);
 assert.strictEqual(changeLedColor(p,'b1','blue'),null);
 assert.strictEqual(changeLedColor(p,'missing','blue'),null);
 assert.strictEqual(changeLedColor(p,'l1','cerulean'),null);
 const blue=changeLedColor(p,'l1','blue');
 assert.notStrictEqual(blue,p);
 assert.strictEqual(changeLedColor(blue,'l1','blue'),blue);
});

test('invalid LED color, non-LED color and prototype-shaped inputs fail import validation',()=>{
 const p=demo();
 const variants=[
  {...p,parts:p.parts.map(x=>x.id==='l1'?{...x,ledColor:'cyan'}:x)},
  {...p,parts:p.parts.map(x=>x.id==='b1'?{...x,ledColor:'green'}:x)},
  {...p,parts:p.parts.map(x=>x.id==='l1'?{...x,ledColor:{value:'green'}}:x)},
  {...p,parts:p.parts.map(x=>x.id==='l1'?{...x,ledColor:null}:x)}
 ];
 for(const input of variants)assert.equal(validProject(input),false);
 const valid=changeLedColor(p,'l1','white');
 assert.equal(validProject(valid),true);
});
