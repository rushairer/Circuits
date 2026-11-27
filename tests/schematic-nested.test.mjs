import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../.test-dist/model.js';
import {createSchematic} from '../.test-dist/core/schematic.js';
import {schematicBranches} from '../.test-dist/core/schematic-branches.js';
import {nestedSchematic,nestedDimensions} from '../.test-dist/core/schematic-nested.js';
import {nestedSheetSize} from '../.test-dist/ui/schematic-nested-view.js';
import {schematicSvg,renderSchematicWorkspace} from '../.test-dist/ui/schematic-panel.js';

function fixture(bridge=false){
 const p=blankProject();
 p.parts=[{id:'bat',kind:'battery',x:0,y:0,rotation:0,value:9},
  ...['r0','r1','r2','r3','r4','r5'].map((id,i)=>({id,kind:'resistor',x:i*120,y:100,rotation:0,value:220}))];
 const wire=(a,ap,b,bp)=>p.wires.push({id:'w'+p.wires.length,from:{componentId:a,pinId:ap},to:{componentId:b,pinId:bp},color:'#35b65d'});
 // r0 in series with (r1 in series with (r2 || r3)) || r4, then r5.
 wire('bat','positive','r0','a');wire('r0','b','r1','a');wire('r0','b','r4','a');
 wire('r1','b','r2','a');wire('r1','b','r3','a');
 wire('r2','b','r4','b');wire('r3','b','r4','b');wire('r4','b','r5','a');wire('r5','b','bat','negative');
 if(bridge){
  // An extra cross edge from the high rail to the output of r4
  // alone remains reducible. Instead attach a second intermediate
  // node in the r4 branch and bridge it to r1's output.
  p.parts.push({id:'r6',kind:'resistor',x:0,y:300,rotation:0,value:220},{id:'rx',kind:'resistor',x:120,y:300,rotation:0,value:220});
  p.wires=p.wires.filter(w=>!(w.from.componentId==='r2'&&w.to.componentId==='r4')&&!(w.from.componentId==='r3'&&w.to.componentId==='r4')&&!(w.from.componentId==='r4'&&w.to.componentId==='r5'));
  // Unique IDs after deleting wires.
  p.wires.forEach((w,i)=>w.id='w'+i);
  wire('r4','b','r6','a');wire('r6','b','r5','a');
  wire('r2','b','r5','a');wire('r3','b','r5','a');
  wire('r1','b','rx','a');wire('rx','b','r4','b');
 }
 return p;
}
function leaves(n){return n.kind==='device'?[n.step]:n.children.flatMap(leaves);}

