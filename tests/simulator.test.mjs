import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,validProject} from '../.test-dist/model.js';
import {evaluate,solveDC} from '../.test-dist/core/dc.js';
import {buildNetlist} from '../.test-dist/core/netlist.js';
const wire=(id,from,fp,to,tp)=>({id,from:{componentId:from,pinId:fp},to:{componentId:to,pinId:tp},color:'#e45454'});
test('demo series LED lights at 21.21 mA',()=>{const r=evaluate(demo());assert.equal(r.lit,true);assert.equal(r.currentMilliAmps,21.21)});
test('breaking a wire turns LED off',()=>{const p=demo();p.wires.pop();assert.equal(evaluate(p).lit,false)});
test('import rejects malformed schema and nonexistent pins',()=>{const p=demo();assert.equal(validProject(p),true);p.wires[0].from.pinId='bad';assert.equal(validProject(p),false)});
test('reversing diode polarity turns LED off',()=>{const p=demo();p.wires[1].to.pinId='cathode';p.wires[2].from.pinId='anode';assert.equal(evaluate(p).lit,false)});
test('power source short is detected',()=>{const p=demo();p.wires.push(wire('short','b1','positive','b1','negative'));assert.match(evaluate(p).reason,/短路/)});
test('breadboard strips conduct within a column, not across columns',()=>{
 const nets=buildNetlist(demo());
 const net=pin=>nets.netOf({componentId:'bb1',pinId:pin});
 assert.equal(net('hole-a-1'),net('hole-e-1'));
 assert.notEqual(net('hole-e-1'),net('hole-f-1'));
 assert.notEqual(net('hole-e-1'),net('hole-e-2'));
});
test('breadboard power rails have a break at column 11',()=>{
 const net=pin=>buildNetlist(demo()).netOf({componentId:'bb1',pinId:pin});
 assert.equal(net('top-plus-0'),net('top-plus-10'));
 assert.notEqual(net('top-plus-10'),net('top-plus-11'));
 assert.notEqual(net('top-plus-0'),net('top-minus-0'));
});
test('resistors in parallel are solved by MNA instead of first path',()=>{
 const p=demo();
 p.parts.push({id:'r2',kind:'resistor',x:300,y:300,rotation:0,value:330});
 p.wires.push(wire('w4','b1','positive','r2','a'),wire('w5','r2','b','l1','anode'));
 const result=evaluate(p);
 assert.equal(result.lit,false);
 assert.ok(result.currentMilliAmps>42);
 assert.match(result.reason,/过流/);
});
test('ideal source through a resistor follows Ohm law',()=>{
 const x=solveDC([{a:'hot',b:'gnd',ohms:1000}],[{a:'hot',b:'gnd',volts:5}],'gnd');
 assert.ok(x);
 assert.ok(Math.abs(x.currents[0]+.005)<1e-10);
});
test('unsupported multiple batteries cannot be mistaken for a valid simulation',()=>{
 const p=demo();p.parts.push({id:'b2',kind:'battery',x:0,y:0,rotation:0,value:9});
 assert.equal(evaluate(p).lit,false);
});
test('rotation and movement do not change netlist electrical results',()=>{
 const p=demo();const before=evaluate(p);p.parts[1].rotation=270;p.parts[1].x=888;p.parts[1].y=-120;
 assert.deepEqual(evaluate(p),before);
});
test('breadboard power bus can bridge an LED series route',()=>{
 const p=demo();p.wires[0]=wire('w1','b1','positive','bb1','hole-a-0');
 p.wires.push(wire('w4','bb1','hole-e-0','r1','a'));
 assert.equal(evaluate(p).lit,true);
});

