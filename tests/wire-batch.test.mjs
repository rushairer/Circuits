import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,validProject} from '../.test-dist/model.js';
import {buildNetlist} from '../.test-dist/core/netlist.js';
import {recolorWires,removeWires} from '../.test-dist/core/wire-batch.js';

test('bulk wire color updates only wire colors and keeps electrical net identities',()=>{
 const original=demo();
 const before=structuredClone(original),nets=buildNetlist(original);
 const updated=recolorWires(original,new Set(['w1','w2']),'#3b86d1');
 assert.notStrictEqual(updated,original);
 assert.equal(validProject(updated),true);
 assert.deepEqual(updated.wires.map(w=>w.color),['#3b86d1','#3b86d1',original.wires[2]?.color].slice(0,updated.wires.length));
 updated.wires.forEach((w,i)=>{
   const old=before.wires[i];
   assert.equal(w.id,old.id);
   assert.deepEqual(w.from,old.from);
   assert.deepEqual(w.to,old.to);
   assert.deepEqual(w.bends,old.bends);
   assert.deepEqual(w.routing,old.routing);
 });
 const adjusted=buildNetlist(updated);
 assert.deepEqual(adjusted.warnings,nets.warnings);
 for(const wire of before.wires){
   assert.equal(adjusted.netOf(wire.from),nets.netOf(wire.from));
   assert.equal(adjusted.netOf(wire.to),nets.netOf(wire.to));
 }
 assert.deepEqual(original,before);
});
test('no-color-op, unknown IDs and invalid CSS colors preserve object identity',()=>{
 const p=demo();
 assert.strictEqual(recolorWires(p,new Set(),'#3b86d1'),p);
 assert.strictEqual(recolorWires(p,new Set(['missing']),'#3b86d1'),p);
 assert.strictEqual(recolorWires(p,new Set(['w1']),'red'),p);
 assert.strictEqual(recolorWires(p,new Set(['w1']),'#e45454'),p);
 assert.strictEqual(removeWires(p,new Set()),p);
 assert.strictEqual(removeWires(p,new Set(['missing'])),p);
});
test('bulk wire delete removes only selected IDs while preserving components/insertion snapshots',()=>{
 const p=demo(),snapshot=structuredClone(p);
 const out=removeWires(p,new Set(['w1','w2','missing']));
 assert.equal(validProject(out),true);
 assert.deepEqual(out.wires.map(w=>w.id),p.wires.filter(w=>!['w1','w2'].includes(w.id)).map(w=>w.id));
 assert.strictEqual(out.parts,p.parts);
 assert.strictEqual(out.insertions,p.insertions);
 assert.deepEqual(p,snapshot);
});
test('batch recolor keeps unrelated wire object identity and does not create new connection',()=>{
 const p=demo(),id=p.wires[0].id;
 const out=recolorWires(p,new Set([id]),'#888e94');
 assert.notStrictEqual(out.wires[0],p.wires[0]);
 for(let i=1;i<p.wires.length;i++)assert.strictEqual(out.wires[i],p.wires[i]);
 assert.deepEqual(out.wires.map(w=>[w.id,w.from,w.to]),p.wires.map(w=>[w.id,w.from,w.to]));
});
