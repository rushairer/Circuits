import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,validProject} from '../.test-dist/model.js';
import {evaluate} from '../.test-dist/core/dc.js';
import {wirePath,wirePoints} from '../.test-dist/core/geometry.js';
import {nearestOrthogonalSegment,orthogonalWireVertices,slideOrthogonalSegment} from '../.test-dist/core/wire-segments.js';

const wire=(p,id='w1')=>p.wires.find(w=>w.id===id);
const path=(p,id='w1')=>{const w=wire(p,id);return wirePath(wirePoints(w,p.parts),Boolean(w.bends?.length),w.routing)};
const allAxis=(points)=>points.slice(1).every((p,i)=>p.x===points[i].x||p.y===points[i].y);

test('whole interior vertical leg slides horizontally with source and destination attached',()=>{
 const p=demo(),initial=structuredClone(p),initialReport=evaluate(p);
 const start=orthogonalWireVertices(wire(p),p.parts);
 assert.equal(start.length,4);
 const target={x:start[1].x,y:(start[1].y+start[2].y)/2};
 const hit=nearestOrthogonalSegment(wire(p),p.parts,target);
 assert.equal(hit.axis,'vertical');assert.equal(hit.index,1);
 const moved=slideOrthogonalSegment(p,'w1',hit.index,{x:44,y:400},10);
 assert.ok(moved);
 assert.equal(moved.displacement,40);
 assert.deepEqual(moved.project.wires[0].from,p.wires[0].from);
 assert.deepEqual(moved.project.wires[0].to,p.wires[0].to);
 assert.equal(moved.project.wires[0].color,p.wires[0].color);
 assert.equal(moved.project.wires[0].routing,'horizontal');
 const shape=orthogonalWireVertices(wire(moved.project),moved.project.parts);
 assert.deepEqual(shape[0],start[0]);
 assert.deepEqual(shape.at(-1),start.at(-1));
 assert.equal(shape[1].x,start[1].x+40);
 assert.equal(shape[2].x,start[2].x+40);
 assert.equal(shape[1].y,start[1].y);
 assert.equal(shape[2].y,start[2].y);
 assert.equal(allAxis(shape),true);
 assert.equal(validProject(moved.project),true);
 assert.deepEqual(evaluate(moved.project),initialReport);
 assert.deepEqual(p,initial,'a drag MUST NOT mutate its original project snapshot');
 assert.notEqual(path(moved.project),path(p));
});
test('first/last terminal-adjacent wire legs acquire doglegs, never move pins',()=>{
 const base=demo(),source=orthogonalWireVertices(wire(base),base.parts);
 for(const index of [0,source.length-2]){
   const shifted=slideOrthogonalSegment(base,'w1',index,{x:37,y:-25},10);
   assert.ok(shifted);
   const route=orthogonalWireVertices(wire(shifted.project),shifted.project.parts);
   assert.deepEqual(route[0],source[0]);
   assert.deepEqual(route.at(-1),source.at(-1));
   assert.equal(allAxis(route),true);
   assert.equal(validProject(shifted.project),true);
   assert.equal(shifted.project.wires[0].bends.length,3);
 }
 const single=structuredClone(base);
 single.parts.find(p=>p.id==='r1').y=178;
 single.parts.find(p=>p.id==='r1').x=190;
 const src=orthogonalWireVertices(wire(single),single.parts);
 assert.equal(src.length,2);
 const moved=slideOrthogonalSegment(single,'w1',0,{x:100,y:30},10);
 assert.ok(moved);
 assert.equal(moved.project.wires[0].bends.length,2);
 assert.equal(allAxis(orthogonalWireVertices(wire(moved.project),moved.project.parts)),true);
});
test('manual waypoints on a routed wire keep their shape and electrical identity',()=>{
 const p=demo();
 p.wires[0].routing='vertical';
 p.wires[0].bends=[{x:310,y:180},{x:370,y:280}];
 const points=orthogonalWireVertices(wire(p),p.parts);
 assert.ok(points.length>=4);
 const hit=nearestOrthogonalSegment(wire(p),p.parts,{
   x:(points[1].x+points[2].x)/2,y:(points[1].y+points[2].y)/2
 });
 assert.ok(hit);
 const moved=slideOrthogonalSegment(p,'w1',hit.index,{x:25,y:-42},10);
 assert.ok(moved);
 assert.equal(moved.project.wires[0].routing,'vertical');
 assert.equal(allAxis(orthogonalWireVertices(wire(moved.project),moved.project.parts)),true);
 assert.equal(validProject(moved.project),true);
 assert.deepEqual(evaluate(moved.project),evaluate(p));
});
test('legacy literal diagonal wire never silently changes routing or its path',()=>{
 const p=demo();
 p.wires[0].bends=[{x:325,y:321}];
 assert.equal(orthogonalWireVertices(wire(p),p.parts),null);
 assert.equal(nearestOrthogonalSegment(wire(p),p.parts,{x:315,y:310}),null);
 assert.equal(slideOrthogonalSegment(p,'w1',0,{x:20,y:10},10),null);
 assert.equal(p.wires[0].routing,undefined);
});
test('path end caps, invalid deltas and dense 32 waypoint limit fail safely',()=>{
 const p=demo(),w=wire(p);
 const points=orthogonalWireVertices(w,p.parts);
 assert.equal(slideOrthogonalSegment(p,'w1',-1,{x:10,y:10}),null);
 assert.equal(slideOrthogonalSegment(p,'w1',points.length-1,{x:10,y:10}),null);
 assert.equal(slideOrthogonalSegment(p,'w1',0,{x:0,y:0}),null);
 assert.equal(slideOrthogonalSegment(p,'w1',0,{x:NaN,y:12}),null);
 assert.equal(slideOrthogonalSegment(p,'w1',0,{x:20,y:3},10),null);
 assert.equal(slideOrthogonalSegment(p,'w1',0,{x:20,y:110000}),null);
 assert.equal(nearestOrthogonalSegment(w,p.parts,{x:Infinity,y:0}),null);
 p.wires[0].routing='horizontal';
 p.wires[0].bends=Array.from({length:32},(_,i)=>({x:220+i*4,y:i%2===0?208:225}));
 const original=structuredClone(p);
 assert.equal(slideOrthogonalSegment(p,'w1',0,{x:0,y:30},10),null);
 assert.deepEqual(p,original);
});
test('one dragged routed segment remains straight after an endpoint part moves',()=>{
 const p=demo();
 const moved=slideOrthogonalSegment(p,'w1',1,{x:30,y:180},10);
 assert.ok(moved);
 const before=path(moved.project);
 moved.project.parts.find(p=>p.id==='r1').y+=75;
 const after=path(moved.project);
 assert.notEqual(before,after);
 assert.equal(allAxis(orthogonalWireVertices(wire(moved.project),moved.project.parts)),true);
 assert.equal(validProject(moved.project),true);
});
