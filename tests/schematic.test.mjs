import test from 'node:test';
import assert from 'node:assert/strict';
import { blankProject, demo } from '../.test-dist/model.js';
import { buildNetlist } from '../.test-dist/core/netlist.js';
import { createSchematic,SCHEMATIC_MAX_COMPONENTS } from '../.test-dist/core/schematic.js';
import { renderSchematicPanel,schematicSvg } from '../.test-dist/ui/schematic-panel.js';
import { routeSchematic } from '../.test-dist/core/schematic-routing.js';

const terminal=(diagram,id,pin)=>
 diagram.components.find(c=>c.id===id)?.terminals.find(t=>t.pinId===pin);

test('demo electrical schematic has three distinct connected nets, ignores unused breadboard sockets',()=>{
 const project=demo(),snapshot=structuredClone(project);
 const diagram=createSchematic(project);
 assert.equal(diagram.ok,true);
 assert.equal(diagram.components.length,4);
 assert.equal(diagram.nets.length,3);
 assert.equal(diagram.wireCount,3);
 assert.equal(diagram.insertionCount,0);
 assert.equal(diagram.unconnectedTerminals,3);
 assert.equal(terminal(diagram,'b1','positive').netId,terminal(diagram,'r1','a').netId);
 assert.equal(terminal(diagram,'r1','b').netId,terminal(diagram,'l1','anode').netId);
 assert.equal(terminal(diagram,'l1','cathode').netId,terminal(diagram,'b1','negative').netId);
 assert.notEqual(terminal(diagram,'b1','positive').netId,terminal(diagram,'b1','negative').netId);
 assert.equal(terminal(diagram,'a1','d13').netId,null);
 assert.equal(terminal(diagram,'a1','gnd').netId,null);
 assert.ok(diagram.nets.every(net=>net.endpointKeys.length===2&&net.boardContacts.length===0));
 assert.equal(project.parts.length,5);
 assert.deepEqual(project,snapshot);
});

test('net ID projection is invariant under screen coordinates, manual bends, wire colors and list order',()=>{
 const project=demo(),before=createSchematic(project);
 const changed=structuredClone(project);
 for(const part of changed.parts){part.x+=170;part.y-=83;part.rotation+=90;}
 changed.wires.reverse();
 for(const wire of changed.wires){
   wire.color='#abcdef';
   wire.type='alligator';
   wire.bends=[{x:100,y:50},{x:140,y:70}];
   wire.routing='vertical';
 }
 const after=createSchematic(changed);
 assert.equal(after.ok,true);
 assert.deepEqual(after.components,before.components);
 assert.deepEqual(after.nets,before.nets);
 assert.equal(after.height,before.height);
 assert.equal(after.unconnectedTerminals,before.unconnectedTerminals);
});

test('two geometric crossing wires do not become a false electrical junction',()=>{
 const p=blankProject();
 p.parts=['a','b','c','d'].map((id,i)=>({
   id,kind:'resistor',x:i*70,y:i%2?100:0,rotation:0,value:220
 }));
 p.wires=[
  {id:'w1',from:{componentId:'a',pinId:'a'},to:{componentId:'b',pinId:'b'},color:'#4a4a4a',bends:[{x:90,y:90}]},
  {id:'w2',from:{componentId:'c',pinId:'a'},to:{componentId:'d',pinId:'b'},color:'#4a4a4a',bends:[{x:90,y:10}]}
 ];
 const d=createSchematic(p);
 assert.equal(d.ok,true);
 assert.equal(d.nets.length,2);
 assert.notEqual(terminal(d,'a','a').netId,terminal(d,'c','a').netId);
 assert.equal(terminal(d,'a','a').netId,terminal(d,'b','b').netId);
 assert.equal(terminal(d,'c','a').netId,terminal(d,'d','b').netId);
 assert.equal(buildNetlist(p).netOf(p.wires[0].from)===buildNetlist(p).netOf(p.wires[1].from),false);
});

