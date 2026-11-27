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
test('port view escapes source labels and refuses mismatched or disconnected graphs but retains unused pins',()=>{
 const p=fixture();p.name='<script>x</script>';p.parts[0].name='<img src=x>';
 const d=createSchematic(p),svg=schematicSvg(d);
 assert.match(svg,/&lt;script&gt;x&lt;\/script&gt;/);assert.match(svg,/&lt;img src=x&gt;/);
 assert.doesNotMatch(svg,/<script\b|<img\b|<foreignObject\b/i);
 const incomplete=structuredClone(p);incomplete.wires.pop();
 const partial=createSchematic(incomplete),partialLayout=portSchematic(partial);
 assert.ok(partialLayout);
 const unused=partialLayout.devices.flatMap(d=>d.tracks).find(t=>t.terminal.netId===null);
 assert.equal(unused.terminal.pinId,'wiper');assert.equal(unused.endY,null);assert.deepEqual(unused.crossings,[]);
 const partialSvg=schematicSvg(partial);
 assert.match(partialSvg,/data-schematic-route-mode="ports"/);
 assert.match(partialSvg,/data-terminal="pot::wiper" data-schematic-net="NC"/);
 assert.equal((partialSvg.match(/class="sch-nc"/g)||[]).length,1);
 assert.equal((partialSvg.match(/class="sch-junction"/g)||[]).length,8);
 const badCount=structuredClone(partial);badCount.unconnectedTerminals=0;
 assert.equal(portSchematic(badCount),null);
 const detached=structuredClone(p);detached.wires=detached.wires.filter(w=>w.from.componentId!=='pot'&&w.to.componentId!=='pot');
 assert.equal(portSchematic(createSchematic(detached)),null);
 const mismatch=structuredClone(d);mismatch.nets[0].endpointKeys.pop();
 assert.equal(portSchematic(mismatch),null);
 const island=structuredClone(p);
 island.parts.push({id:'r1',kind:'resistor',x:0,y:300,rotation:0,value:220},{id:'r2',kind:'resistor',x:200,y:300,rotation:0,value:220});
 for(const pinId of ['a','b'])island.wires.push({id:'island-'+pinId,from:{componentId:'r1',pinId},to:{componentId:'r2',pinId},color:'#35b65d'});
 assert.equal(portSchematic(createSchematic(island)),null);
});

test('adjacent rail optimization strictly reduces crossings without merging port identities',()=>{
 const p=fixture();p.wires=[];
 const groups=[['pot','a','servo','signal'],['pot','wiper','pot','b','servo','positive','servo','negative','uno','d13','uno','gnd','uno','v5']];
 for(const g of groups)for(let i=2;i<g.length;i+=2)p.wires.push({id:'w'+p.wires.length,from:{componentId:g[0],pinId:g[1]},to:{componentId:g[i],pinId:g[i+1]},color:'#35b65d'});
 const d=createSchematic(p),before=structuredClone(d),l=portSchematic(d);
 assert.ok(l);
 const tracks=l.devices.flatMap(dev=>dev.tracks),baseline=[...l.rails].sort((a,b)=>a.x2-b.x2||a.id.localeCompare(b.id,'en'));
 const oldCount=tracks.reduce((n,t)=>n+baseline.slice(0,baseline.findIndex(r=>r.id===t.terminal.netId)).filter(r=>t.x<=r.x2).length,0);
 const newCount=tracks.reduce((n,t)=>n+t.crossings.length,0);
 assert.ok(newCount<oldCount);
 assert.equal(tracks.length,9);assert.deepEqual(d,before);
 const reversed=structuredClone(d);reversed.components.reverse();reversed.nets.reverse();
 assert.deepEqual(portSchematic(reversed),l);
});

test('mixed device columns compact independently without changing track rank or rail identity',()=>{
 const p=fixture();
 p.parts[0].name='很长的元件名称'.repeat(8);
 for(let i=0;i<3;i++){
  const id='resistor'+i;
  p.parts.push({id,kind:'resistor',x:0,y:300+i*100,rotation:0,value:330});
  p.wires.push({id:'extra'+i,from:{componentId:'uno',pinId:'v5'},to:{componentId:id,pinId:'a'},color:'#35b65d'});
 }
 const d=createSchematic(p),snapshot=structuredClone(d),l=portSchematic(d);
 assert.ok(l);
 assert.equal(l.width,1580); // 80 + 3*270 + 3*230
 assert.ok(l.width<80+320*l.devices.length);
 const tracks=l.devices.flatMap(dev=>dev.tracks);
 const xs=tracks.map(t=>t.x).sort((a,b)=>a-b);
 for(let i=1;i<xs.length;i++)assert.ok(xs[i]-xs[i-1]>=40);
 for(const dev of l.devices){
  assert.equal(dev.columnWidth,dev.tracks.length===3?270:230);
  for(const t of dev.tracks){
   assert.ok(t.x-dev.x-35>=90);
   if(t.terminal.netId===null){assert.equal(t.endY,null);assert.deepEqual(t.crossings,[]);continue;}
   assert.equal(t.endY,l.rails.find(r=>r.id===t.terminal.netId).y);
   assert.deepEqual(t.crossings,l.rails.filter(r=>r.y<t.endY&&t.x<=r.x2).map(r=>({netId:r.id,y:r.y})));
  }
 }
 // The old equal-width projection had the same strict left/right track order.
 const oldX=new Map(l.devices.flatMap((dev,i)=>dev.tracks.map((t,j)=>[t,80+i*320+260-j*55])));
 const crossings=tracks.reduce((n,t)=>n+t.crossings.length,0);
 const priorCrossings=tracks.reduce((n,t)=>n+(t.endY===null?0:l.rails.filter(r=>r.y<t.endY&&oldX.get(t)<=Math.max(...tracks.filter(q=>q.terminal.netId===r.id).map(q=>oldX.get(q)))).length),0);
 assert.equal(crossings,priorCrossings);
 const svg=schematicSvg(d);
 assert.match(svg,/width="1580"/);
 assert.equal((svg.match(/class="sch-port-label"/g)||[]).length,tracks.length+2*l.devices.length);
 assert.match(svg,/overflow="hidden" style="width:234px;height:17px/);
 assert.ok(svg.includes(p.parts[0].name)); // full name is retained in title
 assert.match(svg,/…/);
 assert.match(svg,/>b · NC<\/text>/);
 assert.deepEqual(d,snapshot);
});
