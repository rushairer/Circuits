import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../.test-dist/model.js';
import {createSchematic} from '../.test-dist/core/schematic.js';
import {layeredSchematic} from '../.test-dist/core/schematic-layered.js';
import {schematicSvg,renderSchematicWorkspace} from '../.test-dist/ui/schematic-panel.js';

function fixture(series=false){
 const p=blankProject();
 p.parts=[
  {id:'bat-a',kind:'battery',x:0,y:0,rotation:0,value:9},
  {id:'bat-b',kind:'battery',x:160,y:0,rotation:0,value:9},
  {id:'r1',kind:'resistor',x:320,y:0,rotation:0,value:330}
 ];
 const connect=(a,ap,b,bp)=>p.wires.push({id:'w'+p.wires.length,from:{componentId:a,pinId:ap},to:{componentId:b,pinId:bp},color:'#35b65d'});
 if(series){
  connect('bat-a','positive','bat-b','negative');
  connect('bat-b','positive','r1','a');
  connect('r1','b','bat-a','negative');
 }else{
  connect('bat-a','positive','bat-b','negative');
  connect('bat-a','negative','bat-b','positive');
  connect('bat-a','positive','r1','a');
  connect('bat-a','negative','r1','b');
 }
 return p;
}
for(const series of [false,true])test('multi-source '+(series?'series':'opposed parallel')+' layout preserves actual source terminals and geometry',()=>{
 const p=fixture(series),before=structuredClone(p),diagram=createSchematic(p),layout=layeredSchematic(diagram);
 assert.ok(layout);assert.equal(layout.devices.length,3);assert.equal(layout.rails.length,series?3:2);
 assert.equal(layout.devices[0].step.component.id,'bat-a');
 assert.equal(layout.devices[0].step.from.pinId,'positive');
 assert.equal(layout.devices[0].step.to.pinId,'negative');
 const other=layout.devices.find(d=>d.step.component.id==='bat-b');
 assert.equal(other.step.from.pinId,'negative');assert.equal(other.step.to.pinId,'positive');
 const svg=schematicSvg(diagram);
 assert.match(svg,/data-schematic-route-mode="layered"/);
 assert.match(svg,/N\d+ · BT1 \+/);assert.match(svg,/N\d+ · BT1 −/);
 assert.ok(svg.includes('translate(0 '+(2*other.mid)+') scale(1 -1)'));
 assert.equal((svg.match(/data-symbol-kind="battery"/g)||[]).length,2);
 assert.equal((svg.match(/class="sch-terminal"/g)||[]).length,6);
 assert.equal((svg.match(/class="sch-net"/g)||[]).length,layout.rails.length);
 for(const d of layout.devices){
  assert.equal(layout.rails.find(r=>r.id===d.step.from.netId).y,d.top);
  assert.equal(layout.rails.find(r=>r.id===d.step.to.netId).y,d.bottom);
  assert.deepEqual(d.crossings,layout.rails.filter(r=>r.y>d.top&&r.y<d.bottom&&d.x>=r.x1&&d.x<=r.x2).map(r=>({netId:r.id,y:r.y})));
 }
 for(const c of diagram.components)for(const t of c.terminals)
  assert.ok(svg.includes('data-terminal="'+c.id+'::'+t.pinId+'" data-schematic-net="'+t.netId+'"'));
 assert.ok(renderSchematicWorkspace(diagram,1.5).includes('width:'+Math.round(layout.width*1.5)+'px'));
 assert.deepEqual(p,before);
 const moved=structuredClone(p);moved.parts.reverse();moved.wires.reverse();
 for(const part of moved.parts){part.x+=300;part.rotation+=90;}
 assert.equal(schematicSvg(createSchematic(moved)),svg);
});
test('multi-source layout refuses shorts, dangling pins and disconnected islands',()=>{
 const dangling=fixture(true);dangling.wires.pop();
 assert.equal(layeredSchematic(createSchematic(dangling)),null);
 const shorted=fixture(false);
 shorted.wires.push({id:'short',from:{componentId:'bat-a',pinId:'positive'},to:{componentId:'bat-a',pinId:'negative'},color:'#35b65d'});
 assert.equal(layeredSchematic(createSchematic(shorted)),null);
 const p=fixture(false),other=fixture(false);
 for(const part of other.parts)p.parts.push({...part,id:'z-'+part.id});
 for(const w of other.wires)p.wires.push({...w,id:'z-'+w.id,from:{...w.from,componentId:'z-'+w.from.componentId},to:{...w.to,componentId:'z-'+w.to.componentId}});
 assert.equal(layeredSchematic(createSchematic(p)),null);
});