test('breadboard internal strip and physical resistor lead insertions share one real net',()=>{
 const p=blankProject();
 p.parts=[
  {id:'bb1',kind:'breadboard',x:0,y:0,rotation:0},
  {id:'r1',kind:'resistor',x:100,y:10,rotation:0,value:100},
  {id:'r2',kind:'resistor',x:250,y:10,rotation:0,value:100}
 ];
 p.insertions=[
  {componentId:'r1',pinId:'a',boardId:'bb1',holeId:'hole-a-3'},
  {componentId:'r2',pinId:'a',boardId:'bb1',holeId:'hole-e-3'}
 ];
 const d=createSchematic(p);
 assert.equal(d.ok,true);
 assert.equal(d.nets.length,1);
 assert.equal(terminal(d,'r1','a').netId,terminal(d,'r2','a').netId);
 assert.deepEqual(d.nets[0].boardContacts,['bb1::hole-a-3','bb1::hole-e-3']);
 assert.equal(d.insertionCount,2);
 assert.equal(d.nets[0].endpointKeys.length,2);
 assert.equal(terminal(d,'r1','b').netId,null);
});

test('breadboard rails respect their actual split: left-half contacts do not join right-half',()=>{
 const p=blankProject();
 p.parts=[
  {id:'bb1',kind:'breadboard',x:0,y:0,rotation:0},
  ...['r1','r2','r3'].map((id,i)=>({
   id,kind:'resistor',x:10+i*100,y:280,rotation:0,value:220
  }))
 ];
 p.wires=[
  {id:'w1',from:{componentId:'r1',pinId:'a'},to:{componentId:'bb1',pinId:'top-plus-0'},color:'#12bdaa'},
  {id:'w2',from:{componentId:'r2',pinId:'a'},to:{componentId:'bb1',pinId:'top-plus-10'},color:'#12bdaa'},
  {id:'w3',from:{componentId:'r3',pinId:'a'},to:{componentId:'bb1',pinId:'top-plus-11'},color:'#12bdaa'}
 ];
 const d=createSchematic(p);
 assert.equal(d.ok,true);
 assert.equal(d.nets.length,2);
 assert.equal(terminal(d,'r1','a').netId,terminal(d,'r2','a').netId);
 assert.notEqual(terminal(d,'r3','a').netId,terminal(d,'r1','a').netId);
 assert.ok(d.nets.some(net=>net.boardContacts.includes('bb1::top-plus-11')));
});

test('ideal closed switches join nets; resistive contacts and open switches do not',()=>{
 const p=blankProject();
 p.parts=[{id:'s1',kind:'switch',x:100,y:100,rotation:0,closed:false}];
 const open=createSchematic(p);
 assert.equal(open.ok,true);
 assert.equal(open.nets.length,0);
 const ideal=createSchematic({...p,parts:[{...p.parts[0],closed:true,contactOhms:0}]});
 assert.equal(ideal.ok,true);
 assert.equal(ideal.nets.length,1);
 assert.equal(terminal(ideal,'s1','a').netId,terminal(ideal,'s1','b').netId);
 const resistive=createSchematic({...p,parts:[{...p.parts[0],closed:true,contactOhms:100}]});
 assert.equal(resistive.ok,true);
 assert.equal(resistive.nets.length,0);
});

