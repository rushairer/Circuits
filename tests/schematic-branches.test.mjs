import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject,demo} from '../.test-dist/model.js';
import {createSchematic} from '../.test-dist/core/schematic.js';
import {schematicBranches} from '../.test-dist/core/schematic-branches.js';
import {schematicSvg,renderSchematicWorkspace} from '../.test-dist/ui/schematic-panel.js';
import {branchSheetSize} from '../.test-dist/ui/schematic-branch-view.js';

function fixture(){
 const p=blankProject();
 p.parts=[
  {id:'battery',kind:'battery',x:0,y:0,rotation:0,value:9},
  {id:'r',kind:'resistor',x:100,y:0,rotation:0,value:330},
  {id:'led',kind:'led',x:200,y:0,rotation:0},
  {id:'r2',kind:'resistor',x:300,y:0,rotation:0,value:1000}
 ];
 const connect=(a,ap,b,bp)=>({id:'w'+p.wires.length,from:{componentId:a,pinId:ap},to:{componentId:b,pinId:bp},color:'#35b65d'});
 p.wires.push(connect('battery','positive','r','a'));
 p.wires.push(connect('r','b','led','cathode'));
 p.wires.push(connect('led','anode','battery','negative'));
 p.wires.push(connect('battery','positive','r2','a'));
 p.wires.push(connect('r2','b','battery','negative'));
 return p;
}
test('complete parallel branches follow real terminal identities and retain reversed LED polarity',()=>{
 const p=fixture(),before=structuredClone(p),d=createSchematic(p);
 assert.equal(d.ok,true);
 const layout=schematicBranches(d);
 assert.ok(layout);
 assert.deepEqual(layout.branches.map(b=>b.map(s=>s.component.id)),[['r','led'],['r2']]);
 assert.equal(layout.branches[0][1].from.pinId,'cathode');
 assert.equal(layout.branches[0][1].to.pinId,'anode');
 const svg=schematicSvg(d);
 assert.match(svg,/data-schematic-route-mode="branches"/);
 assert.match(svg,/rotate\(180 /);
 assert.equal((svg.match(/class="sch-net"/g)||[]).length,d.nets.length);
 assert.equal((svg.match(/class="sch-terminal"/g)||[]).length,8);
 assert.equal((svg.match(/class="sch-symbol"/g)||[]).length,4);
 assert.equal((svg.match(/class="sch-crossover"/g)||[]).length,0);
 for(const c of d.components)for(const t of c.terminals)
  assert.ok(svg.includes('data-terminal="'+c.id+'::'+t.pinId+'" data-schematic-net="'+t.netId+'"'));
 const {width,height}=branchSheetSize(layout);
 assert.ok(renderSchematicWorkspace(d,1.5).includes('width:'+Math.round(width*1.5)+'px;height:'+Math.round(height*1.5)+'px'));
 assert.deepEqual(p,before);
 const moved=structuredClone(p);
 moved.parts.reverse();moved.wires.reverse();
 for(const part of moved.parts){part.x+=500;part.rotation+=90;}
 assert.equal(schematicSvg(createSchematic(moved)),svg);
});
test('unsupported networks retain complete original projection',()=>{
 assert.equal(schematicBranches(createSchematic(demo())),null);
 const p=fixture();
 p.parts.push({id:'extra',kind:'resistor',x:0,y:0,rotation:0,value:100});
 assert.equal(schematicBranches(createSchematic(p)),null);
 assert.doesNotMatch(schematicSvg(createSchematic(p)),/data-schematic-route-mode="branches"/);
 const d=createSchematic(fixture());
 d.nets.push({id:'N99',x:770,y:100,endpointKeys:[],boardContacts:['bb::a','bb::b']});
 assert.equal(schematicBranches(d),null);
});
test('branch export escapes imported text and never invents earth ground',()=>{
 const p=fixture();p.name='<script>bad</script>';p.parts[1].name='<img src=x onerror=bad>';
 const svg=schematicSvg(createSchematic(p));
 assert.match(svg,/&lt;script&gt;bad&lt;\/script&gt;/);
 assert.match(svg,/&lt;img src=x onerror=bad&gt;/);
 assert.doesNotMatch(svg,/<script\b|<img\b|<foreignObject\b/i);
 assert.match(svg,/电池负端不代表大地接地/);
});
