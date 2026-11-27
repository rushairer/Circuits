import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../.test-dist/model.js';
import {createSchematic} from '../.test-dist/core/schematic.js';
import {layeredSchematic} from '../.test-dist/core/schematic-layered.js';
import {schematicSvg,renderSchematicWorkspace} from '../.test-dist/ui/schematic-panel.js';

function fixture(){
 const p=blankProject();
 p.parts=[{id:'bat',kind:'battery',x:0,y:0,rotation:0,value:9},
  ...['r1','r2','r3','r4','cross','extra'].map((id,i)=>({id,kind:id==='extra'?'led':'resistor',x:i*140,y:100,rotation:0,...(id==='extra'?{}:{value:220})}))];
 const connect=(a,ap,b,bp)=>p.wires.push({id:'w'+p.wires.length,from:{componentId:a,pinId:ap},to:{componentId:b,pinId:bp},color:'#35b65d'});
 connect('bat','positive','r1','a');connect('bat','positive','r3','a');
 connect('r1','b','r2','a');connect('r3','b','r4','a');
 connect('r2','b','bat','negative');connect('r4','b','bat','negative');
 connect('r1','b','cross','a');connect('r3','b','cross','b');
 connect('r1','b','extra','cathode');connect('r3','b','extra','anode');
 return p;
}
test('general graph layout keeps all real devices, rails, endpoint dots and insulated crossings',()=>{
 const p=fixture(),before=structuredClone(p),d=createSchematic(p),layout=layeredSchematic(d);
 assert.ok(layout);assert.equal(layout.devices.length,7);assert.equal(layout.rails.length,4);
 assert.equal(layout.rails[0].id,layout.high);assert.equal(layout.rails.at(-1).id,layout.low);
 assert.equal(new Set(layout.devices.map(x=>x.x)).size,7);
 let crossingCount=0;
 for(const dev of layout.devices){
  assert.equal(layout.rails.find(r=>r.id===dev.step.from.netId).y,dev.top);
  assert.equal(layout.rails.find(r=>r.id===dev.step.to.netId).y,dev.bottom);
  assert.ok(dev.mid-20>dev.top&&dev.mid+20<dev.bottom);
  const expected=layout.rails.filter(r=>r.y>dev.top&&r.y<dev.bottom&&dev.x>=r.x1&&dev.x<=r.x2);
  assert.deepEqual(dev.crossings,expected.map(r=>({netId:r.id,y:r.y})));
  for(const cross of dev.crossings)assert.ok(cross.y-10>dev.mid+20&&cross.y+10<dev.bottom);
  crossingCount+=dev.crossings.length;
 }
 assert.ok(crossingCount>0);
 const svg=schematicSvg(d);
 assert.match(svg,/data-schematic-route-mode="layered"/);
 assert.equal((svg.match(/class="sch-component"/g)||[]).length,7);
 assert.equal((svg.match(/class="sch-terminal"/g)||[]).length,14);
 assert.equal((svg.match(/class="sch-net"/g)||[]).length,4);
 assert.equal((svg.match(/class="sch-junction"/g)||[]).length,14);
 assert.equal((svg.match(/class="sch-crossover"/g)||[]).length,crossingCount);
 for(const c of d.components)for(const t of c.terminals)
  assert.ok(svg.includes('data-terminal="'+c.id+'::'+t.pinId+'" data-schematic-net="'+t.netId+'"'));
 assert.ok(renderSchematicWorkspace(d,1.5).includes('width:'+Math.round(layout.width*1.5)+'px;height:'+Math.round(layout.height*1.5)+'px'));
 assert.deepEqual(p,before);
 const moved=structuredClone(p);moved.parts.reverse();moved.wires.reverse();
 for(const c of moved.parts){c.x+=250;c.rotation+=90;}
 assert.equal(schematicSvg(createSchematic(moved)),svg);
});
test('layered export keeps polarity, escapes labels and rejects incomplete or excessive graphs',()=>{
 const p=fixture();p.name='<script>x</script>';p.parts.at(-1).name='<img src=x>';
 const d=createSchematic(p),layout=layeredSchematic(d);assert.ok(layout);
 const svg=schematicSvg(d),led=layout.devices.find(x=>x.step.component.id==='extra');
 assert.ok(led);assert.equal(svg.includes('rotate(180 '+led.x+' '+led.mid+')'),led.step.from.pinId==='cathode');
 assert.match(svg,/&lt;script&gt;x&lt;\/script&gt;/);assert.match(svg,/&lt;img src=x&gt;/);
 assert.doesNotMatch(svg,/<script\b|<img\b|<foreignObject\b/i);
 const incomplete=structuredClone(p);incomplete.wires.pop();
 assert.equal(layeredSchematic(createSchematic(incomplete)),null);
 const tooLarge=structuredClone(d);tooLarge.components=Array.from({length:13},(_,i)=>({...d.components[0],id:'x'+i}));
 assert.equal(layeredSchematic(tooLarge),null);
 const extraNet=structuredClone(d);extraNet.nets.push({id:'N99',endpointKeys:[],boardContacts:['bb::a','bb::b'],x:0,y:0});
 assert.equal(layeredSchematic(extraNet),null);
});
