import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../.test-dist/model.js';
import {createSchematic} from '../.test-dist/core/schematic.js';
import {schematicBridge} from '../.test-dist/core/schematic-bridge.js';
import {schematicBranches} from '../.test-dist/core/schematic-branches.js';
import {nestedSchematic} from '../.test-dist/core/schematic-nested.js';
import {schematicSvg,renderSchematicWorkspace} from '../.test-dist/ui/schematic-panel.js';

function fixture(kind='resistor'){
 const p=blankProject();
 p.parts=[{id:'bat',kind:'battery',x:0,y:0,rotation:0,value:9},
  ...['r1','r2','r3','r4','cross'].map((id,i)=>({id,kind:id==='cross'?kind:'resistor',x:i*140,y:100,rotation:0,...(id==='cross'&&kind!=='resistor'?{}:{value:220})}))];
 const wire=(a,ap,b,bp)=>p.wires.push({id:'w'+p.wires.length,from:{componentId:a,pinId:ap},to:{componentId:b,pinId:bp},color:'#35b65d'});
 wire('bat','positive','r1','a');wire('bat','positive','r3','a');
 wire('r1','b','r2','a');wire('r3','b','r4','a');
 wire('r2','b','bat','negative');wire('r4','b','bat','negative');
 wire('r1','b','cross',kind==='resistor'?'a':'negative');
 wire('r3','b','cross',kind==='resistor'?'b':'positive');
 return p;
}
function assertDisjoint(svg){
 const segments=[...svg.matchAll(/<path class="(?:sch-bus|sch-link|sch-pin-lead)" data-schematic-net="([^"]+)" d="M([\d.]+) ([\d.]+) ([HV])([\d.]+)"/g)].map(m=>{
  const [,net,x,y,axis,last]=m,x1=+x,y1=+y,x2=axis==='H'?+last:x1,y2=axis==='V'?+last:y1;
  return {net,left:Math.min(x1,x2),right:Math.max(x1,x2),top:Math.min(y1,y2),bottom:Math.max(y1,y2)};
 });
 assert.equal(segments.length,14);
 for(const [i,a] of segments.entries())for(const b of segments.slice(i+1))
  if(a.net!==b.net)assert.ok(a.right<b.left||b.right<a.left||a.bottom<b.top||b.bottom<a.top,JSON.stringify({a,b}));
}
test('complete bridge has four distinct nets, every real pin, and no foreign-net intersection',()=>{
 const p=fixture(),before=structuredClone(p),d=createSchematic(p);
 assert.equal(d.ok,true);assert.equal(schematicBranches(d),null);assert.equal(nestedSchematic(d),null);
 const layout=schematicBridge(d);assert.ok(layout);
 assert.equal(layout.cross.component.id,'cross');
 assert.equal(layout.upperLeft.to.netId,layout.cross.from.netId);
 assert.equal(layout.lowerLeft.from.netId,layout.cross.from.netId);
 assert.equal(layout.upperRight.to.netId,layout.cross.to.netId);
 assert.equal(layout.lowerRight.from.netId,layout.cross.to.netId);
 assert.notEqual(layout.cross.from.netId,layout.cross.to.netId);
 const svg=schematicSvg(d);assert.match(svg,/data-schematic-route-mode="bridge"/);
 assert.equal((svg.match(/class="sch-component"/g)||[]).length,6);
 assert.equal((svg.match(/class="sch-terminal"/g)||[]).length,12);
 assert.equal((svg.match(/class="sch-net"/g)||[]).length,4);
 assert.equal((svg.match(/class="sch-junction"/g)||[]).length,4);
 for(const c of d.components)for(const t of c.terminals)
  assert.ok(svg.includes('data-terminal="'+c.id+'::'+t.pinId+'" data-schematic-net="'+t.netId+'"'));
 assertDisjoint(svg);assert.deepEqual(p,before);
 const moved=structuredClone(p);moved.parts.reverse();moved.wires.reverse();
 for(const c of moved.parts){c.x+=120;c.rotation+=90;}
 assert.equal(schematicSvg(createSchematic(moved)),svg);
 assert.match(renderSchematicWorkspace(d,1.5),/width:1485px;height:890px/);
});
test('meter cross-links retain real signed pin IDs and upright symbols',()=>{
 for(const kind of ['multimeter','ammeter']){
  const p=fixture(kind);p.name='<script>x</script>';
  const d=createSchematic(p),layout=schematicBridge(d);assert.ok(layout);
  const svg=schematicSvg(d);assertDisjoint(svg);
  assert.match(svg,/data-schematic-route-mode="bridge"/);
  assert.ok(svg.includes('data-symbol-kind="'+kind+'"'));
  assert.ok(svg.includes('data-terminal="cross::negative" data-schematic-net="'+d.components.find(c=>c.id==='cross').terminals.find(t=>t.pinId==='negative').netId+'"'));
  assert.match(svg,/&lt;script&gt;x&lt;\/script&gt;/);assert.doesNotMatch(svg,/<script\b/);
 }
});
test('incomplete, extra and unsupported graphs keep the existing complete projection',()=>{
 const incomplete=fixture();incomplete.wires.pop();
 const extra=fixture();extra.parts.push({id:'extra',kind:'resistor',x:0,y:0,rotation:0,value:220});
 const unsupported=fixture();unsupported.parts.find(c=>c.id==='r1').kind='capacitor';
 for(const p of [incomplete,extra,unsupported]){
  const d=createSchematic(p);assert.equal(d.ok,true);assert.equal(schematicBridge(d),null);
  const svg=schematicSvg(d);assert.doesNotMatch(svg,/data-schematic-route-mode="bridge"/);
  assert.equal((svg.match(/class="sch-terminal"/g)||[]).length,d.components.length*2);
 }
});
