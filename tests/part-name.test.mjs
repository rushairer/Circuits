import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,validProject} from '../.test-dist/model.js';
import {buildNetlist} from '../.test-dist/core/netlist.js';
import {renamePart} from '../.test-dist/core/part-name.js';
import {createSchematic} from '../.test-dist/core/schematic.js';
import {schematicSvg} from '../.test-dist/ui/schematic-panel.js';

test('part labels edit immutably without changing electrical connectivity or authored wires',()=>{
 const p=demo(),snapshot=structuredClone(p),prior=buildNetlist(p);
 const renamed=renamePart(p,'r1','  R-limit  ');
 assert.ok(renamed);
 assert.equal(renamed.parts.find(c=>c.id==='r1').name,'R-limit');
 assert.notStrictEqual(renamed,p);
 assert.strictEqual(renamed.wires,p.wires);
 assert.strictEqual(renamed.parts.find(c=>c.id==='b1'),p.parts.find(c=>c.id==='b1'));
 assert.deepEqual(renamed.wires,p.wires);
 for(const wire of p.wires){
  assert.equal(buildNetlist(renamed).netOf(wire.from),prior.netOf(wire.from));
  assert.equal(buildNetlist(renamed).netOf(wire.to),prior.netOf(wire.to));
 }
 assert.equal(validProject(renamed),true);
 assert.deepEqual(p,snapshot);
 assert.strictEqual(renamePart(renamed,'r1','R-limit'),renamed);
 const cleared=renamePart(renamed,'r1','');
 assert.equal(Object.hasOwn(cleared.parts.find(c=>c.id==='r1'),'name'),false);
 assert.equal(validProject(cleared),true);
});

test('part display names are bounded, import-validated and escaped in generated SVG',()=>{
 const p=demo();
 for(const bad of [null,123,{},'a'.repeat(81),'line\nnext','a\u0000b']){
  const badPart=structuredClone(p);
  badPart.parts.find(c=>c.id==='r1').name=bad;
  assert.equal(validProject(badPart),false);
 }
 assert.equal(renamePart(p,'r1','x'.repeat(81)),null);
 assert.equal(renamePart(p,'unknown','x'),null);
 const renamed=renamePart(p,'r1','<img src=x onerror=alert(1)> & "R"');
 assert.ok(renamed);
 const d=createSchematic(renamed);
 assert.equal(d.ok,true);
 assert.match(schematicSvg(d),/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(schematicSvg(d),/<img\b|<script\b|<foreignObject\b/i);
 assert.deepEqual(d.nets,createSchematic(p).nets);
});