test('SVG viewer escapes all project names and endpoint metadata and keeps no executable markup',()=>{
 const p=demo();
 p.name='<img src=x onerror=alert(1)> & "Project"';
 p.parts.find(x=>x.id==='l1').ledColor='blue';
 const d=createSchematic(p);
 assert.equal(d.ok,true);
 const markup=schematicSvg(d);
 assert.match(markup,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(markup,/<img\b|<script\b|<foreignObject\b/i);
 assert.match(markup,/class="schematic-svg sch-root"/);
 assert.equal((markup.match(/class="sch-net"/g)||[]).length,d.nets.length);
 assert.equal((markup.match(/class="sch-link"/g)||[]).length,6);
 assert.match(markup,/data-schematic-route-mode="orthogonal"/);
 assert.match(markup,/class="sch-bus"/);
 assert.doesNotMatch(markup,/ C[0-9.]+ /);
 assert.equal((markup.match(/class="sch-terminal"/g)||[]).length,9);
 const panel=renderSchematicPanel(d);
 assert.match(panel,/role="dialog" aria-modal="true"/);
 assert.match(panel,/data-action="schematic-export"/);
 assert.match(panel,/同一 N 编号/);
 assert.doesNotMatch(panel,/<img\b/i);
});

test('schematic refuses overly large documents rather than returning a misleading partial electrical diagram',()=>{
 const p=blankProject();
 for(let i=0;i<SCHEMATIC_MAX_COMPONENTS+1;i++){
   p.parts.push({id:'r'+i,kind:'resistor',x:i*10,y:5,rotation:0,value:100});
 }
 const unavailable=createSchematic(p);
 assert.equal(unavailable.ok,false);
 assert.match(unavailable.reason,/超过/);
 const html=renderSchematicPanel(unavailable);
 assert.match(html,/暂不能生成完整原理图/);
 assert.match(html,/disabled/);
 assert.doesNotMatch(html,/class="schematic-svg/);
});

test('empty circuits render a safe explicit empty diagram with no invented wires or nets',()=>{
 const diagram=createSchematic(blankProject());
 assert.equal(diagram.ok,true);
 assert.equal(diagram.nets.length,0);
 assert.equal(diagram.components.length,0);
 assert.equal(diagram.wireCount,0);
 assert.match(schematicSvg(diagram),/尚无元件/);
});

test('large collections of breadboards reject before creating expensive internal union graph',()=>{
 const p=blankProject();
 p.parts=Array.from({length:25},(_,i)=>({
   id:'board'+i,kind:'breadboard',x:i*10,y:0,rotation:0
 }));
 const d=createSchematic(p);
 assert.equal(d.ok,false);
 assert.match(d.reason,/面包板数量超过/);
 assert.equal(p.parts.length,25);
});

test('schematic orthogonal trunks share only real net identities and retain deterministic reference designators',()=>{
 const p=demo(),d=createSchematic(p);
 assert.equal(d.ok,true);
 const routes=routeSchematic(d);
 assert.equal(routes.mode,'orthogonal');
 assert.equal(routes.links.length,6);
 assert.equal(routes.buses.length,3);
 assert.equal(d.components.find(c=>c.id==='r1').reference,'R1');
 assert.equal(d.components.find(c=>c.id==='l1').reference,'D1');
 for(const link of routes.links){
   assert.equal(typeof link.x1,'number');
   assert.ok(link.x2>link.x1);
   assert.ok(d.nets.some(n=>n.id===link.netId));
 }
 const markup=schematicSvg(d);
 assert.match(markup,/d="M\d+ \d+ H\d+"/);
 assert.match(markup,/class="sch-junction"/);
 assert.doesNotMatch(markup,/ C\d+ \d+ /);
});

test('different-net trunk crossings are bridged visually without assigning a junction or changing Netlist',()=>{
 const p=blankProject();
 p.parts=['r1','r2','r3','r4'].map((id,i)=>({
   id,kind:'resistor',x:80+i*170,y:50,rotation:0,value:220
 }));
 p.wires=[
  {id:'w1',from:{componentId:'r1',pinId:'a'},to:{componentId:'r4',pinId:'a'},color:'#00ff00'},
  {id:'w2',from:{componentId:'r2',pinId:'a'},to:{componentId:'r3',pinId:'a'},color:'#000000'}
 ];
 const before=structuredClone(p),d=createSchematic(p);
 assert.equal(d.ok,true);
 const routed=routeSchematic(d);
 assert.equal(routed.mode,'orthogonal');
 assert.ok(routed.crossings.length>=1);
 assert.ok(routed.crossings.every(c=>c.horizontalNet!==c.verticalNet));
 const svg=schematicSvg(d);
 assert.match(svg,/class="sch-crossover"/);
 assert.notEqual(terminal(d,'r1','a').netId,terminal(d,'r2','a').netId);
 assert.deepEqual(p,before);
});

test('schematic view has read-only bounded zoom controls and safe large-scene label fallback',()=>{
 const result=createSchematic(demo());
 assert.equal(result.ok,true);
 const panel=renderSchematicPanel(result,1.5);
 assert.match(panel,/data-action="schematic-zoom-in"/);
 assert.match(panel,/data-action="schematic-zoom-out"/);
 assert.match(panel,/150%/);
 assert.match(panel,/class="schematic-sheet" style="width:1485px/);
 const crowded=structuredClone(result);
 crowded.nets=Array.from({length:32},(_,i)=>({
   id:'N'+(i+1),x:1000,y:110+i*56,endpointKeys:[],boardContacts:[]
 }));
 assert.equal(routeSchematic(crowded).mode,'orthogonal');
});