test('component catalogue has 12 distinct visual models with pin definitions',async()=>{
 const {parts,pins}=await import('../.test-dist/model.js');
 assert.equal(parts.length,12);assert.equal(new Set(parts).size,12);
 for(const kind of parts)assert.ok(Object.keys(pins[kind]).length>=2);
});
test('a switched series circuit toggles LED only when closed',()=>{
 const p=demo();p.parts.push({id:'s1',kind:'switch',x:100,y:100,rotation:0,closed:false});
 p.wires[0]=wire('w1','b1','positive','s1','a');
 p.wires.push(wire('sw','s1','b','r1','a'));
 assert.equal(evaluate(p).lit,false);
 p.parts.find(c=>c.id==='s1').closed=true;
 assert.equal(evaluate(p).lit,true);
});

import {snap,pinWorld,wirePoints,wirePath,nearestSegment} from '../.test-dist/core/geometry.js';
test('grid snapping is consistent including negative world-space coordinates',()=>{
 assert.equal(snap(16),20); assert.equal(snap(-16),-20);assert.equal(snap(35,5),35);
 assert.throws(()=>snap(4,0),/Invalid/);
});
test('rotated resistor endpoints follow component transforms',()=>{
 const p=demo(),r=p.parts.find(c=>c.id==='r1');
 r.rotation=90;const left=pinWorld({componentId:'r1',pinId:'a'},p.parts);
 const right=pinWorld({componentId:'r1',pinId:'b'},p.parts);
 assert.ok(left&&right);assert.ok(Math.abs(left.x-right.x)<1e-8);
 assert.ok(right.y>left.y);
});
test('bends change only visual routing, not electrical connectivity',()=>{
 const p=demo(),baseline=evaluate(p),w=p.wires[0];
 w.bends=[{x:123,y:321},{x:246,y:345}];
 assert.equal(validProject(p),true);
 assert.equal(wirePoints(w,p.parts).length,4);
 assert.equal(wirePath(wirePoints(w,p.parts),true).split(' L').length,4);
 assert.deepEqual(evaluate(p),baseline);
});
test('nearest bend position uses segment distance rather than insertion order',()=>{
 assert.equal(nearestSegment([{x:0,y:0},{x:10,y:0},{x:10,y:10}],{x:8,y:9}),1);
 assert.equal(nearestSegment([{x:0,y:0},{x:10,y:0},{x:10,y:10}],{x:5,y:1}),0);
});
test('import rejects invalid wire bends before SVG rendering',()=>{
 const p=demo();p.wires[0].bends=[{x:Infinity,y:0}];assert.equal(validProject(p),false);
 p.wires[0].bends=[{x:20,y:0}];assert.equal(validProject(p),true);
 p.wires[0].bends=Array.from({length:33},()=>({x:2,y:2}));assert.equal(validProject(p),false);
});

import {migrateWorkspace,createProject,saveCurrent,switchProject,deleteProject,activeProject,MAX_PROJECTS} from '../.test-dist/core/storage.js';
import {blankProject} from '../.test-dist/model.js';
test('legacy unversioned drafts migrate to versioned workspace without information loss',()=>{
 const legacy=demo();delete legacy.schemaVersion;
 const store=migrateWorkspace(null,legacy);
 assert.equal(store.activeId,'default');assert.equal(activeProject(store).schemaVersion,2);
 assert.equal(activeProject(store).wires.length,3);
 assert.equal(validProject(activeProject(store)),true);
});
test('multiple projects preserve independent circuits when switching',()=>{
 let w=migrateWorkspace(null,demo());
 w=createProject(w,'two',blankProject(),1000);
 w=saveCurrent(w,{...activeProject(w),name:'Another project'},1001);
 assert.equal(activeProject(w).name,'Another project');
 w=switchProject(w,'default');assert.equal(activeProject(w).name,'我的第一个电路');
 w=switchProject(w,'two');assert.equal(activeProject(w).name,'Another project');
 w=deleteProject(w,'two');assert.equal(w.activeId,'default');assert.equal(w.slots.length,1);
});
test('workspace corruption and foreign schema are rejected without a crash',()=>{
 const good=migrateWorkspace(null,demo());
 const corrupt={...good,slots:[{...good.slots[0],project:{schemaVersion:99}}]};
 assert.equal(migrateWorkspace(corrupt).slots.length,1);
 assert.equal(migrateWorkspace(corrupt).slots[0].project.schemaVersion,2);
 const p=demo();p.schemaVersion=99;assert.equal(validProject(p),false);
});
test('workspace duplicate IDs, excess projects and final delete are rejected',()=>{
 let w=migrateWorkspace(null,demo());
 assert.throws(()=>createProject(w,'default',demo(),3),/already exists/);
 assert.throws(()=>deleteProject(w,'default'),/last project/);
 for(let i=1;i<MAX_PROJECTS;i++)w=createProject(w,'p'+i,blankProject(),i);
 assert.equal(w.slots.length,MAX_PROJECTS);
 assert.throws(()=>createProject(w,'excess',demo(),100),/limit/);
});