function assertDisjointNetPaths(svg){
 const segments=[...svg.matchAll(/<path class="(?:sch-bus|sch-link|sch-pin-lead)" data-schematic-net="([^"]+)" d="M([\d.]+) ([\d.]+) ([HV])([\d.]+)"/g)].map(m=>{
  const [,net,x,y,axis,last]=m,x1=+x,y1=+y,x2=axis==='H'?+last:x1,y2=axis==='V'?+last:y1;
  return {net,left:Math.min(x1,x2),right:Math.max(x1,x2),top:Math.min(y1,y2),bottom:Math.max(y1,y2)};
 });
 assert.equal(segments.length,(svg.match(/class="(?:sch-bus|sch-link|sch-pin-lead)" data-schematic-net=/g)||[]).length);
 assert.ok(segments.length>0);
 for(const [i,a] of segments.entries())for(const b of segments.slice(i+1))
  if(a.net!==b.net)assert.ok(a.right<b.left||b.right<a.left||a.bottom<b.top||b.bottom<a.top,JSON.stringify({a,b}));
}
test('nested reduction preserves every device and oriented pin and renders all real net IDs',()=>{
 const p=fixture(),before=structuredClone(p),d=createSchematic(p);
 assert.equal(d.ok,true);assert.equal(schematicBranches(d),null);
 const layout=nestedSchematic(d);assert.ok(layout);
 assert.equal(layout.root.kind,'series');assert.ok(layout.root.children.some(c=>c.kind==='parallel'));
 assert.equal(layout.root.from,layout.source.from.netId);assert.equal(layout.root.to,layout.source.to.netId);
 assert.deepEqual(leaves(layout.root).map(s=>s.component.id).sort(),['r0','r1','r2','r3','r4','r5']);
 function check(n){if(n.kind==='device'){assert.equal(n.from,n.step.from.netId);assert.equal(n.to,n.step.to.netId);return;}
  for(const [i,c] of n.children.entries()){
   assert.equal(c.from,n.kind==='parallel'||i===0?n.from:n.children[i-1].to);
   if(n.kind==='parallel'||i===n.children.length-1)assert.equal(c.to,n.to);
   check(c);
  }
 }
 check(layout.root);
 const svg=schematicSvg(d);
 assert.match(svg,/data-schematic-route-mode="nested"/);
 assertDisjointNetPaths(svg);
 assert.equal((svg.match(/class="sch-net"/g)||[]).length,d.nets.length);
 assert.equal((svg.match(/class="sch-component"/g)||[]).length,d.components.length);
 assert.equal((svg.match(/class="sch-terminal"/g)||[]).length,14);
 for(const c of d.components)for(const t of c.terminals)
  assert.ok(svg.includes('data-terminal="'+c.id+'::'+t.pinId+'" data-schematic-net="'+t.netId+'"'));
 const {width,height}=nestedSheetSize(layout);
 assert.ok(renderSchematicWorkspace(d,1.5).includes('width:'+Math.round(width*1.5)+'px;height:'+Math.round(height*1.5)+'px'));
 assert.ok(nestedDimensions(layout.root).width>=540);
 assert.deepEqual(p,before);
 const moved=structuredClone(p);moved.parts.reverse();moved.wires.reverse();
 for(const c of moved.parts){c.x+=200;c.rotation+=90;}
 assert.equal(schematicSvg(createSchematic(moved)),svg);
});
test('non-reducible bridge and dangling devices fall back without dropping terminals',()=>{
 const d=createSchematic(fixture(true));assert.equal(d.ok,true);
 assert.equal(nestedSchematic(d),null);assert.equal(schematicBranches(d),null);
 assert.doesNotMatch(schematicSvg(d),/data-schematic-route-mode="nested"/);
 assert.equal((schematicSvg(d).match(/class="sch-terminal"/g)||[]).length,d.components.length*2);
 const p=fixture();p.parts.push({id:'floating',kind:'resistor',x:0,y:300,rotation:0,value:220});
 assert.equal(nestedSchematic(createSchematic(p)),null);
});
test('nested SVG escapes text and preserves a reversed LED through reduction',()=>{
 const p=fixture();p.name='<script>x</script>';
 const r=p.parts.find(c=>c.id==='r2');r.kind='led';delete r.value;r.name='<img src=x onerror=x>';
 for(const w of p.wires)for(const e of [w.from,w.to])if(e.componentId==='r2')e.pinId=e.pinId==='a'?'cathode':'anode';
 const d=createSchematic(p),layout=nestedSchematic(d);assert.ok(layout);
 assert.equal(leaves(layout.root).find(s=>s.component.id==='r2').from.pinId,'cathode');
 const svg=schematicSvg(d);assert.match(svg,/rotate\(180 /);assert.match(svg,/&lt;script&gt;x&lt;\/script&gt;/);
 assert.match(svg,/&lt;img src=x onerror=x&gt;/);assert.doesNotMatch(svg,/<script\b|<img\b|<foreignObject\b/i);
});

test('layout budgets reject oversized branch and series graphs rather than truncate',()=>{
 function make(count,parallel){
  const p=blankProject();p.parts=[{id:'bat',kind:'battery',x:0,y:0,rotation:0,value:9},
   ...Array.from({length:count},(_,i)=>({id:'r'+i,kind:'resistor',x:i*100,y:100,rotation:0,value:220}))];
  const wire=(a,ap,b,bp)=>p.wires.push({id:'w'+p.wires.length,from:{componentId:a,pinId:ap},to:{componentId:b,pinId:bp},color:'#35b65d'});
  if(parallel)for(let i=0;i<count;i++){wire('bat','positive','r'+i,'a');wire('r'+i,'b','bat','negative');}
  else {wire('bat','positive','r0','a');for(let i=0;i<count-1;i++)wire('r'+i,'b','r'+(i+1),'a');wire('r'+(count-1),'b','bat','negative');}
  return createSchematic(p);
 }
 for(const d of [make(9,true),make(21,false)]){
  assert.equal(d.ok,true);assert.equal(schematicBranches(d),null);assert.equal(nestedSchematic(d),null);
  assert.equal((schematicSvg(d).match(/class="sch-terminal"/g)||[]).length,d.components.length*2);
 }
});
