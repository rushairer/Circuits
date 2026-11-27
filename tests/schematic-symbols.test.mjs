import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject,parts,pins,demo} from '../.test-dist/model.js';
import {createSchematic} from '../.test-dist/core/schematic.js';
import {connectedSchematicSymbol} from '../.test-dist/ui/schematic-symbols.js';
import {schematicSvg} from '../.test-dist/ui/schematic-panel.js';

test('every visible component symbol has a separate lead at each real pin anchor',()=>{
 const p=blankProject();
 p.parts=parts.filter(kind=>kind!=='breadboard').map((kind,i)=>({kind,id:'p'+i,x:0,y:0,rotation:0}));
 const before=structuredClone(p),d=createSchematic(p);
 assert.equal(d.ok,true);
 for(const c of d.components){
  const symbol=connectedSchematicSymbol(c);
  assert.ok(symbol,c.kind);
  assert.equal(symbol.leads.size,Object.keys(pins[c.kind]).length);
  assert.match(symbol.body,new RegExp('data-symbol-kind="'+c.kind+'"'));
  for(const t of c.terminals){
   const lead=symbol.leads.get(t.pinId);
   assert.ok(lead);
   assert.match(lead,new RegExp('^M[0-9.]+ '+t.y+' H'+t.x+'$'));
   assert.equal(t.netId,null);
  }
  assert.equal(new Set(symbol.leads.values()).size,c.terminals.length);
 }
 const svg=schematicSvg(d);
 assert.equal((svg.match(/class="sch-pin-lead"/g)||[]).length,d.unconnectedTerminals);
 assert.equal((svg.match(/class="sch-symbol"/g)||[]).length,d.components.length);
 assert.deepEqual(p,before);
});

test('switch art follows physical contact state, while separate lead identities are retained',()=>{
 const p=blankProject();
 p.parts=[{kind:'switch',id:'s',x:0,y:0,rotation:0,closed:false}];
 const open=createSchematic(p).components[0];
 p.parts[0].closed=true;
 const closed=createSchematic(p).components[0];
 assert.match(connectedSchematicSymbol(open).body,/M-1 -6 L-12 6/);
 assert.match(connectedSchematicSymbol(closed).body,/M0 -6 V6/);
 assert.deepEqual([...connectedSchematicSymbol(open).leads],[...connectedSchematicSymbol(closed).leads]);
 assert.equal(open.terminals[0].netId,null);
 assert.equal(closed.terminals[0].netId,closed.terminals[1].netId);
});

test('demo exported SVG keeps existing external routing and exact terminal anchors',()=>{
 const p=demo(),before=structuredClone(p),d=createSchematic(p),svg=schematicSvg(d);
 assert.equal((svg.match(/class="sch-link"/g)||[]).length,6);
 assert.equal((svg.match(/class="sch-pin-lead"/g)||[]).length,9);
 assert.equal((svg.match(/class="sch-terminal"/g)||[]).length,9);
 assert.doesNotMatch(svg,/<script\b|<foreignObject\b/);
 assert.deepEqual(p,before);
});
