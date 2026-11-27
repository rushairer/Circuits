import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../.test-dist/model.js';
import {createSchematic} from '../.test-dist/core/schematic.js';
import {portSchematic} from '../.test-dist/core/schematic-ports.js';
import {schematicSvg,renderSchematicWorkspace} from '../.test-dist/ui/schematic-panel.js';

function fixture(){
 const p=blankProject();
 p.parts=[{id:'uno',kind:'arduino',x:0,y:0,rotation:0},
  {id:'servo',kind:'servo',x:300,y:0,rotation:0},
  {id:'pot',kind:'potentiometer',x:600,y:0,rotation:0,value:10000}];
 const connect=(a,ap,b,bp)=>p.wires.push({id:'w'+p.wires.length,from:{componentId:a,pinId:ap},to:{componentId:b,pinId:bp},color:'#35b65d'});
 connect('uno','v5','servo','positive');connect('uno','gnd','servo','negative');
 connect('uno','d13','servo','signal');connect('uno','v5','pot','a');
 connect('uno','gnd','pot','b');connect('uno','gnd','pot','wiper');
 return p;
}
test('mixed three-port devices keep each real terminal including repeated net membership',()=>{
 const p=fixture(),before=structuredClone(p),d=createSchematic(p),layout=portSchematic(d);
 assert.ok(layout);assert.equal(layout.devices.length,3);assert.equal(layout.rails.length,3);
 const tracks=layout.devices.flatMap(x=>x.tracks);
 assert.equal(tracks.length,9);assert.equal(new Set(tracks.map(t=>t.x)).size,9);
 for(const t of tracks){
  const rail=layout.rails.find(r=>r.id===t.terminal.netId);
  assert.equal(t.endY,rail.y);assert.ok(t.x<=rail.x2);
  assert.deepEqual(t.crossings,layout.rails.filter(r=>r.y<t.endY&&t.x>=r.x1&&t.x<=r.x2).map(r=>({netId:r.id,y:r.y})));
 }
 for(const dev of layout.devices)for(let i=1;i<dev.tracks.length;i++){
  assert.ok(dev.tracks[i].x<dev.tracks[i-1].x);
  assert.ok(dev.tracks[i].y>dev.tracks[i-1].y);
 }
 const pot=layout.devices.find(x=>x.component.id==='pot');
 assert.equal(pot.tracks[1].terminal.netId,pot.tracks[2].terminal.netId);
 const svg=schematicSvg(d);
 assert.match(svg,/data-schematic-route-mode="ports"/);
 assert.equal((svg.match(/class="sch-terminal"/g)||[]).length,9);
 assert.equal((svg.match(/class="sch-pin-lead"/g)||[]).length,9);
 assert.equal((svg.match(/class="sch-junction"/g)||[]).length,9);
 assert.equal((svg.match(/class="sch-crossover"/g)||[]).length,tracks.reduce((n,t)=>n+t.crossings.length,0));
 for(const t of tracks)assert.ok(svg.includes('data-terminal="'+t.terminal.componentId+'::'+t.terminal.pinId+'" data-schematic-net="'+t.terminal.netId+'"'));
 assert.ok(renderSchematicWorkspace(d,1.5).includes('width:'+Math.round(layout.width*1.5)+'px;height:'+Math.round(layout.height*1.5)+'px'));
 assert.deepEqual(p,before);
 const moved=structuredClone(p);moved.parts.reverse();moved.wires.reverse();
 for(const c of moved.parts){c.x+=300;c.rotation+=90;}
 assert.equal(schematicSvg(createSchematic(moved)),svg);
});
test('port view escapes source labels and refuses incomplete, mismatched or disconnected graphs',()=>{
 const p=fixture();p.name='<script>x</script>';p.parts[0].name='<img src=x>';
 const d=createSchematic(p),svg=schematicSvg(d);
 assert.match(svg,/&lt;script&gt;x&lt;\/script&gt;/);assert.match(svg,/&lt;img src=x&gt;/);
 assert.doesNotMatch(svg,/<script\b|<img\b|<foreignObject\b/i);
 const incomplete=structuredClone(p);incomplete.wires.pop();
 assert.equal(portSchematic(createSchematic(incomplete)),null);
 const mismatch=structuredClone(d);mismatch.nets[0].endpointKeys.pop();
 assert.equal(portSchematic(mismatch),null);
 const island=structuredClone(p);
 island.parts.push({id:'r1',kind:'resistor',x:0,y:300,rotation:0,value:220},{id:'r2',kind:'resistor',x:200,y:300,rotation:0,value:220});
 for(const pinId of ['a','b'])island.wires.push({id:'island-'+pinId,from:{componentId:'r1',pinId},to:{componentId:'r2',pinId},color:'#35b65d'});
 assert.equal(portSchematic(createSchematic(island)),null);
});