import {nearestTerminal,reconnectEndpoint,appendConnection,validTerminal} from '../.test-dist/core/connections.js';
test('rewiring a terminal updates the electrical network without changing the wire identity',()=>{
 const p=demo();
 const updated=reconnectEndpoint(p,'w1','to',{componentId:'bb1',pinId:'hole-a-1'});
 assert.ok(updated);
 assert.equal(updated.wires[0].id,'w1');
 assert.equal(updated.wires[0].color,p.wires[0].color);
 assert.equal(evaluate(p).lit,true);
 assert.equal(evaluate(updated).lit,false);
});
test('rewiring retains bendpoints and does not mutate the previous circuit',()=>{
 const p=demo();p.wires[0].bends=[{x:100,y:100}];
 const updated=reconnectEndpoint(p,'w1','from',{componentId:'bb1',pinId:'hole-e-1'});
 assert.ok(updated);assert.deepEqual(updated.wires[0].bends,[{x:100,y:100}]);
 assert.equal(p.wires[0].from.componentId,'b1');
});
test('rewire refuses invalid or duplicate terminal pairs',()=>{
 const p=demo();
 assert.equal(reconnectEndpoint(p,'w1','from',{componentId:'missing',pinId:'positive'}),null);
 assert.equal(reconnectEndpoint(p,'w1','to',{componentId:'b1',pinId:'positive'}),null);
 p.wires.push(wire('duplicate','b1','positive','bb1','hole-a-0'));
 assert.equal(reconnectEndpoint(p,'w1','to',{componentId:'bb1',pinId:'hole-a-0'}),null);
});
test('adding wires checks terminal existence and rejects repeated connections',()=>{
 const p=demo();
 assert.equal(appendConnection(p,wire('new','r1','a','b1','positive')),null);
 assert.equal(appendConnection(p,wire('new','x','a','r1','a')),null);
 const added=appendConnection(p,wire('new','bb1','hole-a-1','r1','a'));
 assert.ok(added);assert.equal(added.wires.length,p.wires.length+1);
 assert.equal(p.wires.length,3);
});
test('nearest terminal uses rotated pin geometry and breadboard hole positions',()=>{
 const p=demo();p.parts.find(c=>c.id==='r1').rotation=90;
 const world=pinWorld({componentId:'r1',pinId:'a'},p.parts);
 assert.ok(world);
 const hit=nearestTerminal(p,{x:world.x+2,y:world.y-1},4);
 assert.equal(hit?.endpoint.componentId,'r1');
 assert.equal(hit?.endpoint.pinId,'a');
 const hole=pinWorld({componentId:'bb1',pinId:'hole-a-1'},p.parts);
 assert.ok(hole);
 assert.equal(nearestTerminal(p,hole,4)?.endpoint.pinId,'hole-a-1');
 assert.equal(nearestTerminal(p,{x:-5000,y:-5000}),null);
 assert.equal(validTerminal(p,{componentId:'bb1',pinId:'not-a-hole'}),false);
});

