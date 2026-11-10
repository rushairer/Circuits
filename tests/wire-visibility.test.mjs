import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,validProject} from '../.test-dist/model.js';
import {evaluate} from '../.test-dist/core/dc.js';
import {visibleWireVertices,visibleWirePath,enableClearanceRouting,AUTO_ROUTE_PART_LIMIT} from '../.test-dist/core/wire-visibility.js';
import {orthogonalRoute,wirePoints} from '../.test-dist/core/geometry.js';
import {paintCrossingWires} from '../.test-dist/core/wire-crossings.js';
import {wirePickCandidates} from '../.test-dist/core/wire-picking.js';
import {nearestOrthogonalSegment,slideOrthogonalSegment} from '../.test-dist/core/wire-segments.js';
import {insertWireWaypoint} from '../.test-dist/core/wire-edit.js';

const sample=()=>{
 const p=demo();
 p.parts=[
  {id:'left',kind:'resistor',x:0,y:100,rotation:0,value:220},
  {id:'obstacle',kind:'battery',x:230,y:72,rotation:0,value:9},
  {id:'right',kind:'resistor',x:470,y:100,rotation:0,value:220}
 ];
 p.wires=[{id:'w1',from:{componentId:'left',pinId:'b'},to:{componentId:'right',pinId:'a'},
  color:'#159f91',routing:'horizontal',autoAvoid:true}];
 p.insertions=[];return p;
};
const path=p=>visibleWireVertices(p.wires[0],p.parts);
const isOrthogonal=a=>a.slice(1).every((p,i)=>p.x===a[i].x||p.y===a[i].y);
const intersects=(a,b,rect)=>a.y===b.y?
 a.y>rect.top&&a.y<rect.bottom&&Math.max(Math.min(a.x,b.x),rect.left)<Math.min(Math.max(a.x,b.x),rect.right):
 a.x===b.x&&a.x>rect.left&&a.x<rect.right&&Math.max(Math.min(a.y,b.y),rect.top)<Math.min(Math.max(a.y,b.y),rect.bottom);
test('routed jumper detours visibly around blocking component and keeps terminal coordinates',()=>{
 const p=sample(),snapshot=structuredClone(p),before=evaluate(p),verts=path(p);
 assert.ok(verts.length>=4);
 assert.equal(isOrthogonal(verts),true);
 assert.deepEqual(verts[0],{x:140,y:130});
 assert.deepEqual(verts.at(-1),{x:470,y:130});
 const obstruction={left:230-13,top:72-13,right:230+92+13,bottom:72+135+13};
 for(let i=1;i<verts.length;i++)
  assert.equal(intersects(verts[i-1],verts[i],obstruction),false);
 assert.equal(visibleWirePath(p.wires[0],p.parts),'M'+verts.map(v=>v.x+' '+v.y).join(' L'));
 assert.deepEqual(evaluate(p),before);
 assert.deepEqual(p,snapshot);
 assert.equal(validProject(p),true);
});
test('natural route straightens when blocker moves; vertical preference is supported',()=>{
 const p=sample();
 const withBlock=path(p),original=structuredClone(p);
 p.parts[1].y+=430;
 const clear=path(p);
 assert.equal(isOrthogonal(clear),true);
 assert.ok(clear.length<=withBlock.length);
 assert.equal(p.wires[0].bends,undefined);
 p.wires[0].routing='vertical';
 const alternate=path(p);
 assert.equal(isOrthogonal(alternate),true);
 assert.deepEqual(alternate[0],clear[0]);
 assert.deepEqual(alternate.at(-1),clear.at(-1));
 assert.equal(original.parts[1].y,72);
});
test('manual bends and old serialized untagged wire shapes are never altered',()=>{
 const p=sample();
 const w=p.wires[0],pins=wirePoints(w,p.parts);
 w.bends=[{x:255,y:270}];
 assert.deepEqual(path(p),orthogonalRoute(wirePoints(w,p.parts),'horizontal'));
 delete w.routing;delete w.bends;
 const legacy=path(p);
 const mx=(pins[0].x+pins.at(-1).x)/2;
 assert.deepEqual(legacy,[pins[0],{x:mx,y:pins[0].y},{x:mx,y:pins.at(-1).y},pins.at(-1)]);
});
test('300-part project still detours around nearby devices instead of always degrading to a straight line',()=>{
 const p=sample();
 for(let i=0;i<297;i++)p.parts.push({
  id:'away-'+i,kind:'resistor',x:8000+i*150,y:9500,rotation:0,value:220
 });
 assert.equal(p.parts.length,AUTO_ROUTE_PART_LIMIT);
 const actual=path(p),fallback=orthogonalRoute(wirePoints(p.wires[0],p.parts),'horizontal');
 assert.equal(isOrthogonal(actual),true);
 assert.notDeepEqual(actual,fallback);
 const blocker={left:217,right:335,top:59,bottom:220};
 for(let i=1;i<actual.length;i++)
  assert.equal(intersects(actual[i-1],actual[i],blocker),false);
});
test('dense project bounds auto-router work and preserves canonical fallback',()=>{
 const p=sample(),other=p.parts.find(x=>x.id==='obstacle');
 for(let i=0;i<AUTO_ROUTE_PART_LIMIT;i++)
  p.parts.push({...other,id:'extra-'+i,x:8000+i*100,y:9000});
 assert.deepEqual(path(p),orthogonalRoute(wirePoints(p.wires[0],p.parts),'horizontal'));
 const legacy={...p,wires:[{...p.wires[0],routing:undefined}]};
 assert.equal(isOrthogonal(path(legacy)),true);
});


test('actual stroke, hit-test and segment dragging see the same clearance detour',()=>{
 const p=sample(),vertices=path(p);
 const painted=paintCrossingWires(p.wires,p.parts);
 assert.equal(painted[0].hitPath,'M'+vertices.map(x=>x.x+' '+x.y).join(' L'));
 const middle=vertices.findIndex((point,i)=>i>0&&point.y!==130);
 assert.ok(middle>0);
 const a=vertices[middle-1],b=vertices[middle];
 const at={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
 const picked=wirePickCandidates(p.wires,p.parts,at,1,7);
 assert.equal(picked[0]?.id,'w1');
 const selected=nearestOrthogonalSegment(p.wires[0],p.parts,at);
 assert.ok(selected);
 assert.ok(selected.distance<1e-6);
 const displacement=selected.axis==='vertical'?{x:16,y:0}:{x:0,y:16};
 const slid=slideOrthogonalSegment(p,'w1',selected.index,displacement,1);
 assert.ok(slid);
 assert.equal(slid.project.wires[0].from.pinId,'b');
 assert.equal(slid.project.wires[0].to.pinId,'a');
 assert.ok(slid.project.wires[0].bends.length>0);
 assert.equal(isOrthogonal(visibleWireVertices(slid.project.wires[0],slid.project.parts)),true);
});
test('converting the auto-detour into manual bends never teleports the wire through a blocker',()=>{
 const p=sample(),old=path(p);
 const leg=old.findIndex((x,i)=>i>0&&x.y!==old[i-1].y);
 assert.ok(leg>0);
 const center={x:(old[leg-1].x+old[leg].x)/2,
               y:(old[leg-1].y+old[leg].y)/2};
 const changed=insertWireWaypoint(p,'w1',center,null);
 assert.ok(changed);
 assert.ok(changed.project.wires[0].bends.length>=old.length-2);
 assert.ok(changed.index>=0);
 const revised=visibleWireVertices(changed.project.wires[0],changed.project.parts);
 assert.equal(isOrthogonal(revised),true);
 assert.deepEqual(revised[0],old[0]);
 assert.deepEqual(revised.at(-1),old.at(-1));
 assert.deepEqual(p.wires[0].bends,undefined);
});


test('opt-in upgrades legacy auto wires as one immutable visual edit; manual bends remain sacred',()=>{
 const p=demo(),before=structuredClone(p),analysis=evaluate(p);
 p.wires[1].bends=[{x:600,y:110}];
 const saved=structuredClone(p);
 const changed=enableClearanceRouting(p);
 assert.notEqual(changed,p);
 assert.equal(changed.wires[0].routing,'horizontal');
 assert.equal(changed.wires[0].autoAvoid,true);
 assert.equal(changed.wires[1].routing,undefined);
 assert.equal(changed.wires[1].autoAvoid,undefined);
 assert.deepEqual(changed.wires[1].bends,[{x:600,y:110}]);
 assert.equal(changed.wires[2].routing,'horizontal');
 assert.deepEqual(changed.wires.map(w=>({id:w.id,from:w.from,to:w.to,color:w.color})),
   p.wires.map(w=>({id:w.id,from:w.from,to:w.to,color:w.color})));
 assert.deepEqual(p,saved);
 assert.deepEqual(evaluate(changed),evaluate(p));
 assert.strictEqual(enableClearanceRouting(changed),changed);
 const subset=enableClearanceRouting(p,new Set(['w3']));
 assert.equal(subset.wires[0].routing,undefined);
 assert.equal(subset.wires[2].routing,'horizontal');
 assert.deepEqual(before.wires[1].bends,undefined);
});


test('fractional-coordinate leads remain exactly orthogonal without six-decimal jumps',()=>{
 const p=sample();
 p.parts[0].x=0.123456789;p.parts[0].y=100.876543211;
 p.parts[1].x=230.456789123;p.parts[1].y=72.987654321;
 p.parts[2].x=470.123456789;p.parts[2].y=100.876543211;
 const points=path(p);
 assert.ok(points.length>=4);
 assert.equal(isOrthogonal(points),true);
 assert.equal(points[0].x,140.123456789);
 assert.equal(points.at(-1).x,470.123456789);
 assert.equal(points[0].y,130.876543211);
 assert.equal(points.at(-1).y,130.876543211);
});


test('even in a crowded diagram connected component bodies remain protected obstacles',()=>{
 const p=sample();
 // Numerous nearby but not overlapping decorative modules would normally
 // consume the limited obstacle candidates before late-sorted terminal IDs.
 p.parts[0].id='zz-left';
 p.parts[2].id='zz-right';
 p.wires[0].from.componentId='zz-left';
 p.wires[0].to.componentId='zz-right';
 for(let i=0;i<22;i++)p.parts.push({
  id:'aa-'+i,kind:'resistor',x:160+i*12,y:270+i%2*65,rotation:0,value:220
 });
 const points=path(p);
 assert.equal(isOrthogonal(points),true);
 assert.deepEqual(points[0],{x:140,y:130});
 assert.deepEqual(points.at(-1),{x:470,y:130});
 const left={left:-13,right:153,top:87,bottom:173};
 const right={left:457,right:623,top:87,bottom:173};
 // Intermediate segments must not tunnel through either attached device.
 for(let i=2;i<points.length-1;i++){
  assert.equal(intersects(points[i-1],points[i],left),false);
  assert.equal(intersects(points[i-1],points[i],right),false);
 }
});


test('old routed HV/VH shapes retain their exact slide and click coordinates until opt-in',()=>{
 const p=demo(),w={...p.wires[0],routing:'horizontal'};
 const pts=wirePoints(w,p.parts),old=orthogonalRoute(pts,'horizontal');
 assert.deepEqual(visibleWireVertices(w,p.parts),old);
 assert.equal(paintCrossingWires([w],p.parts)[0].hitPath,
   'M'+old.map(t=>t.x+' '+t.y).join(' L'));
 assert.equal(nearestOrthogonalSegment(w,p.parts,{x:255,y:208})?.axis,'horizontal');
 const flagged={...w,autoAvoid:true};
 assert.notDeepEqual(visibleWireVertices(flagged,p.parts),old);
 assert.equal(validProject({...p,wires:[flagged]}),true);
 assert.equal(validProject({...p,wires:[{...w,autoAvoid:'unsafe'}]}),false);
 assert.equal(validProject({...p,wires:[{...p.wires[0],autoAvoid:true}]}),false);
});
test('smart upgrade retains manually selected direction on a legacy routed wire',()=>{
 const p=demo();p.wires[0].routing='vertical';
 const routed=enableClearanceRouting(p,new Set(['w1']));
 assert.equal(routed.wires[0].routing,'vertical');
 assert.equal(routed.wires[0].autoAvoid,true);
 assert.equal(routed.wires[1].autoAvoid,undefined);
 assert.strictEqual(enableClearanceRouting(routed,new Set(['w1'])),routed);
});


test('routed wire with 20+ nearby components never cuts through an omitted visual obstacle',()=>{
 const p=sample();
 // A staggered bank forces the route to evaluate all nearby bodies. When
 // bounded graph selection cannot certify clearance, a perimeter lane is used.
 for(let i=0;i<24;i++)p.parts.push({
   id:'bank-'+i,kind:'resistor',
   x:175+i*10,y:i%3===0?52:i%3===1?152:250,
   rotation:0,value:220
 });
 const vertices=path(p);
 const fullBoxes=p.parts.slice(1).map(b=>({
  left:b.x-13,right:b.x+(b.kind==='resistor'?140:92)+13,
  top:b.y-13,bottom:b.y+(b.kind==='resistor'?60:135)+13
 }));
 assert.equal(isOrthogonal(vertices),true);
 // The initial/final pin-to-exit lead is allowed inside its own device;
 // every free-space leg must avoid the bank of unrelated bodies.
 for(let i=2;i<vertices.length-2;i++){
  const a=vertices[i-1],b=vertices[i];
  for(const rect of fullBoxes.slice(1,-1)){
   assert.equal(intersects(a,b,rect),false);
  }
 }
});