import {nearestBreadboardHole,snapPartToBreadboard,reconcileInsertions,insertionTarget} from '../.test-dist/core/placement.js';
test('dropping a resistor near breadboard sockets inserts both legs in distinct columns',()=>{
 const p=demo(),board=p.parts.find(c=>c.id==='bb1'),r=p.parts.find(c=>c.id==='r1');
 r.x=board.x+28+3;r.y=board.y+67-30+2;
 const placed=snapPartToBreadboard(p,'r1');
 const inserted=placed.insertions.filter(i=>i.componentId==='r1');
 assert.equal(inserted.length,2);
 assert.equal(inserted.find(i=>i.pinId==='a').holeId,'hole-a-0');
 assert.equal(inserted.find(i=>i.pinId==='b').holeId,'hole-a-8');
 const a=pinWorld({componentId:'r1',pinId:'a'},placed.parts);
 const boardPad=pinWorld({componentId:'bb1',pinId:'hole-a-0'},placed.parts);
 assert.ok(Math.hypot(a.x-boardPad.x,a.y-boardPad.y)<.001);
 assert.equal(insertionTarget(placed,{componentId:'r1',pinId:'a'}).pinId,'hole-a-0');
 assert.equal(p.insertions,undefined);
});
test('moving an inserted resistor away removes both physical contacts',()=>{
 const p=demo(),board=p.parts.find(c=>c.id==='bb1'),r=p.parts.find(c=>c.id==='r1');
 r.x=board.x+28;r.y=board.y+67-30;
 const placed=snapPartToBreadboard(p,'r1');
 assert.equal(placed.insertions.length,2);
 const moved=structuredClone(placed);moved.parts.find(c=>c.id==='r1').y-=80;
 assert.equal(reconcileInsertions(moved).insertions.length,0);
});
test('breadboard insertions conduct through internal hole strips without explicit wires',()=>{
 const p=demo(),board=p.parts.find(c=>c.id==='bb1'),r=p.parts.find(c=>c.id==='r1');
 r.x=board.x+28;r.y=board.y+67-30;
 const doc=snapPartToBreadboard(p,'r1');
 const net=buildNetlist(doc);
 assert.equal(net.netOf({componentId:'r1',pinId:'a'}),net.netOf({componentId:'bb1',pinId:'hole-e-0'}));
 assert.notEqual(net.netOf({componentId:'r1',pinId:'a'}),net.netOf({componentId:'r1',pinId:'b'}));
});
test('placement requires actual hole proximity and does not connect through board artwork',()=>{
 const p=demo(),board=p.parts.find(c=>c.id==='bb1'),r=p.parts.find(c=>c.id==='r1');
 r.x=board.x+225;r.y=board.y+115;
 assert.equal(nearestBreadboardHole(p,{x:-100,y:-100}),null);
 const placed=snapPartToBreadboard(p,'r1',2);
 assert.ok(placed.insertions.every(i=>i.componentId!=='r1'));
});
test('invalid insertion owners, pad IDs and duplicate leg attachments are rejected',()=>{
 const p=demo();
 p.insertions=[{componentId:'r1',pinId:'a',boardId:'bb1',holeId:'hole-a-0'}];
 assert.equal(validProject(p),true);
 p.insertions.push({...p.insertions[0]});assert.equal(validProject(p),false);
 p.insertions=[{componentId:'r1',pinId:'a',boardId:'bb1',holeId:'plus'}];
 assert.equal(validProject(p),false);
 p.insertions=[{componentId:'a1',pinId:'d13',boardId:'bb1',holeId:'hole-a-0'}];
 assert.equal(validProject(p),false);
});
test('a fully breadboard-routed series resistor and LED gives a valid DC result',()=>{
 const p=demo(),b=p.parts.find(c=>c.id==='bb1'),r=p.parts.find(c=>c.id==='r1'),l=p.parts.find(c=>c.id==='l1');
 r.x=b.x+28;r.y=b.y+67-30;
 l.x=b.x+28+144;l.y=b.y+67-65;
 const contacts=reconcileInsertions(p);
 assert.equal(contacts.insertions.length,4);
 contacts.wires=[
   wire('power','b1','positive','bb1','hole-c-0'),
   wire('ground','b1','negative','bb1','hole-c-14')
 ];
 assert.equal(evaluate(contacts).lit,true);
 assert.equal(evaluate(contacts).currentMilliAmps,21.21);
});
